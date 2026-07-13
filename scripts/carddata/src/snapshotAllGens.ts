// scripts/carddata/src/snapshotAllGens.ts
//
// Snapshots primary-source card data for Generations 2-9 (dex 152-1025),
// one language at a time -- same primary-source API client, same
// politeFetch pacing, same per-card record.json shape as
// snapshotPrimarySource.ts (Gen1). Two real differences from that script:
//
//  1. The primary source's API has no way to ask for "just this dex range"
//     -- a card's National Dex attribution (dexId) is only known once its
//     own detail has been fetched, so this still walks every set and every
//     card for the language (unavoidable). It only WRITES a record.json
//     (and only downloads the image) for a card whose dexId falls inside
//     the requested --gens ranges, keeping the on-disk snapshot scoped to
//     what this task actually needs. Practical upshot: fetching gens
//     2,3,4,5,6,7,8,9 in one run (the default) costs the SAME number of
//     card-detail requests as fetching just one of them -- every card in
//     the language has to be looked at regardless -- so there is no reason
//     to run this once per generation; run it once per language with the
//     default --gens, and build-database's --gen flag slices the one
//     resulting snapshot into each public/data/cards/<lang>/gen<N>.json.
//  2. It checkpoints into data/snapshot-all-gens/progress.json after every
//     completed SET (not just at the very end), so a killed run resumes
//     without re-fetching sets already captured -- same idea as
//     harvest/runHarvest.ts's progress.json, keyed by language+setId here
//     since a completed set fetch is this script's natural resumption
//     unit. Unlike snapshotPrimarySource.ts's snapshots (immutable,
//     timestamp-named, published atomically), this directory is a single
//     ongoing, resumable capture per language -- re-running the same
//     language later adds/overwrites into the same tree rather than
//     creating a new timestamped one.
//
// Output layout mirrors the existing per-language snapshot directories:
//   data/snapshot-all-gens/<language>/<setId>/<cardId>/record.json
//
// Run via:
//   npm run snapshot-all-gens -- <language> [--gens 2,3,4,5,6,7,8,9]
//     [--delay-ms <ms>] [--limit <n>] [--set <setId>]
//
// --limit <n> stops the run early once at least n distinct in-range dex
// numbers have been captured THIS run (across already-resumed progress or
// not -- it counts only what this invocation itself writes), meant for
// smoke tests, not production runs (a real run should omit it so every set
// gets a chance to contribute cards).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rangeForGeneration, type GenRange } from './data/genRanges';
import { isDigitalOnlySetId } from './data/digitalSeries';
import { downloadAndValidateImage } from './downloadImage';
import { withPoliteDelay } from './politeFetch';
import {
  fetchJsonWithRetry,
  highResolutionImageUrl,
  isPokemonCard,
  isSafePrimarySourceId,
  primarySourceUrl,
  SUPPORTED_LANGUAGES,
  validatePrimarySourceCard,
  type PrimarySourceCardDetail,
  type PrimarySourceSetBrief,
  type PrimarySourceSetDetail,
} from './primarySource';

const DEFAULT_GENERATIONS = [2, 3, 4, 5, 6, 7, 8, 9];
const OUTPUT_ROOT = path.join('data', 'snapshot-all-gens');
const PROGRESS_PATH = path.join(OUTPUT_ROOT, 'progress.json');

// --- pure helpers (unit tested) ---------------------------------------------

