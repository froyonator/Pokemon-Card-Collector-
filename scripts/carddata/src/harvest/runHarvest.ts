// scripts/carddata/src/harvest/runHarvest.ts
//
// CLI entrypoint for the reference-wiki harvester. Two job types:
//
//   --job missing-sets  Fetches whole sets we don't hold at all yet (from
//                        the gap manifest's languages.<lang>.missingSets),
//                        Gen1-filters their card list, resolves images, and
//                        writes one output file per set.
//
//   --job enrich        For sets we ALREADY hold but with data holes
//                        (missing rarity and/or a bare-code placeholder
//                        setName), fetches that set's wiki set-list ONCE
//                        and maps rows to our held cards by localId to
//                        compute the fields that would be filled in.
//
// Both job types checkpoint into data/harvest/progress.json after EVERY
// set, so a killed run resumes exactly where it left off (already-done
// sets are skipped on the next invocation, not re-fetched). Console output
// is deliberately generic -- no source names -- per this pipeline's
// provenance-handling convention; see mergeHarvest.ts for turning this
// output into public/data/cards/<lang>.json changes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CardRecord } from '../augmentFromSupplemental';
import { GEN1_DEX, type DexEntry } from '../../../../src/data/gen1Dex';
import { guessCardImageFilename, resolveCardImages, toFileTitle } from './cardImageResolver';
import { buildEnrichmentJobs, type EnrichmentJob, type LocalIncompleteManifest } from './enrichmentJobs';
import { buildMissingSetJobs, type GapManifest, type HarvestJob } from './harvestJobs';
import { deriveSetNameFromArticleTitle, parseSetPageWikitext } from './setlistParser';
import type { SetlistRow, WikiImageInfo } from './types';
import { createWikiApiClient, type WikiApiClient } from './wikiApiClient';

// --- Gen1 name matching -----------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches a setlist row's displayed name against the app's canonical Gen1
 * dex list (English names). Matches on a word-boundary PREFIX so suffixed
 * forms ("Pikachu ex", "Charizard V") still match their base species, and
 * picks the longest matching dex name when more than one prefixes it.
 * Trainer/Energy cards and later-gen Pokemon simply match nothing.
 */
export function matchGen1DexEntry(displayName: string, dex: DexEntry[] = GEN1_DEX): DexEntry | null {
  const normalized = displayName.trim();
  let best: DexEntry | null = null;
  for (const entry of dex) {
    const pattern = new RegExp(`^${escapeRegExp(entry.name)}(?:[\\s-].*)?$`, 'i');
    if (pattern.test(normalized) && (!best || entry.name.length > best.name.length)) {
      best = entry;
    }
  }
  return best;
}

export interface Gen1MatchedRow {
  row: SetlistRow;
  dex: DexEntry;
}

/** Filters setlist rows down to the ones naming a Gen1 Pokemon. Rows with no match are dropped, not erred on -- see matchGen1DexEntry. */
export function filterGen1Rows(rows: SetlistRow[], dex: DexEntry[] = GEN1_DEX): Gen1MatchedRow[] {
  const matched: Gen1MatchedRow[] = [];
  for (const row of rows) {
    const entry = matchGen1DexEntry(row.displayName, dex);
    if (entry) matched.push({ row, dex: entry });
  }
  return matched;
}

/** The raw printed numerator of a "NNN/TTT" card number, leading zeros kept as printed (matches this app's existing localId convention). */
export function extractNumerator(cardNumber: string): string {
  return cardNumber.split('/')[0]?.trim() ?? cardNumber.trim();
}

/** Leading-zero-stripped numerator, for matching/dedup keys (mirrors augmentFromSupplemental.ts's own dedupKey convention). */
export function normalizeNumerator(value: string): string {
  return extractNumerator(value).replace(/^0+(?=\d)/, '');
}

/**
 * Best-effort printed card name for the image-filename guess: the card's
 * own article title with its trailing "(Set Number)" disambiguator
 * stripped, e.g. "Pikachu ex (Surging Sparks 57)" -> "Pikachu ex".
 */
export function deriveImageGuessCardName(cardArticleTitle: string): string {
  return cardArticleTitle.replace(/\s*\([^)]*\)\s*$/, '').trim() || cardArticleTitle;
}

// --- Missing-set harvest -----------------------------------------------------

export interface HarvestedCard {
  dexNumber: number;
  name: string;
  cardArticleTitle: string;
  cardNumber: string;
  localId: string;
  rarity: string | null;
  regulationMark: string | null;
  imageFileTitle: string | null;
  imageUrl: string | null;
  imageMissing: boolean;
}

export interface SetHarvestResult {
  language: string;
  setId: string;
  setName: string;
  sourceArticleTitle: string;
  harvestedAt: string;
  totalRows: number;
  gen1Count: number;
  imagesResolved: number;
  cards: HarvestedCard[];
}

