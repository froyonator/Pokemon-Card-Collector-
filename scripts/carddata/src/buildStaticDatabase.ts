import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rangeForGeneration, type GenRange } from './data/genRanges';
import {
  loadFallbackAssetIndexes,
  resolveCardAssets,
  type FallbackAssetIndexes,
  type ResolvedAssets,
} from './resolveCardAssets';

// Mirrors src/types/index.ts's CardRecord in the main app EXACTLY -- this
// script's whole purpose is to produce static JSON the app can parse
// straight into that type with zero transformation at load time. Not
// imported directly from there: this is a standalone Node package (its own
// package.json/tsconfig/node_modules, excluded from the root Vitest run --
// see vite.config.ts) with no build-time link to the app's src tree, so the
// shape is duplicated here on purpose and must be kept in sync by hand.
export interface CardRecord {
  id: string;
  name: string;
  dexNumber: number;
  setId: string;
  setName: string;
  localId: string;
  rarity: string;
  imageBase: string;
  language: string;
  // Optional: populated by resolveCardAssets when it found a better hosted
  // image (or, for Japanese, a better name) than this card's own harvested
  // data -- see that module for the full resolution rules. Left undefined
  // (and so omitted from the written JSON, same as any other undefined
  // property) whenever it had nothing better to offer.
  hostedThumbUrl?: string;
  hostedFullUrl?: string;
}

// The subset of a snapshot's record.json fields this script actually reads.
// Every record.json also carries pricing, attacks, hp, variants, etc. --
// deliberately typed away here via the index signature rather than modeled,
// since none of it feeds the static database.
export interface PrimarySourceSnapshotRecord {
  id: string;
  name: string;
  localId: string;
  rarity: string;
  set: { id: string; name: string };
  dexId?: number[];
  image?: string;
  category: string;
  language: string;
  [key: string]: unknown;
}

// Gen1's own range -- see src/data/gen1Dex.ts (the app's authoritative list,
// numbered 1-151 inclusive) for what this must stay in sync with. Kept as
// the DEFAULT range below (not replaced by src/data/genRanges.ts's gen-1
// entry) so the Gen1 build path's behavior is byte-for-byte unchanged by
// this module's Gen2-9 extension -- see this task's own "do not regenerate
// the Gen1 outputs" constraint.
const MIN_DEX_NUMBER = 1;
const MAX_DEX_NUMBER = 151;
const GEN1_RANGE: GenRange = { generation: 1, min: MIN_DEX_NUMBER, max: MAX_DEX_NUMBER };

/**
 * Pure transform: one snapshot record.json -> zero or more CardRecords.
 *
 * A record is skipped entirely if it has no (or an empty) dexId array --
 * the primary source only populates dexId for cards it can confidently
 * attribute to a National Dex entry, and a card with none isn't attributable
 * to any of this app's dex-number-keyed slots.
 *
 * A single record legitimately produces more than one CardRecord when its
 * dexId array has more than one entry (e.g. a TAG TEAM/GX card depicting
 * multiple Pokemon) -- each in-range dex number gets its own entry, deduped
 * against nothing, since the same card genuinely belongs under each of those
 * dex numbers. Out-of-range dex numbers are dropped individually rather
 * than disqualifying the whole record, so a mixed-generation dexId array
 * still yields whichever part is in `range`.
 *
 * `range` defaults to Gen1 (1-151) so every existing call site (and every
 * existing test) keeps its exact original behavior; the Gen2-9 build path
 * below passes an explicit range from src/data/genRanges.ts.
 */
