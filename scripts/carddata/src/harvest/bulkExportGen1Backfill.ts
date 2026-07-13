// scripts/carddata/src/harvest/bulkExportGen1Backfill.ts
//
// Two related, fully offline capabilities for the European-language
// (fr/de/es/it/pt) missing-set backlog, both driven off the local bulk
// export clone at data/bulk-export/ (see bulkExportIngest.ts's own header
// comment for that layout) -- ZERO live network calls, matching this whole
// pipeline's provenance convention (the wiki's own request budget is owned
// by a separate background crawl and is never touched here):
//
//   1. AVAILABILITY GATE (--job plan): the reference wiki has no reliable
//      way to tell us whether a set was ever printed in a given EU
//      language, but the bulk export's own per-card `name` map does -- a
//      language key's absence on every card in a set is the bulk export's
//      own signal that the set was never released in that language (see
//      isCardAvailableInLanguage in bulkExportIngest.ts). This classifies
//      every manifest-listed missing set into one of three buckets:
//        - bulk-export-sourced: the bulk export HAS the set with >0 cards
//          carrying this language's name -- our Gen1 file just lacks it,
//          and (2) below can fill it without touching the wiki at all.
//        - not-printed: the bulk export HAS the set, but ZERO of its cards
//          carry this language's name. Treated as "never printed in this
//          language" per this task's own rule, but CAVEAT (confirmed by
//          spot-checking the real run's output, see the plan/backfill
//          summary): this is a proxy for the bulk export's OWN data
//          completeness, not verified real-world print history -- fr's
//          "Base Set 2"/"Gym Challenge"/"Legendary Collection" all land
//          here even though French WotC-era simultaneous release is
//          well documented (GAP-REPORT.md Part 3), because those
//          particular bulk-export card files simply carry no `fr` name key
//          at all. Excluded from both harvest paths here; a genuine
//          per-set localized-release check would need a source this
//          module doesn't have.
//        - wiki-needed: the set is absent from the bulk export entirely --
//          the wiki is the only lead, flagged localizedNamesUnavailable
//          since a wiki harvest for these will carry English names.
//
//   2. GEN1 BACKFILL (--job backfill): for exactly the bulk-export-sourced
//      sets, converts their Gen1-range (dex 1-151) cards straight from the
//      bulk export -- real localized names, real rarity (translated via
//      the same meta/translations/<lang>.json dictionary
//      bulkExportIngest.ts uses), and real image URLs (via the same local
//      image-availability cache) -- into data/harvest/<lang>/<setId>.json,
//      in the exact SetHarvestResult shape runHarvest.ts's own missing-sets
//      job writes, so the existing `npm run harvest:merge` step folds it in
//      completely unchanged. This is strictly better than a wiki harvest
//      for these sets: no title-matching, no image-filename guessing, and
//      no risk of the wiki's own translation gaps -- the bulk export IS the
//      localized data.
//
// Both commands are read-only against data/bulk-export/ and
// public/data/cards/<lang>.json; only data/harvest/ is written to (plan
// output at data/harvest/eu-backfill-plan.json, backfill output at
// data/harvest/<lang>/<setId>.json) -- never public/data/cards itself
// (that's harvest:merge's job, run separately and deliberately by hand).
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CardRecord } from '../augmentFromSupplemental';
import { rangeForGeneration } from '../data/genRanges';
import {
  buildSetIdIndex,
  isCardAvailableInLanguage,
  imageUrlIfAvailable,
  loadCardModule,
  loadImageAvailabilityIndex,
  loadTranslationDict,
  localIdFromFileName,
  translateField,
  type BulkExportCard,
  type ImageAvailabilityIndex,
  type LanguageMap,
  type SetIdIndexEntry,
  type TranslationDict,
} from '../bulkExportIngest';
import { inRangeDexIds } from '../snapshotAllGens';
import { buildMissingSetJobs, type GapManifest, type HarvestJob } from './harvestJobs';
import { deriveSetNameFromArticleTitle } from './setlistParser';
import type { HarvestedCard, SetHarvestResult } from './runHarvest';