interface RowImageGuess {
  row: SetlistRow;
  dex: DexEntry;
  jpgFilename: string;
  pngFilename: string;
}

export function buildImageGuesses(setName: string, gen1Rows: Gen1MatchedRow[]): RowImageGuess[] {
  return gen1Rows.map(({ row, dex }) => {
    const cardName = deriveImageGuessCardName(row.cardArticleTitle);
    return {
      row,
      dex,
      jpgFilename: guessCardImageFilename({ cardName, setName, cardNumber: row.cardNumber, extension: 'jpg' }),
      pngFilename: guessCardImageFilename({ cardName, setName, cardNumber: row.cardNumber, extension: 'png' }),
    };
  });
}

/**
 * Resolves images for Gen1-filtered rows via a best-effort filename guess
 * (see cardImageResolver.ts's own caveat: the literal infobox filename is
 * the authoritative source, but fetching every card's own article page is
 * out of scope here -- this guesses .jpg first, then .png for whatever
 * didn't resolve, confirming each guess against real imageinfo rather than
 * trusting it blind).
 */
export async function resolveHarvestedCardImages(
  client: Pick<WikiApiClient, 'queryImageInfo'>,
  setName: string,
  gen1Rows: Gen1MatchedRow[]
): Promise<HarvestedCard[]> {
  if (gen1Rows.length === 0) return [];
  const guesses = buildImageGuesses(setName, gen1Rows);

  const jpgInfo = await resolveCardImages(client, guesses.map((g) => g.jpgFilename));
  const needsPng = guesses.filter((g) => {
    const info = jpgInfo.get(toFileTitle(g.jpgFilename));
    return !info || info.missing;
  });
  const pngInfo =
    needsPng.length > 0
      ? await resolveCardImages(client, needsPng.map((g) => g.pngFilename))
      : new Map<string, WikiImageInfo>();

  return guesses.map((guess) => {
    const jpgResult = jpgInfo.get(toFileTitle(guess.jpgFilename));
    const pngResult = pngInfo.get(toFileTitle(guess.pngFilename));
    const resolved =
      jpgResult && !jpgResult.missing ? jpgResult : pngResult && !pngResult.missing ? pngResult : null;
    return {
      dexNumber: guess.dex.number,
      name: guess.row.displayName,
      cardArticleTitle: guess.row.cardArticleTitle,
      cardNumber: guess.row.cardNumber,
      localId: extractNumerator(guess.row.cardNumber),
      rarity: guess.row.rarity,
      regulationMark: guess.row.regulationMark,
      imageFileTitle: resolved ? resolved.fileTitle : null,
      imageUrl: resolved ? resolved.url : null,
      imageMissing: !resolved,
    };
  });
}

// --- Enrichment -------------------------------------------------------------

export interface EnrichmentFill {
  cardId: string;
  rarity: string | null;
  setName: string | null;
}

export interface EnrichmentResult {
  language: string;
  setId: string;
  sourceArticleTitle: string;
  realSetName: string;
  harvestedAt: string;
  requestedCount: number;
  resolvedCount: number;
  fills: EnrichmentFill[];
}

/**
 * Maps an enrichment job's held card ids to the fields the wiki's set-list
 * would fill in, by localId (not by parsing the card id string -- ids from
 * different upstream sources encode different things after the hyphen, so
 * the real held record's own `localId` field is the only reliable join
 * key). Cards with no matching row, or with nothing left to fill, are
 * dropped rather than emitted as no-op fills.
 */
export function computeEnrichmentFills(
  job: Pick<EnrichmentJob, 'cardIds' | 'needsRarity' | 'needsSetName'>,
  rows: SetlistRow[],
  idIndex: Map<string, Pick<CardRecord, 'localId'>>,
  realSetName: string
): EnrichmentFill[] {
  const byNumerator = new Map<string, SetlistRow>();
  for (const row of rows) {
    const numerator = normalizeNumerator(row.cardNumber);
    if (!byNumerator.has(numerator)) byNumerator.set(numerator, row);
  }

  const fills: EnrichmentFill[] = [];
  for (const cardId of job.cardIds) {
    const record = idIndex.get(cardId);
    if (!record) continue;
    const row = byNumerator.get(normalizeNumerator(record.localId));
    if (!row) continue;
    const rarity = job.needsRarity && row.rarity ? row.rarity : null;
    const setName = job.needsSetName ? realSetName : null;
    if (rarity === null && setName === null) continue;
    fills.push({ cardId, rarity, setName });
  }
  return fills;
}