export function recordToCardRecords(
  record: PrimarySourceSnapshotRecord,
  range: GenRange = GEN1_RANGE
): CardRecord[] {
  if (!Array.isArray(record.dexId) || record.dexId.length === 0) return [];

  const cards: CardRecord[] = [];
  for (const dexNumber of record.dexId) {
    if (!Number.isInteger(dexNumber) || dexNumber < range.min || dexNumber > range.max) {
      continue;
    }
    cards.push({
      id: record.id,
      name: record.name,
      dexNumber,
      setId: record.set.id,
      setName: record.set.name,
      localId: record.localId,
      // A handful of specific cards (the same ones across every language
      // that has them, e.g. certain SV2a/SV4a/SV5K promos) genuinely have no
      // rarity recorded in the primary source's own data -- confirmed via an
      // audit that cross-checked the raw harvest directly, not a
      // data-pipeline/build bug.
      // Matches the same fallback loadCardData.ts's live fetch path already
      // uses for the identical situation, so a card's rarity is never a
      // blank string in either the static or live-API code path.
      rarity: record.rarity || 'Unknown',
      imageBase: record.image ?? '',
      language: record.language,
    });
  }
  return cards;
}

/**
 * Pure transform: merges a resolveCardAssets result onto a CardRecord,
 * producing the exact final shape written to public/data/cards/*.json.
 * Every field ResolvedAssets left undefined passes `card` through
 * unchanged -- this never introduces an explicit `undefined` value for a
 * field the resolver had nothing better to offer for.
 */
export function mergeResolvedAssets(card: CardRecord, resolved: ResolvedAssets): CardRecord {
  const merged: CardRecord = { ...card };
  if (resolved.thumbUrl !== undefined) merged.hostedThumbUrl = resolved.thumbUrl;
  if (resolved.fullUrl !== undefined) merged.hostedFullUrl = resolved.fullUrl;
  if (resolved.resolvedName !== undefined) merged.name = resolved.resolvedName;
  return merged;
}

/** Recursively collects every `record.json` path under `dir`. */
async function findRecordFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findRecordFiles(fullPath)));
    } else if (entry.isFile() && entry.name === 'record.json') {
      files.push(fullPath);
    }
  }
  return files;
}

export interface LanguageBuildStats {
  language: string;
  filesScanned: number;
  cardsEmitted: number;
  dexNumbersCovered: number;
  outputBytes: number;
}

/**
 * Walks one language's snapshot directory, transforms every record.json into
 * CardRecords grouped by dex number, and writes the compact result to
 * `outputPath`. Shared core for both the Gen1 build (below, via
 * `buildLanguage`) and the Gen2-9 build (via `buildLanguageForGeneration`) --
 * only where the snapshot lives, where the output goes, which dex range
 * applies, and which fallback asset indexes to consult differ between them.
 */
async function buildLanguageCore(
  language: string,
  languageDir: string,
  outputPath: string,
  fallbackIndexes: FallbackAssetIndexes,
  range: GenRange
): Promise<LanguageBuildStats> {
  const recordFiles = await findRecordFiles(languageDir);

  const grouped: Record<number, CardRecord[]> = {};
  let cardsEmitted = 0;

  for (const filePath of recordFiles) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      // One malformed record.json (there shouldn't be any in an already-
      // published snapshot, but this is cheap insurance) must not abort the
      // whole language's build -- same fail-soft philosophy
      // snapshotPrimarySource.ts uses for a single bad card during harvesting.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED to parse ${filePath}: ${message}`);
      continue;
    }

    const cards = recordToCardRecords(raw as PrimarySourceSnapshotRecord, range);
    for (const card of cards) {
      // Merges in a better hosted image (and, for Japanese, a better name)
      // when one is available -- see resolveCardAssets.ts and
      // mergeResolvedAssets above. `fallbackIndexes` is empty ({}) for a
      // Gen2-9 build (see buildLanguageForGeneration), so this still
      // constructs a primary-source hosted URL whenever the card's own
      // imageBase is present, but never attempts the Gen1-only cross-source
      // fallback matching.
      const resolvedCard = mergeResolvedAssets(card, resolveCardAssets(card, fallbackIndexes));
      (grouped[resolvedCard.dexNumber] ??= []).push(resolvedCard);
      cardsEmitted++;
    }
  }

  const dexNumbersCovered = Object.keys(grouped).length;
  const json = JSON.stringify(grouped);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');
  const outputBytes = Buffer.byteLength(json, 'utf8');
  const dexNumbersInRange = range.max - range.min + 1;

  console.log(
    `[${language}] files scanned: ${recordFiles.length}, cards emitted: ${cardsEmitted}, ` +
      `dex numbers covered: ${dexNumbersCovered}/${dexNumbersInRange}, ` +
      `output size: ${(outputBytes / 1024).toFixed(1)} KB`
  );

  return { language, filesScanned: recordFiles.length, cardsEmitted, dexNumbersCovered, outputBytes };
}

