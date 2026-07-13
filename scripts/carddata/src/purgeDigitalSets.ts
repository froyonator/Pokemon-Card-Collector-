// scripts/carddata/src/purgeDigitalSets.ts
//
// Purges every digital-only card (see src/data/digitalSeries.ts) from
// every static per-language database under public/data/cards/ -- both the
// Gen1 flat files (<lang>.json) and the Gen2-9 per-generation files
// (<lang>/gen<N>.json) -- in place, plus the corresponding raw per-card
// snapshot directories under data/snapshot-all-gens/<lang>/<setId>/ so a
// future rebuild from those inputs stays clean. Idempotent: re-running
// after a clean purge reports zero removed everywhere and leaves every
// already-clean file untouched on disk.
//
// Run via: npm run purge-digital
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDigitalOnlySetId } from './data/digitalSeries';

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
  hostedThumbUrl?: string;
  hostedFullUrl?: string;
  [key: string]: unknown;
}

export type CardDatabase = Record<string, CardRecord[]>;

export interface PurgeOutcome {
  totalBefore: number;
  removed: number;
  totalAfter: number;
  removedBySetId: Record<string, number>;
}

/**
 * Pure transform: filters every digital-only card out of `database`
 * (mutated in place, matching every other in-place merge script in this
 * pipeline -- see mergeHarvest.ts). A dex-number bucket that becomes empty
 * is deleted outright rather than left as `[]`, matching how these files
 * are originally produced (buildStaticDatabase.ts only ever creates a
 * bucket when it has at least one card to put in it).
 */
export function purgeDigitalCards(database: CardDatabase): PurgeOutcome {
  let totalBefore = 0;
  let removed = 0;
  const removedBySetId: Record<string, number> = {};

  for (const key of Object.keys(database)) {
    const bucket = database[key];
    if (!Array.isArray(bucket)) continue;
    totalBefore += bucket.length;

    const kept: CardRecord[] = [];
    for (const card of bucket) {
      if (card && isDigitalOnlySetId(card.setId)) {
        removed++;
        removedBySetId[card.setId] = (removedBySetId[card.setId] ?? 0) + 1;
      } else {
        kept.push(card);
      }
    }

    if (kept.length === 0) {
      delete database[key];
    } else if (kept.length !== bucket.length) {
      database[key] = kept;
    }
  }

  return { totalBefore, removed, totalAfter: totalBefore - removed, removedBySetId };
}

/** Recursively collects every `.json` file under `dir` (public/data/cards/ -- both <lang>.json and <lang>/gen<N>.json share this one shape). */
async function findDatabaseFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findDatabaseFiles(fullPath)));
    } else if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

export interface FilePurgeResult {
  file: string;
  outcome: PurgeOutcome;
}

/** Purges one static database file in place. Returns the outcome; only rewrites the file when something was actually removed, so a clean re-run touches nothing on disk (idempotent). */
export async function purgeDatabaseFile(filePath: string): Promise<FilePurgeResult> {
  const database = JSON.parse(await readFile(filePath, 'utf8')) as CardDatabase;
  const outcome = purgeDigitalCards(database);
  if (outcome.removed > 0) {
    await writeFile(filePath, JSON.stringify(database), 'utf8');
  }
  return { file: filePath, outcome };
}

/** Purges every static database file under `cardsDir` (public/data/cards/). */
export async function purgeAllDatabaseFiles(cardsDir: string): Promise<FilePurgeResult[]> {
  const files = (await findDatabaseFiles(cardsDir)).sort();
  const results: FilePurgeResult[] = [];
  for (const file of files) {
    results.push(await purgeDatabaseFile(file));
  }
  return results;
}

// --- snapshot-all-gens raw input cleanup --------------------------------
//
// data/snapshot-all-gens/<language>/<setId>/ holds one directory per set
// (see snapshotAllGens.ts / bulkExportIngest.ts), keyed by the same setId
// this module already knows how to recognize. Removing a digital-only
// set's directory here means a future `npm run build-database -- --gen N`
// re-run from these raw inputs can never resurrect the cards this script
// just purged from the built output.
export interface SnapshotSetPurgeResult {
  language: string;
  setId: string;
  dir: string;
}

export async function findDigitalSnapshotSetDirs(snapshotAllGensDir: string): Promise<SnapshotSetPurgeResult[]> {
  let languageEntries;
  try {
    languageEntries = await readdir(snapshotAllGensDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: SnapshotSetPurgeResult[] = [];
  for (const languageEntry of languageEntries) {
    if (!languageEntry.isDirectory()) continue;
    const language = languageEntry.name;
    const languageDir = path.join(snapshotAllGensDir, language);
    let setEntries;
    try {
      setEntries = await readdir(languageDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const setEntry of setEntries) {
      if (!setEntry.isDirectory() || !isDigitalOnlySetId(setEntry.name)) continue;
      results.push({ language, setId: setEntry.name, dir: path.join(languageDir, setEntry.name) });
    }
  }
  return results.sort((a, b) =>
    a.language === b.language ? a.setId.localeCompare(b.setId) : a.language.localeCompare(b.language)
  );
}

/** Deletes every digital-only set directory found under data/snapshot-all-gens/. Idempotent: a second run finds nothing (findDigitalSnapshotSetDirs returns []) and deletes nothing. */
export async function purgeSnapshotAllGens(snapshotAllGensDir: string): Promise<SnapshotSetPurgeResult[]> {
  const found = await findDigitalSnapshotSetDirs(snapshotAllGensDir);
  for (const entry of found) {
    await rm(entry.dir, { recursive: true, force: true });
  }
  return found;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// --- CLI -------------------------------------------------------------------

async function main(): Promise<void> {
  const cardsDir = path.resolve(process.cwd(), '..', '..', 'public', 'data', 'cards');
  const snapshotAllGensDir = path.resolve(process.cwd(), 'data', 'snapshot-all-gens');

  console.log('Purging digital-only cards from every static database file...');
  const fileResults = await purgeAllDatabaseFiles(cardsDir);

  let grandRemoved = 0;
  for (const { file, outcome } of fileResults) {
    const rel = path.relative(cardsDir, file);
    if (outcome.removed > 0) {
      console.log(
        `  ${rel}: removed ${outcome.removed} of ${outcome.totalBefore} card(s) -- ${JSON.stringify(outcome.removedBySetId)}`
      );
    } else {
      console.log(`  ${rel}: removed 0 of ${outcome.totalBefore} card(s)`);
    }
    grandRemoved += outcome.removed;
  }
  console.log(`Static database purge: ${grandRemoved} card(s) removed across ${fileResults.length} file(s).`);

  if (await pathExists(snapshotAllGensDir)) {
    console.log('Purging digital-only set directories from data/snapshot-all-gens/...');
    const removedDirs = await purgeSnapshotAllGens(snapshotAllGensDir);
    if (removedDirs.length === 0) {
      console.log('  none found.');
    } else {
      for (const { language, setId, dir } of removedDirs) {
        console.log(`  removed ${language}/${setId} (${dir})`);
      }
    }
    console.log(`Snapshot-all-gens purge: ${removedDirs.length} set directory(ies) removed.`);
  } else {
    console.log('data/snapshot-all-gens/ not present locally; nothing to purge there.');
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