export const EU_LANGUAGES = ['fr', 'de', 'es', 'it', 'pt'] as const;
export type EuLanguage = (typeof EU_LANGUAGES)[number];

const GEN1_RANGE = rangeForGeneration(1);

// --- Availability gate --------------------------------------------------

export type AvailabilityBucket = 'bulk-export-sourced' | 'wiki-needed' | 'not-printed';

export interface SetAvailabilityResult {
  setId: string;
  foundInBulkExport: boolean;
  totalCards: number;
  availableCards: number;
}

/** Pure classification -- see this module's header comment for the three-bucket rule. */
export function classifyAvailability(result: SetAvailabilityResult): AvailabilityBucket {
  if (!result.foundInBulkExport) return 'wiki-needed';
  return result.availableCards > 0 ? 'bulk-export-sourced' : 'not-printed';
}

/** Pure summary over an already-loaded card list -- split out from the IO (loadSetCards) so it's independently testable against fixture card objects. */
export function summarizeAvailability(
  setId: string,
  cards: BulkExportCard[],
  language: string
): SetAvailabilityResult {
  return {
    setId,
    foundInBulkExport: true,
    totalCards: cards.length,
    availableCards: cards.filter((card) => isCardAvailableInLanguage(card, language)).length,
  };
}

export interface LoadedSetCard {
  localId: string;
  card: BulkExportCard;
}