/** Gen1 build: reads one of the immutable, timestamp-named snapshot directories in LANGUAGE_SNAPSHOTS below, writes `<outputDir>/<language>.json`. Behavior is byte-for-byte unchanged from before this module's Gen2-9 extension. */
async function buildLanguage(
  language: string,
  snapshotDirName: string,
  outputDir: string,
  fallbackIndexes: FallbackAssetIndexes
): Promise<LanguageBuildStats> {
  const languageDir = path.join('data', snapshotDirName, language);
  const outputPath = path.join(outputDir, `${language}.json`);
  return buildLanguageCore(language, languageDir, outputPath, fallbackIndexes, GEN1_RANGE);
}

/**
 * Gen2-9 build: reads the resumable data/snapshot-all-gens/<language>/
 * directory produced by snapshotAllGens.ts, writes
 * `<outputDir>/<language>/gen<N>.json`. No fallback asset indexes are
 * consulted -- those cross-source match indexes were built (and validated)
 * against Gen1 data only; applying their dex-number-based heuristics outside
 * that range risks a wrong match, so a Gen2-9 card only ever gets a hosted
 * URL when the primary source's own imageBase supplies one. The live
 * imageBase-based fetch path (src/api/tcgdex.ts) keeps working unchanged for
 * whatever's left un-hosted.
 */
async function buildLanguageForGeneration(
  language: string,
  generation: number,
  outputDir: string
): Promise<LanguageBuildStats> {
  const languageDir = path.join('data', 'snapshot-all-gens', language);
  const outputPath = outputPathForLanguage(outputDir, language, generation);
  return buildLanguageCore(language, languageDir, outputPath, {}, rangeForGeneration(generation));
}

/**
 * Pure: where a language's static database file goes. `generation === null`
 * is the existing Gen1 convention (`<outputDir>/<language>.json`, untouched);
 * any other generation goes under its own per-language subdirectory
 * (`<outputDir>/<language>/gen<N>.json`), per this task's fixed output
 * format.
 */
export function outputPathForLanguage(
  outputDir: string,
  language: string,
  generation: number | null
): string {
  if (generation === null) return path.join(outputDir, `${language}.json`);
  return path.join(outputDir, language, `gen${generation}.json`);
}

// Real, published snapshot directories under scripts/carddata/data/ -- see
// this task's own handoff notes for why nl/ru/pl are deliberately absent:
// confirmed live against the primary source's API that those three have zero
// per-card data upstream for Gen1-relevant sets (a real upstream gap, not a
// data-pipeline bug), so the app's existing live-API fallback keeps handling
// them unchanged rather than this script producing an empty static file for
// them.
//
// The snapshotDirName values below are literal, already-published snapshot
// directory names captured before this data pipeline's terminology was
// generalized -- they identify real, immutable data on disk and are left
// exactly as originally written (see snapshotPrimarySource.ts for why the
// *newly written* prefix differs from these older directory names).
const LANGUAGE_SNAPSHOTS: ReadonlyArray<{ language: string; snapshotDirName: string }> = [
  { language: 'en', snapshotDirName: 'tcgdex-en-2026-07-11T10-10-28-844Z' },
  { language: 'ja', snapshotDirName: 'tcgdex-ja-2026-07-11T10-10-28-844Z' },
  { language: 'fr', snapshotDirName: 'tcgdex-2026-07-11T08-42-18-178Z' },
  { language: 'de', snapshotDirName: 'tcgdex-2026-07-11T08-42-18-190Z' },
  { language: 'es', snapshotDirName: 'tcgdex-2026-07-11T08-42-18-201Z' },
  { language: 'it', snapshotDirName: 'tcgdex-2026-07-11T08-42-18-216Z' },
  { language: 'pt', snapshotDirName: 'tcgdex-2026-07-11T08-42-18-227Z' },
  { language: 'zh-tw', snapshotDirName: 'tcgdex-2026-07-11T08-34-51-811Z' },
  { language: 'th', snapshotDirName: 'tcgdex-2026-07-11T08-34-51-824Z' },
  { language: 'zh-cn', snapshotDirName: 'tcgdex-2026-07-11T08-34-51-826Z' },
  { language: 'id', snapshotDirName: 'tcgdex-2026-07-11T08-34-51-828Z' },
  { language: 'ko', snapshotDirName: 'tcgdex-2026-07-11T08-34-51-800Z' },
];

