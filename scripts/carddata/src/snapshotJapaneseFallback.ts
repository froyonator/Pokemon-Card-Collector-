import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { downloadAndValidateImage } from './downloadImage';
import { fetchHtmlWithRetry } from './fetchHtml';
import {
  isPokemonCard,
  parseJapaneseFallbackDetail,
  parseJapaneseFallbackSetList,
  parseJapaneseFallbackSetPage,
} from './parseJapaneseFallback';
import { createPoliteScheduler } from './politeScheduler';

function options(args: string[]): { setId?: string; delayMs: number } {
  let setId: string | undefined;
  let delayMs = 750;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value) throw new Error(`${flag} requires a value.`);
    if (flag === '--set') setId = value;
    else if (flag === '--delay-ms') delayMs = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(delayMs) || delayMs < 250)
    throw new Error('--delay-ms must be at least 250.');
  return { setId, delayMs };
}

async function main(): Promise<void> {
  const { setId, delayMs } = options(process.argv.slice(2));
  const schedule = createPoliteScheduler(delayMs);
  const politeHtml = (url: string) => schedule(() => fetchHtmlWithRetry(url));
  const politeImage = (url: string) => schedule(() => downloadAndValidateImage(url));
  const snapshotId = `japanese-fallback-ja-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const staging = path.join('data', `.${snapshotId}.staging`);
  const output = path.join('data', snapshotId);
  let published = false;
  await mkdir(staging, { recursive: false });
  try {
    const allSets = parseJapaneseFallbackSetList(await politeHtml('https://www.artofpkm.com/cards'));
    const sets = setId ? allSets.filter((set) => set.setId === setId) : allSets;
    if (!sets.length) throw new Error(`Japanese fallback set not found: ${setId ?? '(all)'}`);
    let cardCount = 0;
    let skippedCount = 0;
    const manifests: Array<{ id: string; name: string; cardCount: number }> = [];
    const failures: Array<{ url: string; error: string }> = [];

    // A card's OWN detail page can report the same sourceCardId under more
    // than one listing URL within a set (e.g. a bundle-style set page that
    // lists the same physical card at more than one position/photo) --
    // parseJapaneseFallbackSetPage's own dedup only catches duplicates that already
    // share one identical URL on the listing page, not two different URLs
    // that each resolve, once fetched, to the same underlying card. Tracked
    // globally (not just per-set) since nothing rules out the same card
    // appearing under two different sets' listings either. Without this,
    // the second attempt's `mkdir(cardDir, { recursive: false })` throws
    // EEXIST -- a real card that WAS already captured successfully, logged
    // as a failure purely from re-processing something already done.
    const seenCardDirs = new Set<string>();

    for (const set of sets) {
      let links;
      try {
        links = parseJapaneseFallbackSetPage(await politeHtml(set.url), set.setId);
        if (!links.length) throw new Error(`No card links found for ${set.url}`);
      } catch (error) {
        // Same reasoning as the per-card catch below: one unreachable/empty
        // set page must not discard every other set already harvested.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  FAILED set ${set.url}: ${message}`);
        failures.push({ url: set.url, error: message });
        continue;
      }
      console.log(`Fetching ${set.name}: ${links.length} cards`);
      const setDir = path.join(staging, 'ja', set.setId);
      await mkdir(setDir, { recursive: true });
      for (const link of links) {
        try {
          const parsedRecord = parseJapaneseFallbackDetail(await politeHtml(link.url), link.url);
          // Falls back to the Japanese name when the site has no official
          // English localization for a card (some Trainer/Item cards) --
          // this is a `language: 'ja'` snapshot, so a Japanese-only name is
          // a valid identity, not a parse failure.
          const record = {
            ...parsedRecord,
            name: parsedRecord.name || parsedRecord.japaneseName || link.name,
          };
          if (!isPokemonCard(record)) {
            console.log(`  SKIP ${link.url}: not a Pokemon card`);
            skippedCount++;
            continue;
          }
          if (!record.name || !record.expansionId || !record.imageUrl) {
            throw new Error(`Invalid Japanese fallback detail page: ${link.url}`);
          }
          const cardDir = path.join(setDir, record.sourceCardId);
          if (seenCardDirs.has(cardDir)) {
            console.log(`  SKIP ${link.url}: already captured as ${cardDir} via another listing`);
            skippedCount++;
            continue;
          }
          const image = await politeImage(record.imageUrl);
          if ('error' in image) throw new Error(`Image failed for ${link.url}: ${image.error}`);
          await mkdir(cardDir, { recursive: false });
          const ext = image.image.contentType.split('/')[1] ?? 'png';
          const imageFile = `image.${ext}`;
          await writeFile(path.join(cardDir, imageFile), image.image.bytes);
          await writeFile(
            path.join(cardDir, 'record.json'),
            JSON.stringify(
              {
                ...record,
                language: 'ja',
                source: 'japanese-fallback',
                sourceUrl: link.url,
                imageFile,
                imageSha256: image.image.sha256,
                imageWidth: image.image.width,
                imageHeight: image.image.height,
                fetchedAt: new Date().toISOString(),
              },
              null,
              2
            )
          );
          // Only marked as captured now, after every write above actually
          // succeeded -- if this exact attempt had thrown instead, a later
          // duplicate reference to the same card should still retry it, not
          // be silently skipped for a card that was never really saved.
          seenCardDirs.add(cardDir);
          cardCount++;
          console.log(`  OK ${record.cardNumber}: ${record.name}`);
        } catch (error) {
          // A single bad card (a transient fetch hiccup, an unexpected page
          // shape) must not discard every other card already harvested in
          // this run -- see the `failures` manifest field for what to
          // re-check afterwards.
          const message = error instanceof Error ? error.message : String(error);
          console.error(`  FAILED ${link.url}: ${message}`);
          failures.push({ url: link.url, error: message });
        }
      }
      manifests.push({ id: set.setId, name: set.name, cardCount: links.length });
    }

    const manifest = {
      snapshotId,
      createdAt: new Date().toISOString(),
      source: 'Japanese fallback source',
      sourceUrl: 'https://www.artofpkm.com/cards',
      language: 'ja',
      cardCount,
      skippedCount,
      failureCount: failures.length,
      failures,
      sets: manifests,
    };
    await mkdir(output, { recursive: false });
    await cp(staging, output, { recursive: true });
    await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await rm(staging, { recursive: true, force: true });
    published = true;
    console.log(`Published snapshot: ${output}`);
  } finally {
    if (!published) {
      await rm(staging, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