/** Loads every card module directly inside one set's card directory (non-recursive -- card files sit flat, one per localId, directly under a set's own directory; see bulkExportIngest.ts's layout notes). A missing/unreadable directory yields an empty list rather than throwing, so a stale or bad index entry degrades to "nothing found" instead of aborting a whole run. */
export async function loadSetCards(cardDir: string): Promise<LoadedSetCard[]> {
  let entries;
  try {
    entries = await readdir(cardDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: LoadedSetCard[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const card = await loadCardModule(path.join(cardDir, entry.name));
    if (!card) continue;
    results.push({ localId: localIdFromFileName(entry.name), card });
  }
  return results;
}

export interface JobClassification {
  job: HarvestJob;
  bucket: AvailabilityBucket;
  availability: SetAvailabilityResult;
  /** The loaded card list, non-empty only for the bulk-export-sourced bucket (the only bucket the backfill step actually needs the cards for -- see buildGen1BackfillCards). */
  cards: LoadedSetCard[];
  /** The bulk export's own (often partial) per-language name map for this set, when found -- feeds the backfill's setName preference (see buildBackfillSetResult). */
  setNameMap: LanguageMap | null;
}

/**
 * Classifies one missing-set job against the bulk export for one language.
 * Loads the set's cards at most once (reused for both the availability
 * count and, for a bulk-export-sourced verdict, the backfill conversion
 * itself) rather than reading the directory twice.
 */
export async function classifyJob(
  setIdIndex: Map<string, SetIdIndexEntry>,
  job: HarvestJob,
  language: string
): Promise<JobClassification> {
  const entry = setIdIndex.get(job.proposedSetId);
  if (!entry) {
    return {
      job,
      bucket: 'wiki-needed',
      availability: { setId: job.proposedSetId, foundInBulkExport: false, totalCards: 0, availableCards: 0 },
      cards: [],
      setNameMap: null,
    };
  }

  const cards = await loadSetCards(entry.cardDir);
  const availability = summarizeAvailability(
    job.proposedSetId,
    cards.map((c) => c.card),
    language
  );
  const bucket = classifyAvailability(availability);
  return {
    job,
    bucket,
    availability,
    cards: bucket === 'bulk-export-sourced' ? cards : [],
    setNameMap: entry.name,
  };
}

// --- Gen1 backfill conversion --------------------------------------------

/**
 * Converts one bulk-export-sourced set's loaded cards into Gen1-filtered
 * HarvestedCard rows, in the exact shape runHarvest.ts's wiki path
 * produces, so mergeHarvest.ts's mergeMissingSet folds them in unchanged.
 *
 * Only the FIRST qualifying dex number is used for a card naming more than
 * one (rare for Gen1 -- essentially unheard of in this era's print runs).
 * This mirrors, rather than fights, the wiki harvest path's own contract:
 * mergeHarvest's dedup key is setId+localId with no dexNumber component
 * (see mergeHarvest.ts's mergeMissingSet), and every wiki setlist row
 * already names exactly one dex entry by construction
 * (matchGen1DexEntry in runHarvest.ts). Emitting a second HarvestedCard for
 * the same localId under a different dexNumber would just collide with the
 * first within `seenThisRun` on merge and get silently dropped -- so a
 * documented single-dex simplification here is strictly better than a
 * merge-time landmine.
 */
export function buildGen1BackfillCards(
  cards: LoadedSetCard[],
  language: string,
  translations: TranslationDict | undefined,
  imageIndex: ImageAvailabilityIndex | undefined
): HarvestedCard[] {
  const results: HarvestedCard[] = [];
  for (const { localId, card } of cards) {
    if (!isCardAvailableInLanguage(card, language)) continue;
    const qualifying = inRangeDexIds(card.dexId, [GEN1_RANGE]);
    if (qualifying.length === 0) continue;

    const dexNumber = qualifying[0];
    const name = card.name[language] as string;
    const rarity = translateField(translations, 'rarity', card.rarity) ?? null;
    const serieId = card.set?.serie?.id ?? '';
    const imageUrl = imageUrlIfAvailable(imageIndex, language, serieId, card.set.id, localId) ?? null;

    results.push({
      dexNumber,
      name,
      cardArticleTitle: name,
      cardNumber: localId,
      localId,
      rarity,
      regulationMark: null,
      imageFileTitle: null,
      imageUrl,
      imageMissing: !imageUrl,
    });
  }
  return results;
}

/**
 * Resolves the set's display name for the backfill output: prefers the
 * bulk export's OWN localized name for this language when its Set index
 * module carried one (real, source-confirmed localization -- e.g. ecard1
 * carries fr/it/de names), falling back to the English name derived from
 * the job's wiki article title (deriveSetNameFromArticleTitle strips the
 * "(TCG)" suffix) when the bulk export's Set object didn't record this
 * language at all (common for pre-2011 sets -- most Set index modules here
 * only ever carry `en`, even when individual CARDS do carry the target
 * language, which is why this is a name-only fallback, not a signal that
 * conflicts with the availability gate above).
 */
export function resolveBackfillSetName(setNameMap: LanguageMap | null, language: string, job: HarvestJob): string {
  const localized = setNameMap?.[language];
  return localized || deriveSetNameFromArticleTitle(job.setName);
}

/** Pure: wraps a converted card list into the exact SetHarvestResult shape runHarvest.ts's missing-sets job writes (see that module's own interface). `sourceArticleTitle`/`sourceArticleTitles` deliberately don't name any upstream site -- "bulk-export" is this pipeline's own established generic term (see bulkExportIngest.ts's `source: 'bulk-export'` field). */
export function buildBackfillSetResult(
  language: string,
  setId: string,
  setName: string,
  cards: HarvestedCard[],
  nowIso: string
): SetHarvestResult {
  return {
    language,
    setId,
    setName,
    sourceArticleTitle: 'bulk-export-backfill',
    sourceArticleTitles: [],
    harvestedAt: nowIso,
    totalRows: cards.length,
    gen1Count: cards.length,
    imagesResolved: cards.filter((c) => c.imageUrl).length,
    cards,
  };
}

// --- Orchestration (IO) ---------------------------------------------------

const DATA_DIR = 'data';
const GAP_MANIFEST_PATH = path.join(DATA_DIR, 'gap-audit', 'GAP-MANIFEST.json');
const BULK_EXPORT_WESTERN_ROOT = path.join(DATA_DIR, 'bulk-export', 'data');
const IMAGE_INDEX_PATH = path.join(DATA_DIR, 'bulk-export-support', 'datas.json');
const EU_PLAN_PATH = path.join(DATA_DIR, 'harvest', 'eu-backfill-plan.json');
const APP_CARDS_DIR = path.resolve('..', '..', 'public', 'data', 'cards');

function harvestOutputDir(language: string): string {
  return path.join(DATA_DIR, 'harvest', language);
}

/** Loads the EU manifest jobs for one language, then drops any whose proposedSetId is already held in that language's own static database -- defensive re-check on top of the manifest's own diff, in case the manifest has drifted since it was generated. */
async function loadCandidateJobs(language: string): Promise<HarvestJob[]> {
  const manifest = JSON.parse(await readFile(GAP_MANIFEST_PATH, 'utf8')) as GapManifest;
  const jobs = buildMissingSetJobs(manifest, [language]);

  const cardsPath = path.join(APP_CARDS_DIR, `${language}.json`);
  let heldSetIds = new Set<string>();
  try {
    const cardsByDex = JSON.parse(await readFile(cardsPath, 'utf8')) as Record<string, CardRecord[]>;
    heldSetIds = new Set(Object.values(cardsByDex).flatMap((bucket) => bucket.map((c) => c.setId.toLowerCase())));
  } catch {
    // No file yet for this language -- nothing to exclude.
  }
  return jobs.filter((job) => !heldSetIds.has(job.proposedSetId.toLowerCase()));
}

export interface LanguagePlanEntry {
  setId: string;
  setName: string;
  totalCards: number;
  availableCards: number;
}

export interface LanguagePlan {
  bulkExportSourced: LanguagePlanEntry[];
  wikiNeeded: LanguagePlanEntry[];
  notPrinted: LanguagePlanEntry[];
}

export interface EuBackfillPlan {
  generatedAt: string;
  languages: Record<string, LanguagePlan>;
}

async function planLanguage(setIdIndex: Map<string, SetIdIndexEntry>, language: string): Promise<LanguagePlan> {
  const jobs = await loadCandidateJobs(language);
  const plan: LanguagePlan = { bulkExportSourced: [], wikiNeeded: [], notPrinted: [] };

  for (const job of jobs) {
    const classification = await classifyJob(setIdIndex, job, language);
    const entry: LanguagePlanEntry = {
      setId: job.proposedSetId,
      setName: resolveBackfillSetName(classification.setNameMap, language, job),
      totalCards: classification.availability.totalCards,
      availableCards: classification.availability.availableCards,
    };
    if (classification.bucket === 'bulk-export-sourced') plan.bulkExportSourced.push(entry);
    else if (classification.bucket === 'not-printed') plan.notPrinted.push(entry);
    else plan.wikiNeeded.push(entry);
  }

  return plan;
}

async function runPlan(): Promise<void> {
  console.log('Building the western bulk-export setId index...');
  const setIdIndex = await buildSetIdIndex(BULK_EXPORT_WESTERN_ROOT);
  console.log(`  ${setIdIndex.size} set(s) indexed.`);

  const plan: EuBackfillPlan = { generatedAt: new Date().toISOString(), languages: {} };
  for (const language of EU_LANGUAGES) {
    console.log(`Classifying missing sets for ${language}...`);
    const languagePlan = await planLanguage(setIdIndex, language);
    plan.languages[language] = languagePlan;
    console.log(
      `  ${language}: bulk-export-sourced=${languagePlan.bulkExportSourced.length} ` +
        `wiki-needed=${languagePlan.wikiNeeded.length} not-printed=${languagePlan.notPrinted.length}`
    );
  }

  await mkdir(path.dirname(EU_PLAN_PATH), { recursive: true });
  await writeFile(EU_PLAN_PATH, JSON.stringify(plan, null, 2), 'utf8');
  console.log(`Wrote ${EU_PLAN_PATH}.`);
}

async function runBackfillForLanguage(
  setIdIndex: Map<string, SetIdIndexEntry>,
  language: string,
  imageIndex: ImageAvailabilityIndex | undefined,
  dryRun: boolean
): Promise<{ setsWritten: number; cardsWritten: number }> {
  const translations = await loadTranslationDict(path.join(DATA_DIR, 'bulk-export'), language);
  const jobs = await loadCandidateJobs(language);

  let setsWritten = 0;
  let cardsWritten = 0;
  const outputDir = harvestOutputDir(language);
  if (!dryRun) await mkdir(outputDir, { recursive: true });

  for (const job of jobs) {
    const classification = await classifyJob(setIdIndex, job, language);
    if (classification.bucket !== 'bulk-export-sourced') continue;

    const cards = buildGen1BackfillCards(classification.cards, language, translations, imageIndex);
    if (cards.length === 0) {
      console.log(`  [skip] ${language}/${job.proposedSetId}: 0 Gen1 card(s) with a resolvable name, nothing to write.`);
      continue;
    }

    const setName = resolveBackfillSetName(classification.setNameMap, language, job);
    const result = buildBackfillSetResult(language, job.proposedSetId, setName, cards, new Date().toISOString());

    console.log(
      `  ${language}/${job.proposedSetId} (${setName}): ${result.gen1Count} Gen1 card(s), ` +
        `${result.imagesResolved} with an image.` + (dryRun ? ' [dry-run, not written]' : '')
    );

    if (!dryRun) {
      await writeFile(path.join(outputDir, `${job.proposedSetId}.json`), JSON.stringify(result, null, 2), 'utf8');
    }
    setsWritten++;
    cardsWritten += result.cards.length;
  }

  return { setsWritten, cardsWritten };
}

async function runBackfill(languages: string[], dryRun: boolean): Promise<void> {
  console.log('Building the western bulk-export setId index...');
  const setIdIndex = await buildSetIdIndex(BULK_EXPORT_WESTERN_ROOT);
  console.log(`  ${setIdIndex.size} set(s) indexed.`);

  const imageIndex = await loadImageAvailabilityIndex(IMAGE_INDEX_PATH);
  console.log(imageIndex ? 'Loaded image-availability cache.' : 'No image-availability cache found; image URLs will be omitted.');

  let totalSets = 0;
  let totalCards = 0;
  for (const language of languages) {
    console.log(`Backfilling ${language}...`);
    const { setsWritten, cardsWritten } = await runBackfillForLanguage(setIdIndex, language, imageIndex, dryRun);
    console.log(`  ${language}: ${setsWritten} set file(s), ${cardsWritten} card(s) total.`);
    totalSets += setsWritten;
    totalCards += cardsWritten;
  }
  console.log(`Done. ${totalSets} set file(s), ${totalCards} card(s) across ${languages.length} language(s).`);
}

// --- CLI -------------------------------------------------------------------

interface CliArgs {
  job: 'plan' | 'backfill';
  languages: string[];
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let job: CliArgs['job'] | undefined;
  let language: string | undefined;
  let dryRun = false;
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (flag === '--job') {
      const value = args.shift();
      if (value !== 'plan' && value !== 'backfill') throw new Error('--job must be "plan" or "backfill".');
      job = value;
      continue;
    }
    if (flag === '--lang') {
      language = args.shift();
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  if (!job) throw new Error('Usage: npx tsx src/harvest/bulkExportGen1Backfill.ts --job <plan|backfill> [--lang <code>|all] [--dry-run]');
  if (job === 'backfill') {
    if (!language) throw new Error('--job backfill requires --lang <code>|all.');
    if (language !== 'all' && !(EU_LANGUAGES as readonly string[]).includes(language)) {
      throw new Error(`--lang must be one of: ${EU_LANGUAGES.join(', ')}, or "all".`);
    }
  }
  const languages = job === 'backfill' ? (language === 'all' ? [...EU_LANGUAGES] : [language as string]) : [];
  return { job, languages, dryRun };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.job === 'plan') await runPlan();
  else await runBackfill(cli.languages, cli.dryRun);
}

if (process.argv[1] && process.argv[1].includes('bulkExportGen1Backfill')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
