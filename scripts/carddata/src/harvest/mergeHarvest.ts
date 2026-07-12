// scripts/carddata/src/harvest/mergeHarvest.ts
//
// Merges data/harvest/<lang>/*.json (this harvester's own output, written
// by runHarvest.ts) into public/data/cards/<lang>.json, the app's static
// per-language database. Two file shapes, two merge paths:
//
//   <setId>.json          A whole new set (SetHarvestResult) -> new
//                          CardRecords, deduped against what we already
//                          hold.
//   enrich-<setId>.json   Fills for a set we already hold (EnrichmentResult)
//                          -> in-place updates on existing records only,
//                          never new records.
//
// Follows the established patterns in augmentFromSupplemental.ts (same
// CardRecord shape, same normalized-setId + leading-zero-stripped-localId
// dedup key) rather than reinventing them.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dedupKey, normalizeSetCode, type CardRecord } from '../augmentFromSupplemental';
import type { EnrichmentResult, HarvestedCard, SetHarvestResult } from './runHarvest';

const DATA_DIR = 'data';
const APP_CARDS_DIR = path.resolve('..', '..', 'public', 'data', 'cards');

function harvestOutputDir(language: string): string {
  return path.join(DATA_DIR, 'harvest', language);
}

/** Converts one harvested card row into this app's CardRecord shape, per language/setId. Image guesses that never resolved are skipped -- a record with no image adds nothing displayable. */
export function harvestedCardToRecord(
  card: HarvestedCard,
  language: string,
  setId: string,
  setName: string
): CardRecord | null {
  if (!card.imageUrl) return null;
  return {
    id: `wk-${language}-${setId}-${card.localId}`,
    name: card.name,
    dexNumber: card.dexNumber,
    setId,
    setName,
    localId: card.localId,
    rarity: card.rarity ?? 'Unknown',
    imageBase: '',
    language,
    hostedThumbUrl: card.imageUrl,
    hostedFullUrl: card.imageUrl,
  };
}

export interface MissingSetMergeOutcome {
  setId: string;
  candidateCount: number;
  added: number;
  skippedNoImage: number;
  skippedExisting: number;
  overlapRate: number;
  aborted: boolean;
  abortReason: string | null;
}

/**
 * Merges one harvested set into `existing` (mutated in place on success).
 * Dedup key mirrors augmentFromSupplemental's own: normalized setId +
 * leading-zero-stripped localId, so a card independently re-derived by a
 * later run (or already present from a different source) never duplicates.
 *
 * Safety valve is the OPPOSITE direction of augmentFromSupplemental's: that
 * script merges a source with heavy legitimate overlap with what we already
 * hold, so a LOW overlap rate is the red flag (misaligned join key). Here
 * every harvested set is supposed to be entirely NEW to us -- so a HIGH
 * overlap rate is the red flag instead: it means proposedSetId collided
 * with an already-held, unrelated set and this merge would silently fold
 * two different sets together.
 */
export function mergeMissingSet(
  existing: Record<string, CardRecord[]>,
  harvested: SetHarvestResult
): MissingSetMergeOutcome {
  const existingKeys = new Set<string>();
  for (const bucket of Object.values(existing)) {
    for (const card of bucket) existingKeys.add(dedupKey(card.setId, card.localId));
  }

  const setId = normalizeSetCode(harvested.setId);
  const candidates = harvested.cards
    .map((card) => harvestedCardToRecord(card, harvested.language, setId, harvested.setName))
    .filter((record): record is CardRecord => record !== null);

  let skippedExisting = 0;
  for (const record of candidates) {
    if (existingKeys.has(dedupKey(record.setId, record.localId))) skippedExisting++;
  }
  const overlapRate = candidates.length === 0 ? 0 : skippedExisting / candidates.length;

  if (overlapRate > 0.5 && skippedExisting > 5) {
    return {
      setId,
      candidateCount: candidates.length,
      added: 0,
      skippedNoImage: harvested.cards.length - candidates.length,
      skippedExisting,
      overlapRate,
      aborted: true,
      abortReason: `overlap with existing data is implausibly high (${skippedExisting}/${candidates.length}, ${(overlapRate * 100).toFixed(1)}%) -- proposedSetId "${setId}" likely collides with an already-held, unrelated set. Nothing written.`,
    };
  }

  let added = 0;
  const seenThisRun = new Set<string>();
  for (const record of candidates) {
    const key = dedupKey(record.setId, record.localId);
    if (existingKeys.has(key) || seenThisRun.has(key)) continue;
    seenThisRun.add(key);
    (existing[record.dexNumber] ??= []).push(record);
    added++;
  }

  return {
    setId,
    candidateCount: candidates.length,
    added,
    skippedNoImage: harvested.cards.length - candidates.length,
    skippedExisting,
    overlapRate,
    aborted: false,
    abortReason: null,
  };
}

