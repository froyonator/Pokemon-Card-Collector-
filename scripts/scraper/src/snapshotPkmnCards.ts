import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { downloadAndValidateImage } from './downloadImage';
import { fetchHtmlWithRetry } from './fetchHtml';
import {
  isPokemonCard,
  parsePkmnCardsDetail,
  parsePkmnCardsSetList,
  parsePkmnCardsSetPage,
} from './parsePkmnCards';
import { createPoliteScheduler } from './politeScheduler';

function options(args: string[]): { setSlug?: string; delayMs: number } {
  let setSlug: string | undefined;
  let delayMs = 750;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value) throw new Error(`${flag} requires a value.`);
    if (flag === '--set') setSlug = value;
    else if (flag === '--delay-ms') delayMs = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(delayMs) || delayMs < 250)
    throw new Error('--delay-ms must be at least 250.');
  return { setSlug, delayMs };
}

async function main(): Promise<void> {
  const { setSlug, delayMs } = options(process.argv.slice(2));
  const schedule = createPoliteScheduler(delayMs);
  const politeHtml = (url: string) => schedule(() => fetchHtmlWithRetry(url));
  const politeImage = (url: string) => schedule(() => downloadAndValidateImage(url));
  const snapshotId = `pkmncards-en-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const staging = path.join('data', `.${snapshotId}.staging`);
  const output = path.join('data', snapshotId);
  let published = false;
  await mkdir(staging, { recursive: false });
  try {
    const allSets = parsePkmnCardsSetList(await politeHtml('https://pkmncards.com/sets/'));
    const sets = setSlug ? allSets.filter((set) => set.setSlug === setSlug) : allSets;
    if (!sets.length) throw new Error(`PkmnCards set not found: ${setSlug ?? '(all)'}`);
    let cardCount = 0;
    let skippedCount = 0;
    const manifests: Array<{ slug: string; name: string; code: string | null; cardCount: number }> =
      [];
    const failures: Array<{ url: string; error: string }> = [];

    for (const set of sets) {
      let links;
      try {
        links = parsePkmnCardsSetPage(await politeHtml(set.url));
        if (!links.length) throw new Error(`No card links found for ${set.url}`);
      } catch (error) {
        // One unreachable/empty set page must not discard every other set
        // already scraped in this run -- same reasoning as the per-card
        // catch below.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  FAILED set ${set.url}: ${message}`);
        failures.push({ url: set.url, error: message });
        continue;
      }
      console.log(`Fetching ${set.name}: ${links.length} cards`);
      const setDir = path.join(staging, 'en', set.setSlug);
      await mkdir(setDir, { recursive: true });
      for (const link of links) {
        try {
          const record = parsePkmnCardsDetail(await politeHtml(link.url), link.url);
          if (!isPokemonCard(record)) {
            console.log(`  SKIP ${link.url}: not a Pokemon card (${record.supertype})`);
            skippedCount++;
            continue;
          }
          if (!record.name || !record.expansionName || !record.cardNumber || !record.imageUrl) {
            throw new Error(`Invalid PkmnCards detail page: ${link.url}`);
          }
          const image = await politeImage(record.imageUrl);
          if ('error' in image) throw new Error(`Image failed for ${link.url}: ${image.error}`);
          const cardDir = path.join(setDir, record.sourceCardSlug);
          await mkdir(cardDir, { recursive: false });
          const ext = image.image.contentType.split('/')[1] ?? 'jpg';
          const imageFile = `image.${ext}`;
          await writeFile(path.join(cardDir, imageFile), image.image.bytes);
          await writeFile(
            path.join(cardDir, 'record.json'),
            JSON.stringify(
              {
                ...record,
                language: 'en',
                source: 'pkmncards',
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
          cardCount++;
          console.log(`  OK ${record.expansionCode}-${record.cardNumber}: ${record.name}`);
        } catch (error) {
          // A single bad card (transient fetch failure, unexpected page
          // shape) must not wipe every other card already scraped in this
          // run -- see the `failures` manifest field for what to re-check.
          const message = error instanceof Error ? error.message : String(error);
          console.error(`  FAILED ${link.url}: ${message}`);
          failures.push({ url: link.url, error: message });
        }
      }
      manifests.push({
        slug: set.setSlug,
        name: set.name,
        code: set.code,
        cardCount: links.length,
      });
    }

    const manifest = {
      snapshotId,
      createdAt: new Date().toISOString(),
      source: 'PkmnCards',
      sourceUrl: 'https://pkmncards.com/sets/',
      language: 'en',
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