export function buildCardIdIndex(cardsByDex: Record<string, CardRecord[]>): Map<string, CardRecord> {
  const index = new Map<string, CardRecord>();
  for (const bucket of Object.values(cardsByDex)) {
    for (const record of bucket) index.set(record.id, record);
  }
  return index;
}

async function resolveEnrichmentArticleTitle(
  client: Pick<WikiApiClient, 'searchPageTitles'>,
  setId: string
): Promise<string | null> {
  const results = await client.searchPageTitles(setId, { limit: 5 });
  const match = results.find((r) => /\(A?TCG\)$/.test(r.title));
  return match ? match.title : null;
}

// --- Checkpoint/resume -------------------------------------------------------

export interface ProgressFile {
  missingSets: Record<string, Record<string, { setName: string; gen1Count: number; totalRows: number; completedAt: string }>>;
  enrich: Record<string, Record<string, { needsRarity: boolean; needsSetName: boolean; appliedCount: number; completedAt: string }>>;
}

export function emptyProgress(): ProgressFile {
  return { missingSets: {}, enrich: {} };
}

export function isMissingSetDone(progress: ProgressFile, language: string, proposedSetId: string): boolean {
  return Boolean(progress.missingSets[language]?.[proposedSetId]);
}

export function isEnrichDone(progress: ProgressFile, language: string, setId: string): boolean {
  return Boolean(progress.enrich[language]?.[setId]);
}

/** Pure job-selection: drops already-done jobs, then applies an optional cap (for smoke tests). */
export function selectPendingJobs<T>(jobs: T[], isDone: (job: T) => boolean, limit?: number): T[] {
  const pending = jobs.filter((job) => !isDone(job));
  return typeof limit === 'number' ? pending.slice(0, limit) : pending;
}

// --- CLI ---------------------------------------------------------------------

interface CliArgs {
  language: string;
  job: 'missing-sets' | 'enrich';
  limit?: number;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  let language: string | undefined;
  let job: CliArgs['job'] | undefined;
  let limit: number | undefined;
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
    if (flag === '--job') {
      const value = args.shift();
      if (value !== 'missing-sets' && value !== 'enrich') {
        throw new Error('--job must be "missing-sets" or "enrich".');
      }
      job = value;
      continue;
    }
    if (flag === '--limit') {
      const value = args.shift();
      limit = value === undefined ? NaN : Number(value);
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  if (!language) {
    throw new Error(
      'Usage: npm run harvest -- --lang <code> --job <missing-sets|enrich> [--limit <n>] [--dry-run]'
    );
  }
  if (!job) throw new Error('--job is required: "missing-sets" or "enrich".');
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error('--limit must be a non-negative integer.');
  }
  return { language, job, limit, dryRun };
}

const DATA_DIR = 'data';
const GAP_MANIFEST_PATH = path.join(DATA_DIR, 'gap-audit', 'GAP-MANIFEST.json');
const LOCAL_INCOMPLETE_PATH = path.join(DATA_DIR, 'gap-audit', 'local-incomplete.json');
const PROGRESS_PATH = path.join(DATA_DIR, 'harvest', 'progress.json');
const APP_CARDS_DIR = path.resolve('..', '..', 'public', 'data', 'cards');

function harvestOutputDir(language: string): string {
  return path.join(DATA_DIR, 'harvest', language);
}

async function loadProgress(): Promise<ProgressFile> {
  try {
    return JSON.parse(await readFile(PROGRESS_PATH, 'utf8')) as ProgressFile;
  } catch {
    return emptyProgress();
  }
}

