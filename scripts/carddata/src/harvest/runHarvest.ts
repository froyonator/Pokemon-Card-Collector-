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
import {
  guessCardImageFilename,
  parseCardArticleDisambiguator,
  parseCardInfoboxImageFilename,
  resolveCardImages,
  toFileTitle,
} from './cardImageResolver';
import { buildEnrichmentJobs, type EnrichmentJob, type LocalIncompleteManifest } from './enrichmentJobs';
import {
  buildMissingSetJobs,
  buildZhCnJobs,
  type GapManifest,
  type HarvestJob,
  type ZhCnArticleMappingFile,
} from './harvestJobs';
import { deriveSetNameFromArticleTitle, extractCsCode, parseSetPageWikitext } from './setlistParser';
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

interface RowImageState {
  row: SetlistRow;
  dex: DexEntry;
  candidates: string[];
  resolved: WikiImageInfo | null;
}

/**
 * Builds one row's ordered image-filename candidates (jpg then png at each
 * step).
 *
 * (a) When the card article title carries the "Name (SetName Number)"
 *     disambiguator -- true of every macro- or wikilink-derived title,
 *     reprint rows included, where SetName is the origin set the scan
 *     actually files under -- derive the filename straight from it
 *     (confirmed live: a Trick or Trade 2022 row, cardArticleTitle
 *     "Cubone (Battle Styles 69)", resolves to the real
 *     "CuboneBattleStyles69.jpg" this way even though the row itself lives
 *     in a Trick or Trade promo set list).
 * (b) Only when (a) doesn't apply (a bare `literal` name with no
 *     parenthetical): the promo set's own name, plus the row's
 *     originSetName when the number cell carried a reprint's origin-set
 *     symbol.
 */
export function buildRowImageCandidates(promoSetName: string, row: SetlistRow): string[] {
  const disambiguator = parseCardArticleDisambiguator(row.cardArticleTitle);
  if (disambiguator) {
    return [
      guessCardImageFilename({
        cardName: disambiguator.cardName,
        setName: disambiguator.setName,
        cardNumber: disambiguator.number,
        extension: 'jpg',
      }),
      guessCardImageFilename({
        cardName: disambiguator.cardName,
        setName: disambiguator.setName,
        cardNumber: disambiguator.number,
        extension: 'png',
      }),
    ];
  }

  const cardName = deriveImageGuessCardName(row.cardArticleTitle);
  const setNames = row.originSetName ? [promoSetName, row.originSetName] : [promoSetName];
  const candidates: string[] = [];
  for (const setName of setNames) {
    candidates.push(
      guessCardImageFilename({ cardName, setName, cardNumber: row.cardNumber, extension: 'jpg' }),
      guessCardImageFilename({ cardName, setName, cardNumber: row.cardNumber, extension: 'png' })
    );
  }
  return candidates;
}

/**
 * (c) fallback: fetches a still-unresolved row's own card article wikitext
 * and reads its infobox `image=` field -- the authoritative source, used
 * only once the filename-guess strategies (a)/(b) have both come up empty
 * (fetching every card's own article page for every row would defeat the
 * whole point of the batched imageinfo guess above). The fetched article
 * can turn out to be a shared multi-printing one (confirmed live: several
 * printings of the same card sharing one article via `reprintN` fields,
 * with the bare `image=` belonging to whichever printing is listed
 * first -- not necessarily this row's), so the disambiguator's own setName
 * (what strategy (a) would have targeted) is included among the set names
 * `parseCardInfoboxImageFilename` matches a numbered field against,
 * alongside the row's originSetName and the promo set it was harvested
 * from.
 */
async function resolveViaCardArticleInfobox(
  parsePageWikitext: WikiApiClient['parsePageWikitext'],
  row: SetlistRow,
  promoSetName: string
): Promise<string | null> {
  try {
    const page = await parsePageWikitext(row.cardArticleTitle);
    const disambiguatorSetName = parseCardArticleDisambiguator(row.cardArticleTitle)?.setName ?? null;
    const targetSetNames = [disambiguatorSetName, row.originSetName, promoSetName].filter(
      (s): s is string => Boolean(s)
    );
    return parseCardInfoboxImageFilename(page.wikitext, targetSetNames);
  } catch {
    return null;
  }
}

