import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { downloadAndValidateImage } from './downloadImage';
import { withPoliteDelay } from './politeFetch';
import {
  fetchJsonWithRetry,
  highResolutionImageUrl,
  isPokemonCard,
  isSafeTcgdexId,
  tcgdexUrl,
  validateTcgdexCard,
  type TcgdexCardDetail,
  type TcgdexSetBrief,
  type TcgdexSetDetail,
} from './tcgdexSource';

const SUPPORTED_LANGUAGES = new Set([
  'en',
  'ja',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'ru',
  'ko',
  'zh-tw',
  'zh-cn',
  'id',
  'th',
]);

function parseArguments(args: string[]): { language: string; setId?: string; delayMs: number } {
  const language = args.shift();
  if (!language || !SUPPORTED_LANGUAGES.has(language)) {
    throw new Error(
      `Usage: npm run snapshot-tcgdex -- <language> [--set <setId>] [--delay-ms <ms>]`
    );
  }

  let setId: string | undefined;
  let delayMs = 200;
  while (args.length > 0) {
    const flag = args.shift();
    const value = args.shift();
    if (!value) throw new Error(`${flag} requires a value.`);
    if (flag === '--set') setId = value;
    else if (flag === '--delay-ms') {
      delayMs = Number(value);
      if (!Number.isInteger(delayMs) || delayMs < 0)
        throw new Error('--delay-ms must be a non-negative integer.');
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return { language, setId, delayMs };
}

async function main(): Promise<void> {
  const { language, setId, delayMs } = parseArguments(process.argv.slice(2));
  const politeJson = withPoliteDelay(fetchJsonWithRetry, delayMs);
  const politeImage = withPoliteDelay(downloadAndValidateImage, delayMs);
  // Includes `language`, not just the timestamp: run-full-sync.ps1 (and any
  // manual multi-language launch) starts every language's process back to
  // back in a tight loop, and two of them landing on the exact same
  // millisecond is a real, confirmed-live collision -- both ended up
  // sharing one staging directory and corrupted each other's writes (one's
  // cleanup `rm`'d the tree out from under the other's still-in-progress
  // one). `language` is always distinct across concurrent invocations of
  // this script, so it deterministically rules the collision out.
  const snapshotId = `tcgdex-${language}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const stagingRoot = path.join('data', `.${snapshotId}.staging`);
  const finalRoot = path.join('data', snapshotId);
  let published = false;

  await mkdir(stagingRoot, { recursive: true });
  try {
    const catalog = await politeJson<TcgdexSetBrief[]>(tcgdexUrl(language, 'sets'));
    const selectedSets = setId ? catalog.filter((set) => set.id === setId) : catalog;
    if (selectedSets.length === 0)
      throw new Error(`Set ${setId} was not found for language ${language}.`);

    let cardCount = 0;
    let imageCount = 0;
    let skippedCount = 0;
    const missingImageCardIds: string[] = [];
    const setManifests: Array<{ id: string; name: string; cardCount: number }> = [];
    const failures: Array<{ url: string; error: string }> = [];

    for (const setBrief of selectedSets) {
      console.log(`Fetching ${language} set ${setBrief.id}: ${setBrief.name}`);
      let set;
      try {
        set = await politeJson<TcgdexSetDetail>(tcgdexUrl(language, 'sets', setBrief.id));
        if (set.id !== setBrief.id || !Array.isArray(set.cards)) {
          throw new Error(`Invalid set response for ${setBrief.id}.`);
        }
        // Must happen before `set.id` is ever used in path.join below -- see
        // isSafeTcgdexId's own comment for why the character-class check
        // can't be skipped even though the id already passed the equality
        // check above.
        if (!isSafeTcgdexId(set.id)) {
          throw new Error(
            `Unsafe set id, refusing to use it as a path segment: ${JSON.stringify(set.id)}`
          );
        }
      } catch (error) {
        // One unreachable/malformed set response must not discard every
        // other set already scraped in this run -- same reasoning as the
        // per-card catch below.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  FAILED set ${setBrief.id}: ${message}`);
        failures.push({ url: tcgdexUrl(language, 'sets', setBrief.id), error: message });
        continue;
      }

      const setDir = path.join(stagingRoot, language, set.id);
      await mkdir(setDir, { recursive: true });

      for (const brief of set.cards) {
        try {
          const card = await politeJson<TcgdexCardDetail>(tcgdexUrl(language, 'cards', brief.id));
          if (!isPokemonCard(card)) {
            console.log(`  SKIP ${brief.id}: not a Pokemon card (${card.category})`);
            skippedCount++;
            continue;
          }
          const errors = validateTcgdexCard(card, { cardId: brief.id, setId: set.id });
          if (errors.length > 0) throw new Error(`Invalid ${brief.id}: ${errors.join('; ')}`);
          // Must happen before `card.id` is ever used in path.join below --
          // validateTcgdexCard only checks id equality, not character class,
          // so it is not a safety net for this.
          if (!isSafeTcgdexId(card.id)) {
            throw new Error(
              `Unsafe card id, refusing to use it as a path segment: ${JSON.stringify(card.id)}`
            );
          }

          const cardDir = path.join(setDir, card.id);
          await mkdir(cardDir, { recursive: false });
          let imageFields: Record<string, unknown>;
          if (card.image) {
            const imageUrl = highResolutionImageUrl(card.image);
            const imageResult = await politeImage(imageUrl);
            if ('error' in imageResult) {
              throw new Error(`Image failed for ${brief.id}: ${imageResult.error}`);
            }
            await writeFile(path.join(cardDir, 'image.webp'), imageResult.image.bytes);
            imageFields = {
              imageStatus: 'available',
              imageFile: 'image.webp',
              imageSha256: imageResult.image.sha256,
              imageWidth: imageResult.image.width,
              imageHeight: imageResult.image.height,
              sourceImageUrl: imageUrl,
            };
            imageCount++;
          } else {
            imageFields = { imageStatus: 'unavailable-at-source', imageFile: null };
            missingImageCardIds.push(card.id);
          }

          await writeFile(
            path.join(cardDir, 'record.json'),
            JSON.stringify(
              {
                ...card,
                language,
                ...imageFields,
                source: 'tcgdex',
                sourceUrl: tcgdexUrl(language, 'cards', card.id),
                fetchedAt: new Date().toISOString(),
              },
              null,
              2
            )
          );
          cardCount++;
          console.log(`  OK ${card.id}: ${card.name}`);
        } catch (error) {
          // A single bad card must not wipe every other card already
          // scraped in this run -- see the `failures` manifest field for
          // what to re-check afterwards.
          const message = error instanceof Error ? error.message : String(error);
          console.error(`  FAILED ${brief.id}: ${message}`);
          failures.push({ url: tcgdexUrl(language, 'cards', brief.id), error: message });
        }
      }

      setManifests.push({ id: set.id, name: set.name, cardCount: set.cards.length });
    }

    const manifest = {
      snapshotId,
      createdAt: new Date().toISOString(),
      source: 'TCGdex cards-database',
      sourceRepository: 'https://github.com/tcgdex/cards-database',
      sourceApi: 'https://api.tcgdex.net/v2',
      license: 'MIT',
      language,
      cardCount,
      imageCount,
      skippedCount,
      missingImageCount: missingImageCardIds.length,
      missingImageCardIds,
      failureCount: failures.length,
      failures,
      sets: setManifests,
    };

    await mkdir(finalRoot, { recursive: false });
    await cp(stagingRoot, finalRoot, { recursive: true });
    // The root manifest is written last and acts as the completion marker.
    await writeFile(path.join(finalRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await rm(stagingRoot, { recursive: true, force: true });
    published = true;
    console.log(`Published immutable snapshot: ${finalRoot}`);
  } finally {
    if (!published) {
      await rm(stagingRoot, { recursive: true, force: true });
      await rm(finalRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