async function saveProgress(progress: ProgressFile): Promise<void> {
  await mkdir(path.dirname(PROGRESS_PATH), { recursive: true });
  await writeFile(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
}

async function runMissingSets(cli: CliArgs): Promise<void> {
  const manifest = JSON.parse(await readFile(GAP_MANIFEST_PATH, 'utf8')) as GapManifest;
  const allJobs: HarvestJob[] = buildMissingSetJobs(manifest, [cli.language]);
  const progress = await loadProgress();
  const pending = selectPendingJobs(
    allJobs,
    (job) => isMissingSetDone(progress, job.language, job.proposedSetId),
    cli.limit
  );

  console.log(
    `Planned ${allJobs.length} missing-set job(s) for ${cli.language}; ${pending.length} pending after resume filter` +
      (typeof cli.limit === 'number' ? ` (limited to ${cli.limit})` : '') +
      '.'
  );
  if (cli.dryRun) {
    for (const job of pending) {
      console.log(`  [dry-run] ${job.proposedSetId}: cardCount=${job.cardCount ?? 'unknown'}`);
    }
    return;
  }
  if (pending.length === 0) return;

  const client = createWikiApiClient();
  const outputDir = harvestOutputDir(cli.language);
  await mkdir(outputDir, { recursive: true });

  for (let i = 0; i < pending.length; i++) {
    const job = pending[i];
    console.log(`harvesting set ${i + 1}/${pending.length} for ${cli.language}`);
    try {
      const page = await client.parsePageWikitext(job.setName);
      const parsed = parseSetPageWikitext(page.wikitext);
      const allRows = [...parsed.cardListRows, ...parsed.additionalCardRows];
      const gen1Rows = filterGen1Rows(allRows);
      const realSetName = deriveSetNameFromArticleTitle(page.title);

      const cards = await resolveHarvestedCardImages(client, realSetName, gen1Rows);

      const result: SetHarvestResult = {
        language: cli.language,
        setId: job.proposedSetId,
        setName: realSetName,
        sourceArticleTitle: page.title,
        harvestedAt: new Date().toISOString(),
        totalRows: allRows.length,
        gen1Count: gen1Rows.length,
        imagesResolved: cards.filter((c) => c.imageUrl).length,
        cards,
      };

      await writeFile(path.join(outputDir, `${job.proposedSetId}.json`), JSON.stringify(result, null, 2), 'utf8');

      progress.missingSets[cli.language] ??= {};
      progress.missingSets[cli.language][job.proposedSetId] = {
        setName: realSetName,
        gen1Count: gen1Rows.length,
        totalRows: allRows.length,
        completedAt: result.harvestedAt,
      };
      await saveProgress(progress);

      console.log(
        `  done: ${allRows.length} row(s), ${gen1Rows.length} Gen1, ${result.imagesResolved} image(s) resolved.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${job.proposedSetId}: ${message}`);
    }
  }
}

async function runEnrich(cli: CliArgs): Promise<void> {
  const localIncomplete = JSON.parse(await readFile(LOCAL_INCOMPLETE_PATH, 'utf8')) as LocalIncompleteManifest;
  const allJobs: EnrichmentJob[] = buildEnrichmentJobs(localIncomplete, [cli.language]);
  const progress = await loadProgress();
  const pending = selectPendingJobs(allJobs, (job) => isEnrichDone(progress, job.language, job.setId), cli.limit);

  console.log(
    `Planned ${allJobs.length} enrichment job(s) for ${cli.language}; ${pending.length} pending` +
      (typeof cli.limit === 'number' ? ` (limited to ${cli.limit})` : '') +
      '.'
  );
  if (cli.dryRun) {
    for (const job of pending) {
      console.log(
        `  [dry-run] ${job.setId}: needsRarity=${job.needsRarity} needsSetName=${job.needsSetName} cards=${job.cardIds.length}`
      );
    }
    return;
  }
  if (pending.length === 0) return;

  const cardsPath = path.join(APP_CARDS_DIR, `${cli.language}.json`);
  const cardsByDex = JSON.parse(await readFile(cardsPath, 'utf8')) as Record<string, CardRecord[]>;
  const idIndex = buildCardIdIndex(cardsByDex);

  const client = createWikiApiClient();
  const outputDir = harvestOutputDir(cli.language);
  await mkdir(outputDir, { recursive: true });

  for (let i = 0; i < pending.length; i++) {
    const job = pending[i];
    console.log(`enriching set ${i + 1}/${pending.length} for ${cli.language}`);
    try {
      const articleTitle = await resolveEnrichmentArticleTitle(client, job.setId);
      if (!articleTitle) {
        console.error(`  SKIPPED ${job.setId}: no wiki article resolved from search.`);
        continue;
      }
      const page = await client.parsePageWikitext(articleTitle);
      const parsed = parseSetPageWikitext(page.wikitext);
      const rows = [...parsed.cardListRows, ...parsed.additionalCardRows];
      const realSetName = deriveSetNameFromArticleTitle(page.title);

      const fills = computeEnrichmentFills(job, rows, idIndex, realSetName);

      const result: EnrichmentResult = {
        language: cli.language,
        setId: job.setId,
        sourceArticleTitle: articleTitle,
        realSetName,
        harvestedAt: new Date().toISOString(),
        requestedCount: job.cardIds.length,
        resolvedCount: fills.length,
        fills,
      };

      await writeFile(
        path.join(outputDir, `enrich-${job.setId}.json`),
        JSON.stringify(result, null, 2),
        'utf8'
      );

      progress.enrich[cli.language] ??= {};
      progress.enrich[cli.language][job.setId] = {
        needsRarity: job.needsRarity,
        needsSetName: job.needsSetName,
        appliedCount: fills.length,
        completedAt: result.harvestedAt,
      };
      await saveProgress(progress);

      console.log(`  done: ${fills.length}/${job.cardIds.length} matched.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${job.setId}: ${message}`);
    }
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.job === 'missing-sets') await runMissingSets(cli);
  else await runEnrich(cli);
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('runHarvest')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