/**
 * Resolves images for Gen1-filtered rows: batched filename-guess strategies
 * (a)/(b) first (each round queries every still-unresolved row's next
 * candidate in one batched imageinfo request, so the number of requests is
 * bounded by the longest candidate list, not by row count), then -- for
 * whatever's still unresolved -- strategy (c), the card article's own
 * infobox (see cardImageResolver.ts's own caveat: that literal filename is
 * the authoritative source; the guesses are what make bulk resolution
 * affordable in the first place). `parsePageWikitext` is optional on the
 * client type so callers that only need (a)/(b) (e.g. this module's own
 * tests) don't have to stub it.
 */
export async function resolveHarvestedCardImages(
  client: Pick<WikiApiClient, 'queryImageInfo'> & { parsePageWikitext?: WikiApiClient['parsePageWikitext'] },
  setName: string,
  gen1Rows: Gen1MatchedRow[]
): Promise<HarvestedCard[]> {
  if (gen1Rows.length === 0) return [];

  const states: RowImageState[] = gen1Rows.map(({ row, dex }) => ({
    row,
    dex,
    candidates: buildRowImageCandidates(setName, row),
    resolved: null,
  }));

  const maxCandidates = states.reduce((max, s) => Math.max(max, s.candidates.length), 0);
  for (let round = 0; round < maxCandidates; round++) {
    const pending = states.filter((s) => !s.resolved && round < s.candidates.length);
    if (pending.length === 0) continue;
    const info = await resolveCardImages(
      client,
      pending.map((s) => s.candidates[round])
    );
    for (const state of pending) {
      const result = info.get(toFileTitle(state.candidates[round]));
      if (result && !result.missing) state.resolved = result;
    }
  }

  const parsePageWikitext = client.parsePageWikitext;
  if (parsePageWikitext) {
    for (const state of states) {
      if (state.resolved) continue;
      const filename = await resolveViaCardArticleInfobox(parsePageWikitext, state.row, setName);
      if (!filename) continue;
      const info = await resolveCardImages(client, [filename]);
      const result = info.get(toFileTitle(filename));
      if (result && !result.missing) state.resolved = result;
    }
  }

  return states.map((state) => ({
    dexNumber: state.dex.number,
    name: state.row.displayName,
    cardArticleTitle: state.row.cardArticleTitle,
    cardNumber: state.row.cardNumber,
    localId: extractNumerator(state.row.cardNumber),
    rarity: state.row.rarity,
    regulationMark: state.row.regulationMark,
    imageFileTitle: state.resolved ? state.resolved.fileTitle : null,
    imageUrl: state.resolved ? state.resolved.url : null,
    imageMissing: !state.resolved,
  }));
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

/** Below this fraction of held cards matching a parsed row by localId, the resolved article is treated as the wrong one and the whole set is skipped -- see computeEnrichmentMatchRate. */
export const ENRICHMENT_MATCH_THRESHOLD = 0.3;

/**
 * Safety guard for enrichment: the wiki article for a held set is found via
 * a search heuristic (resolveEnrichmentArticleTitle) that can match the
 * wrong article entirely (a same-named set from a different product line,
 * a disambiguation page, ...). Before applying any fills from a resolved
 * article, checks what fraction of the job's held cards actually match one
 * of its parsed rows by localId, using the same leading-zero-stripped
 * normalization mergeHarvest's own dedup key uses -- a low match rate means
 * the article is almost certainly the wrong one, not that our data is just
 * incomplete.
 */
export function computeEnrichmentMatchRate(
  cardIds: string[],
  rows: SetlistRow[],
  idIndex: Map<string, Pick<CardRecord, 'localId'>>
): number {
  const heldNumerators = cardIds
    .map((id) => idIndex.get(id)?.localId)
    .filter((localId): localId is string => Boolean(localId))
    .map(normalizeNumerator);
  if (heldNumerators.length === 0) return 0;

  const parsedNumerators = new Set(rows.map((row) => normalizeNumerator(row.cardNumber)));
  const matched = heldNumerators.filter((numerator) => parsedNumerators.has(numerator)).length;
  return matched / heldNumerators.length;
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

// --- zh-cn setId resolution ---------------------------------------------------

export interface ZhCnSetIdResolution {
  setId: string;
  /** True when the fetched article's own infobox carried a CS code that disagreed with the mapping's proposed setId -- the caller should log a warning. */
  mismatched: boolean;
}

/**
 * Resolves a zh-cn missing-set job's final setId: prefers a CS-series code
 * found in the fetched article's own infobox over the curated mapping's
 * proposed setId when the two disagree (the live infobox is the
 * authoritative source; the mapping is a hand-curated guess, sometimes with
 * no code recorded at all -- see data/harvest/zh-cn-articles.json). Pure
 * and side-effect-free -- the caller is responsible for logging the actual
 * warning when `mismatched` is true.
 */
export function resolveZhCnSetId(proposedSetId: string, infoboxCsCode: string | null): ZhCnSetIdResolution {
  if (!infoboxCsCode) return { setId: proposedSetId, mismatched: false };
  const infoboxSetId = infoboxCsCode.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (!infoboxSetId || infoboxSetId === proposedSetId) return { setId: proposedSetId, mismatched: false };
  return { setId: infoboxSetId, mismatched: true };
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
const ZH_CN_ARTICLES_PATH = path.join(DATA_DIR, 'harvest', 'zh-cn-articles.json');
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

/**
 * zh-cn has no per-set data in the gap manifest (just one aggregated
 * "CS-series sets" row), so its jobs come from the curated article mapping
 * instead -- see buildZhCnJobs's own doc comment. Unresolved mapping
 * entries (no known article yet) are reported here rather than attempted.
 */
async function loadZhCnJobs(): Promise<HarvestJob[]> {
  const mapping = JSON.parse(await readFile(ZH_CN_ARTICLES_PATH, 'utf8')) as ZhCnArticleMappingFile;
  const { jobs, unresolved } = buildZhCnJobs(mapping);
  if (unresolved.length > 0) {
    console.log(`${unresolved.length} zh-cn mapping entr(y/ies) have no known article yet -- unresolved:`);
    for (const entry of unresolved) console.log(`  [unresolved] ${entry.key}: ${entry.notes}`);
  }
  return jobs;
}

async function runMissingSets(cli: CliArgs): Promise<void> {
  const allJobs: HarvestJob[] =
    cli.language === 'zh-cn'
      ? await loadZhCnJobs()
      : buildMissingSetJobs(JSON.parse(await readFile(GAP_MANIFEST_PATH, 'utf8')) as GapManifest, [cli.language]);
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

      // zh-cn's mapping code is a hand-curated guess (often absent
      // entirely); the live article's own infobox is authoritative when it
      // carries a CS-series code, so it wins on disagreement.
      let setId = job.proposedSetId;
      if (cli.language === 'zh-cn') {
        const resolution = resolveZhCnSetId(job.proposedSetId, extractCsCode(parsed.setInfo));
        if (resolution.mismatched) {
          console.warn(
            `  setId mismatch for ${job.setName}: mapping proposed "${job.proposedSetId}", infobox carries "${resolution.setId}" -- using the infobox value.`
          );
        }
        setId = resolution.setId;
      }

      const cards = await resolveHarvestedCardImages(client, realSetName, gen1Rows);

      const result: SetHarvestResult = {
        language: cli.language,
        setId,
        setName: realSetName,
        sourceArticleTitle: page.title,
        harvestedAt: new Date().toISOString(),
        totalRows: allRows.length,
        gen1Count: gen1Rows.length,
        imagesResolved: cards.filter((c) => c.imageUrl).length,
        cards,
      };

      await writeFile(path.join(outputDir, `${setId}.json`), JSON.stringify(result, null, 2), 'utf8');

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

      // The search heuristic above can resolve to the wrong article
      // entirely (a same-named set from a different product line, a
      // disambiguation page, ...); require a credible fraction of our held
      // cards to actually show up in it by localId before trusting any fill
      // it would produce.
      const matchRate = computeEnrichmentMatchRate(job.cardIds, rows, idIndex);
      if (matchRate < ENRICHMENT_MATCH_THRESHOLD) {
        console.error(`  SKIPPED ${job.setId}: resolved article did not match our held cards closely enough.`);
        continue;
      }

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
