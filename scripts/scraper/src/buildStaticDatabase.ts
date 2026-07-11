import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // image (or, for Japanese, a better name) than this card's own scraped
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
export interface TcgdexSnapshotRecord {
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
// numbered 1-151 inclusive) for what this must stay in sync with.
const MIN_DEX_NUMBER = 1;
const MAX_DEX_NUMBER = 151;

/**
 * Pure transform: one snapshot record.json -> zero or more CardRecords.
 *
 * A record is skipped entirely if it has no (or an empty) dexId array --
 * TCGdex only populates dexId for cards it can confidently attribute to a
 * National Dex entry, and a card with none isn't attributable to any of this
 * app's dex-number-keyed slots.
 *
 * A single record legitimately produces more than one CardRecord when its
 * dexId array has more than one entry (e.g. a TAG TEAM/GX card depicting
 * multiple Pokemon) -- each in-range dex number gets its own entry, deduped
 * against nothing, since the same card genuinely belongs under each of those
 * dex numbers. Out-of-range dex numbers (outside 1-151, i.e. not a Gen1
 * Pokemon) are dropped individually rather than disqualifying the whole
 * record, so a Gen1/non-Gen1 mixed dexId array still yields the Gen1 part.
 */
export function recordToCardRecords(record: TcgdexSnapshotRecord): CardRecord[] {
  if (!Array.isArray(record.dexId) || record.dexId.length === 0) return [];

  const cards: CardRecord[] = [];
  for (const dexNumber of record.dexId) {
    if (!Number.isInteger(dexNumber) || dexNumber < MIN_DEX_NUMBER || dexNumber > MAX_DEX_NUMBER) {
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
      // rarity recorded in TCGdex's own data -- confirmed via an audit that
      // cross-checked the raw scrape directly, not a scraper/build bug.
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
 * `<outputDir>/<language>.json`.
 */
async function buildLanguage(
  language: string,
  snapshotDirName: string,
  outputDir: string,
  fallbackIndexes: FallbackAssetIndexes
): Promise<LanguageBuildStats> {
  const languageDir = path.join('data', snapshotDirName, language);
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
      // whole language's build -- same fail-soft philosophy snapshotTcgdex.ts
      // uses for a single bad card during scraping.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED to parse ${filePath}: ${message}`);
      continue;
    }

    const cards = recordToCardRecords(raw as TcgdexSnapshotRecord);
    for (const card of cards) {
      // Merges in a better hosted image (and, for Japanese, a better name)
      // when one is available -- see resolveCardAssets.ts and
      // mergeResolvedAssets above.
      const resolvedCard = mergeResolvedAssets(card, resolveCardAssets(card, fallbackIndexes));
      (grouped[resolvedCard.dexNumber] ??= []).push(resolvedCard);
      cardsEmitted++;
    }
  }

  const dexNumbersCovered = Object.keys(grouped).length;
  const json = JSON.stringify(grouped);
  const outputPath = path.join(outputDir, `${language}.json`);
  await writeFile(outputPath, json, 'utf8');
  const outputBytes = Buffer.byteLength(json, 'utf8');

  console.log(
    `[${language}] files scanned: ${recordFiles.length}, cards emitted: ${cardsEmitted}, ` +
      `dex numbers covered: ${dexNumbersCovered}/${MAX_DEX_NUMBER}, ` +
      `output size: ${(outputBytes / 1024).toFixed(1)} KB`
  );

  return { language, filesScanned: recordFiles.length, cardsEmitted, dexNumbersCovered, outputBytes };
}

// Real, published snapshot directories under scripts/scraper/data/ -- see
// this task's own handoff notes for why nl/ru/pl are deliberately absent:
// confirmed live against the TCGdex API that those three have zero per-card
// data upstream for Gen1-relevant sets (a real upstream gap, not a scraper
// bug), so the app's existing live-API fallback keeps handling them
// unchanged rather than this script producing an empty static file for them.
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

async function main(): Promise<void> {
  // Run via `npm run build-database` from scripts/scraper (its own package,
  // matching every snapshot-* script's cwd assumption -- see snapshotTcgdex.ts's
  // `path.join('data', snapshotId)`), so the repo root is two levels up.
  const outputDir = path.resolve(process.cwd(), '..', '..', 'public', 'data', 'cards');
  await mkdir(outputDir, { recursive: true });

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