/** Pure: `--gen <N>` CLI parsing. Returns null for the default (Gen1) invocation, matching outputPathForLanguage's own null convention. */
export function parseGenerationFlag(argv: string[]): number | null {
  const args = [...argv];
  let generation: number | null = null;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--gen') {
      const value = args.shift();
      const parsed = value ? Number(value) : NaN;
      if (!Number.isInteger(parsed) || parsed < 2 || parsed > 9) {
        throw new Error('--gen must be an integer 2-9 (the default, flag-less invocation builds Gen1).');
      }
      generation = parsed;
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  return generation;
}

/** Languages that actually have a Gen2-9 snapshot directory to build from -- data/snapshot-all-gens/<language>/, produced by snapshotAllGens.ts. Not every language snapshotAllGens.ts supports has necessarily been run yet, so this discovers what's really on disk rather than assuming every LANGUAGE_SNAPSHOTS entry has a Gen2-9 counterpart. */
async function discoverSnapshotAllGensLanguages(): Promise<string[]> {
  const root = path.join('data', 'snapshot-all-gens');
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function buildGen1(outputDir: string): Promise<void> {
  // Loaded once for the whole run, not once per card -- every language's
  // build below shares these same two indexes.
  console.log('Loading cross-source fallback asset indexes...');
  const fallbackIndexes = await loadFallbackAssetIndexes(path.resolve(process.cwd(), 'data'));

  let grandTotalBytes = 0;
  for (const { language, snapshotDirName } of LANGUAGE_SNAPSHOTS) {
    const stats = await buildLanguage(language, snapshotDirName, outputDir, fallbackIndexes);
    grandTotalBytes += stats.outputBytes;
  }

  console.log(`Grand total output size across ${LANGUAGE_SNAPSHOTS.length} languages: ${(grandTotalBytes / 1024).toFixed(1)} KB`);
}

async function buildGeneration(generation: number, outputDir: string): Promise<void> {
  const languages = await discoverSnapshotAllGensLanguages();
  if (languages.length === 0) {
    console.log(
      `No data/snapshot-all-gens/<language>/ directories found -- run "npm run snapshot-all-gens -- <language>" first.`
    );
    return;
  }

  let grandTotalBytes = 0;
  for (const language of languages) {
    const stats = await buildLanguageForGeneration(language, generation, outputDir);
    grandTotalBytes += stats.outputBytes;
  }

  console.log(
    `Grand total gen${generation} output size across ${languages.length} language(s): ${(grandTotalBytes / 1024).toFixed(1)} KB`
  );
}

async function main(): Promise<void> {
  // Run via `npm run build-database` from scripts/carddata (its own package,
  // matching every snapshot-* script's cwd assumption -- see
  // snapshotPrimarySource.ts's `path.join('data', snapshotId)`), so the repo
  // root is two levels up.
  const generation = parseGenerationFlag(process.argv.slice(2));
  const outputDir = path.resolve(process.cwd(), '..', '..', 'public', 'data', 'cards');
  await mkdir(outputDir, { recursive: true });

  if (generation === null) {
    await buildGen1(outputDir);
  } else {
    await buildGeneration(generation, outputDir);
  }
}

// Guards the CLI run behind an entry-module check -- buildStaticDatabase.test.ts
// imports recordToCardRecords from this same file, and without this guard
// that import would also trigger a real filesystem walk over every
// snapshot directory as a side effect of merely loading the module under
// test. fileURLToPath + path.resolve (rather than a raw string/URL compare)
// so the comparison is robust to Windows' backslash paths vs. `file://` URLs.
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