export interface EnrichmentMergeOutcome {
  setId: string;
  requested: number;
  rarityFilled: number;
  setNameFilled: number;
  notFound: number;
}

/**
 * Applies enrichment fills to existing records IN PLACE: rarity is filled
 * only when the held record is currently missing/Unknown (never overwrites
 * a rarity we already trust), and a bare-code setName is replaced with the
 * real one. Never creates new records.
 */
export function applyEnrichment(
  existing: Record<string, CardRecord[]>,
  enrichment: EnrichmentResult
): EnrichmentMergeOutcome {
  const byId = new Map<string, CardRecord>();
  for (const bucket of Object.values(existing)) {
    for (const record of bucket) byId.set(record.id, record);
  }

  let rarityFilled = 0;
  let setNameFilled = 0;
  let notFound = 0;

  for (const fill of enrichment.fills) {
    const record = byId.get(fill.cardId);
    if (!record) {
      notFound++;
      continue;
    }
    if (fill.rarity && (!record.rarity || record.rarity === 'Unknown')) {
      record.rarity = fill.rarity;
      rarityFilled++;
    }
    if (fill.setName) {
      record.setName = fill.setName;
      setNameFilled++;
    }
  }

  return { setId: enrichment.setId, requested: enrichment.fills.length, rarityFilled, setNameFilled, notFound };
}

function isEnrichmentFile(filename: string): boolean {
  return filename.startsWith('enrich-');
}

async function loadHarvestFiles(
  language: string
): Promise<{ missingSetFiles: string[]; enrichmentFiles: string[] }> {
  let filenames: string[];
  try {
    filenames = await readdir(harvestOutputDir(language));
  } catch {
    return { missingSetFiles: [], enrichmentFiles: [] };
  }
  const jsonFiles = filenames.filter((f) => f.endsWith('.json') && f !== 'progress.json');
  return {
    missingSetFiles: jsonFiles.filter((f) => !isEnrichmentFile(f)),
    enrichmentFiles: jsonFiles.filter(isEnrichmentFile),
  };
}

interface CliArgs {
  language: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let language: string | undefined;
  let dryRun = false;
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (flag === '--lang') {
      language = args.shift();
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  if (!language) throw new Error('Usage: npm run harvest:merge -- --lang <code> [--dry-run]');
  return { language, dryRun };
}

async function main(): Promise<void> {
  const { language, dryRun } = parseArgs(process.argv.slice(2));
  const { missingSetFiles, enrichmentFiles } = await loadHarvestFiles(language);

  if (missingSetFiles.length === 0 && enrichmentFiles.length === 0) {
    console.log(`${language}: no harvest output found in ${harvestOutputDir(language)}; nothing to merge.`);
    return;
  }

  const targetPath = path.join(APP_CARDS_DIR, `${language}.json`);
  const existing: Record<string, CardRecord[]> = JSON.parse(await readFile(targetPath, 'utf8'));
  const before = Object.values(existing).reduce((n, b) => n + b.length, 0);

  for (const filename of missingSetFiles) {
    const harvested: SetHarvestResult = JSON.parse(
      await readFile(path.join(harvestOutputDir(language), filename), 'utf8')
    );
    const outcome = mergeMissingSet(existing, harvested);
    if (outcome.aborted) {
      console.error(`${language}/${outcome.setId}: ABORTED -- ${outcome.abortReason}`);
      continue;
    }
    console.log(
      `${language}/${outcome.setId}: candidates=${outcome.candidateCount} added=${outcome.added} ` +
        `alreadyHad=${outcome.skippedExisting} noImage=${outcome.skippedNoImage} ` +
        `(overlap ${(outcome.overlapRate * 100).toFixed(1)}%)` +
        (dryRun ? ' [dry-run, not written]' : '')
    );
  }

  for (const filename of enrichmentFiles) {
    const enrichment: EnrichmentResult = JSON.parse(
      await readFile(path.join(harvestOutputDir(language), filename), 'utf8')
    );
    const outcome = applyEnrichment(existing, enrichment);
    console.log(
      `${language}/${outcome.setId} (enrich): requested=${outcome.requested} ` +
        `rarityFilled=${outcome.rarityFilled} setNameFilled=${outcome.setNameFilled} notFound=${outcome.notFound}` +
        (dryRun ? ' [dry-run, not written]' : '')
    );
  }

  if (dryRun) {
    console.log(`${language}: dry-run complete, ${targetPath} was NOT modified.`);
    return;
  }

  await writeFile(targetPath, JSON.stringify(existing), 'utf8');
  const after = Object.values(existing).reduce((n, b) => n + b.length, 0);
  console.log(
    `${language}: ${before} => ${after} cards, ${(Buffer.byteLength(JSON.stringify(existing)) / 1024).toFixed(1)} KB`
  );
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('mergeHarvest')) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