export function parseGenerationsArg(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_GENERATIONS;
  const values = raw.split(',').map((s) => Number(s.trim()));
  for (const v of values) {
    if (!Number.isInteger(v) || v < 2 || v > 9) {
      throw new Error(`--gens values must be integers 2-9 (got "${raw}").`);
    }
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

export function rangesForGenerations(generations: number[]): GenRange[] {
  return generations.map(rangeForGeneration);
}

export function dexNumberInAnyRange(dexNumber: number, ranges: GenRange[]): boolean {
  return ranges.some((r) => dexNumber >= r.min && dexNumber <= r.max);
}

/**
 * Which of a card's dexId entries fall inside the requested ranges -- a
 * card can legitimately qualify for more than one generation at once (e.g.
 * a multi-Pokemon TAG TEAM/GX card spanning two of them), mirroring
 * buildStaticDatabase.ts's recordToCardRecords fan-out. Empty when none
 * qualify, which is the normal case for most cards in a language's full
 * catalog (most cards belong to Gen1, already handled elsewhere, or to a
 * generation outside what was requested).
 */
export function inRangeDexIds(dexId: number[] | undefined, ranges: GenRange[]): number[] {
  if (!Array.isArray(dexId)) return [];
  return dexId.filter((n) => Number.isInteger(n) && dexNumberInAnyRange(n, ranges));
}

export interface SnapshotAllGensProgress {
  [language: string]: {
    [setId: string]: { setName: string; cardsWritten: number; completedAt: string };
  };
}

export function emptyProgress(): SnapshotAllGensProgress {
  return {};
}

export function isSetDone(progress: SnapshotAllGensProgress, language: string, setId: string): boolean {
  return Boolean(progress[language]?.[setId]);
}

export function markSetDone(
  progress: SnapshotAllGensProgress,
  language: string,
  setId: string,
  entry: { setName: string; cardsWritten: number; completedAt: string }
): SnapshotAllGensProgress {
  return { ...progress, [language]: { ...progress[language], [setId]: entry } };
}

/** Pure job-selection: drops sets already checkpointed done for this language. */
export function selectPendingSets<T extends { id: string }>(
  sets: T[],
  progress: SnapshotAllGensProgress,
  language: string
): T[] {
  return sets.filter((set) => !isSetDone(progress, language, set.id));
}

/**
 * Pure catalog filter: this app tracks physical cards only (see
 * src/data/digitalSeries.ts), so a digital-only set is dropped from the
 * catalog walk before anything else runs -- no card-detail requests are
 * ever made for it, and it can never produce a record.json on disk.
 * Applied unconditionally, even when `--set` explicitly names a
 * digital-only setId, so this fence cannot be bypassed by a manual invocation.
 */
export function excludeDigitalOnlySets<T extends { id: string }>(sets: T[]): T[] {
  return sets.filter((set) => !isDigitalOnlySetId(set.id));
}

// --- CLI ---------------------------------------------------------------------

export interface CliArgs {
  language: string;
  generations: number[];
  delayMs: number;
  limit?: number;
  setId?: string;
  // When true, card image files are not downloaded (imageStatus is written
  // as 'skipped'). The static-database build never reads the image bytes --
  // hosted URLs are formula-derived and the app falls back to the card's
  // live imageBase -- so a data-only snapshot halves the request count.
  skipImages?: boolean;
}

export function parseArguments(args: string[]): CliArgs {
  const rest = [...args];
  const language = rest.shift();
  if (!language || !SUPPORTED_LANGUAGES.has(language)) {
    throw new Error(
      'Usage: npm run snapshot-all-gens -- <language> [--gens 2,3,4,5,6,7,8,9] [--delay-ms <ms>] [--limit <n>] [--set <setId>]'
    );
  }
  let generations = DEFAULT_GENERATIONS;
  let delayMs = 200;
  let limit: number | undefined;
  let setId: string | undefined;
  let skipImages = false;
  while (rest.length > 0) {
    const flag = rest.shift();
    if (flag === '--skip-images') {
      skipImages = true;
      continue;
    }
    const value = rest.shift();
    if (!value) throw new Error(`${flag} requires a value.`);
    if (flag === '--gens') generations = parseGenerationsArg(value);
    else if (flag === '--delay-ms') {
      delayMs = Number(value);
      if (!Number.isInteger(delayMs) || delayMs < 0) throw new Error('--delay-ms must be a non-negative integer.');
    } else if (flag === '--limit') {
      limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer.');
    } else if (flag === '--set') {
      setId = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return { language, generations, delayMs, limit, setId, skipImages };
}

async function loadProgress(): Promise<SnapshotAllGensProgress> {
  try {
    return JSON.parse(await readFile(PROGRESS_PATH, 'utf8')) as SnapshotAllGensProgress;
  } catch {
    return emptyProgress();
  }
}

async function saveProgress(progress: SnapshotAllGensProgress): Promise<void> {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const cli = parseArguments(process.argv.slice(2));
  const ranges = rangesForGenerations(cli.generations);
  const politeJson = withPoliteDelay(fetchJsonWithRetry, cli.delayMs);
  const politeImage = withPoliteDelay(downloadAndValidateImage, cli.delayMs);

  let progress = await loadProgress();
  const languageDir = path.join(OUTPUT_ROOT, cli.language);
  await mkdir(languageDir, { recursive: true });

  console.log(
    `Snapshotting ${cli.language} for generation(s) ${cli.generations.join(',')} (dex ${ranges
      .map((r) => `${r.min}-${r.max}`)
      .join(', ')})...`
  );

  const catalog = await politeJson<PrimarySourceSetBrief[]>(primarySourceUrl(cli.language, 'sets'));
  const physicalCatalog = excludeDigitalOnlySets(catalog);
  const allSets = cli.setId ? physicalCatalog.filter((s) => s.id === cli.setId) : physicalCatalog;
  if (allSets.length === 0) {
    throw new Error(`No sets found for ${cli.language}${cli.setId ? ` (set ${cli.setId})` : ''}.`);
  }

  const pendingSets = selectPendingSets(allSets, progress, cli.language);
  console.log(`${allSets.length} set(s) total; ${pendingSets.length} pending after resume filter.`);

  const capturedDexNumbers = new Set<number>();
  let cardsWrittenTotal = 0;
  let imagesDownloaded = 0;

  for (let i = 0; i < pendingSets.length; i++) {
    const setBrief = pendingSets[i];
    console.log(`[${i + 1}/${pendingSets.length}] ${cli.language} set ${setBrief.id}`);
    let cardsWritten = 0;
    try {
      const set = await politeJson<PrimarySourceSetDetail>(primarySourceUrl(cli.language, 'sets', setBrief.id));
      if (set.id !== setBrief.id || !Array.isArray(set.cards)) {
        throw new Error(`Invalid set response for ${setBrief.id}.`);
      }
      if (!isSafePrimarySourceId(set.id)) {
        throw new Error(`Unsafe set id, refusing to use it as a path segment: ${JSON.stringify(set.id)}`);
      }

      const setDir = path.join(languageDir, set.id);

      for (const brief of set.cards) {
        try {
          const card = await politeJson<PrimarySourceCardDetail>(primarySourceUrl(cli.language, 'cards', brief.id));
          if (!isPokemonCard(card)) continue;

          const qualifying = inRangeDexIds((card as { dexId?: unknown }).dexId as number[] | undefined, ranges);
          if (qualifying.length === 0) continue;

          const errors = validatePrimarySourceCard(card, { cardId: brief.id, setId: set.id });
          if (errors.length > 0) throw new Error(`Invalid ${brief.id}: ${errors.join('; ')}`);
          if (!isSafePrimarySourceId(card.id)) {
            throw new Error(`Unsafe card id, refusing to use it as a path segment: ${JSON.stringify(card.id)}`);
          }

          const cardDir = path.join(setDir, card.id);
          await mkdir(cardDir, { recursive: true });

          let imageFields: Record<string, unknown>;
          if (cli.skipImages) {
            imageFields = { imageStatus: 'skipped', imageFile: null };
          } else if (card.image) {
            const imageUrl = highResolutionImageUrl(card.image);
            const imageResult = await politeImage(imageUrl);
            if ('error' in imageResult) {
              imageFields = { imageStatus: 'unavailable-at-source', imageFile: null };
            } else {
              await writeFile(path.join(cardDir, 'image.webp'), imageResult.image.bytes);
              imageFields = {
                imageStatus: 'available',
                imageFile: 'image.webp',
                imageSha256: imageResult.image.sha256,
                imageWidth: imageResult.image.width,
                imageHeight: imageResult.image.height,
                sourceImageUrl: imageUrl,
              };
              imagesDownloaded++;
            }
          } else {
            imageFields = { imageStatus: 'unavailable-at-source', imageFile: null };
          }

          await writeFile(
            path.join(cardDir, 'record.json'),
            JSON.stringify(
              {
                ...card,
                language: cli.language,
                ...imageFields,
                source: 'primary-source',
                sourceUrl: primarySourceUrl(cli.language, 'cards', card.id),
                fetchedAt: new Date().toISOString(),
              },
              null,
              2
            )
          );
          cardsWritten++;
          cardsWrittenTotal++;
          for (const n of qualifying) capturedDexNumbers.add(n);
          console.log(`  OK ${card.id}: ${card.name} (dex ${qualifying.join(',')})`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`  FAILED ${brief.id}: ${message}`);
        }
      }

      progress = markSetDone(progress, cli.language, set.id, {
        setName: set.name,
        cardsWritten,
        completedAt: new Date().toISOString(),
      });
      await saveProgress(progress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED set ${setBrief.id}: ${message}`);
    }

    if (cli.limit !== undefined && capturedDexNumbers.size >= cli.limit) {
      console.log(`Reached --limit ${cli.limit} distinct dex number(s); stopping early.`);
      break;
    }
  }

  console.log(
    `Done. ${cardsWrittenTotal} card(s) written, ${imagesDownloaded} image(s) downloaded, ` +
      `${capturedDexNumbers.size} distinct dex number(s) captured this run.`
  );
}

if (process.argv[1] && process.argv[1].includes('snapshotAllGens')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
