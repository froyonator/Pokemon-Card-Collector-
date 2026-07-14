// scripts/carddata/src/harvest/runHarvest.ts
//
// CLI entrypoint for the reference-wiki harvester. Five job types:
//
//   --job missing-sets   Fetches whole sets we don't hold at all yet (from
//                        the gap manifest's languages.<lang>.missingSets),
//                        Gen1-filters their card list, resolves images, and
//                        writes one output file per set.
//
//   --job enrich         For sets we ALREADY hold but with data holes
//                        (missing rarity and/or a bare-code placeholder
//                        setName), fetches that set's wiki set-list ONCE
//                        and maps rows to our held cards by localId to
//                        compute the fields that would be filled in.
//
//   --job images          For already-held cards with NO image at all (empty
//                        imageBase and no hosted url either), derives
//                        filename candidates from each card's own held data
//                        and resolves them via the same batched-imageinfo +
//                        per-article-infobox strategy as missing-sets, one
//                        output file per affected set. Never fetches a
//                        whole set list -- only individual card images.
//
//   --job retry-failed   Re-attempts exactly the missing-set jobs recorded
//                        as FAILED or completed with zero rows in
//                        progress.json, via a fallback chain (direct title
//                        -> orthographic variants -> the curated override
//                        mapping -> a scored title search) instead of the
//                        single direct fetch missing-sets uses. See
//                        retryResolution.ts. A set still yielding zero rows
//                        after a successful fetch gets its wikitext dumped
//                        to data/harvest/debug/ for diagnosis.
//
//   --job discover-zh-cn  Runs a broader (ATCG)-namespace title sweep and
//                        merges newly found articles into
//                        data/harvest/zh-cn-articles.json, without ever
//                        overwriting a curated entry. See zhCnDiscovery.ts.
//
//   --job images-deep    Per-card deep image resolution for already-held
//                        cards with NO image at all, across every generation
//                        file for a language (not just Gen1) -- the harder
//                        follow-up to --job images for exactly the cards
//                        that job's batched filename guess can't find,
//                        because our stored setNames diverge from the wiki's
//                        own article naming (promos and vintage reprints
//                        especially). Resolves each card's own ARTICLE TITLE
//                        first (direct guess, orthographic variants, then a
//                        scored title search restricted to card-article-
//                        shaped titles), then reads that article's infobox
//                        image field -- never trusting a match whose own
//                        "(Set Number)" disambiguator disagrees with the
//                        held card beyond normalization. See
//                        deepImageResolver.ts. Checkpoints per ~25-card
//                        chunk (not per set, since a chunk spans many sets),
//                        writing data/harvest/<lang>/images-deep-<chunk>.json
//                        in the same shape --job images writes, so it's
//                        picked up by the existing mergeImages path
//                        unchanged.
//
// All job types checkpoint into data/harvest/progress.json after EVERY set,
// so a killed run resumes exactly where it left off (already-done sets are
// skipped on the next invocation, not re-fetched). Console output is
// deliberately generic -- no source names -- per this pipeline's
// provenance-handling convention; see mergeHarvest.ts for turning this
// output into public/data/cards/<lang>.json changes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CardRecord } from '../augmentFromSupplemental';
import { GEN1_DEX, type DexEntry } from '../../../../src/data/gen1Dex';
import {
  guessCardImageFilename,
  isCardShapedImage,
  parseCardArticleDisambiguator,
  parseCardInfoboxImageFilename,
  resolveCardImages,
  toFileTitle,
} from './cardImageResolver';
import {
  cardCodesMatch,
  normalizeCardCode,
  resolveCardArticleLadder,
  resolveFilenameGuessBatch,
  type DeepImageJobCard,
  type DeepResolvedCard,
} from './deepImageResolver';
import { generateTitleVariants } from './titleVariants';
import { buildEnrichmentJobs, type EnrichmentJob, type LocalIncompleteManifest } from './enrichmentJobs';
import {
  buildMissingSetJobs,
  buildZhCnJobs,
  buildZhTwJobs,
  type GapManifest,
  type HarvestJob,
  type ZhCnArticleMappingFile,
  type ZhTwMissingSetsFile,
} from './harvestJobs';
import {
  resolveJobArticles,
  type ArticleOverrideFile,
  type ResolvedArticle,
} from './retryResolution';
import { deriveSetNameFromArticleTitle, extractCsCode, parseSetPageWikitext } from './setlistParser';
import type { SetlistRow, WikiImageInfo } from './types';
import { createWikiApiClient, type WikiApiClient } from './wikiApiClient';
import { mergeDiscoveredZhCnArticles } from './zhCnDiscovery';

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
  /**
   * Every article title actually fetched for this set, in order -- length 1
   * for an ordinary single-article job, more than 1 for a multi-article
   * override (a paired X/Y regional release, or a shared-article JP
   * section, see retryResolution.ts). `sourceArticleTitle` above is these
   * joined with " + " for a quick human-readable summary; this is the
   * structured form. Optional only for backward compatibility with
   * already-written harvest output files that predate this field.
   */
  sourceArticleTitles?: string[];
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
 *
 * The row's OWN print number is passed through as well -- confirmed live,
 * a shared article can carry SEVERAL reprintN entries that all name the
 * SAME target set (an illustration-rare "parade" of four different prints
 * -- 170/171/172/173 -- filed under one "Collection 151" article, with
 * only the reprintN filename itself distinguishing which print is which).
 * Without the number, set-name matching alone silently picks the FIRST
 * such entry for every one of those rows, handing them all the same scan.
 * See parseCardInfoboxImageFilename's own doc comment for the full guard.
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
    const printNumber = extractNumerator(row.cardNumber);
    return parseCardInfoboxImageFilename(page.wikitext, targetSetNames, printNumber);
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
      if (result && !result.missing && isCardShapedImage(result)) state.resolved = result;
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
      if (result && !result.missing && isCardShapedImage(result)) state.resolved = result;
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

export interface MultiArticleHarvest {
  totalRows: number;
  gen1Count: number;
  cards: HarvestedCard[];
  /** Article set names joined with " / " when more than one (see SetHarvestResult.setName). */
  realSetName: string;
  sourceArticleTitles: string[];
}

/**
 * Harvests Gen1 cards+images across one or more already-resolved articles
 * (see retryResolution.ts's resolveJobArticles), concatenating rows/cards
 * in article order. Each article's own real set name (not the overall
 * job's proposed one) drives its own rows' image-filename guesses, exactly
 * as a normal single-article harvest would for that article alone --
 * "each row keeps its own origin article for image derivation" is achieved
 * simply by resolving one article's rows at a time rather than threading an
 * extra field through SetlistRow.
 */
export async function harvestFromResolvedArticles(
  client: Pick<WikiApiClient, 'queryImageInfo'> & { parsePageWikitext?: WikiApiClient['parsePageWikitext'] },
  articles: ResolvedArticle[]
): Promise<MultiArticleHarvest> {
  let totalRows = 0;
  let cards: HarvestedCard[] = [];
  const setNames: string[] = [];
  const sourceArticleTitles: string[] = [];

  for (const article of articles) {
    const rows = [...article.page.cardListRows, ...article.page.additionalCardRows];
    totalRows += rows.length;
    const gen1Rows = filterGen1Rows(rows);
    const articleSetName = deriveSetNameFromArticleTitle(article.fetchedTitle);
    setNames.push(articleSetName);
    sourceArticleTitles.push(article.fetchedTitle);
    const articleCards = await resolveHarvestedCardImages(client, articleSetName, gen1Rows);
    cards = cards.concat(articleCards);
  }

  return { totalRows, gen1Count: cards.length, cards, realSetName: setNames.join(' / '), sourceArticleTitles };
}

// --- Image-only harvest for already-held cards -------------------------------
//
// Unlike missing-sets (a whole set we don't hold at all) or enrich (fields
// on cards we hold), this job type targets individual already-held cards
// that have no image at all (empty imageBase AND no hosted url either) --
// see local-incomplete.json's issues.noImageAtAll for the audit this is
// closing. Deliberately reuses resolveHarvestedCardImages verbatim (same
// candidate-guess rounds, same batched imageinfo calls, same per-article
// infobox fallback) by adapting a held card into the same {row, dex} shape
// a fresh set harvest works with, rather than a parallel implementation.

export interface ImageJobCard {
  cardId: string;
  dexNumber: number;
  name: string;
  localId: string;
  rarity: string | null;
}

export interface ImageHarvestJob {
  language: string;
  setId: string;
  setName: string;
  cards: ImageJobCard[];
}

/**
 * Selects already-held cards with no image at all straight from the live
 * static database (not from local-incomplete.json's own bySet lists, which
 * can drift stale between audit runs), grouped by setId. Pure and
 * network-free -- the CLI reads public/data/cards/<lang>.json and hands the
 * parsed object in here.
 */
export function buildImageJobs(cardsByDex: Record<string, CardRecord[]>, language: string): ImageHarvestJob[] {
  const bySet = new Map<string, ImageHarvestJob>();
  for (const bucket of Object.values(cardsByDex)) {
    for (const card of bucket) {
      if (card.imageBase || card.hostedThumbUrl || card.hostedFullUrl) continue;
      let job = bySet.get(card.setId);
      if (!job) {
        job = { language, setId: card.setId, setName: card.setName, cards: [] };
        bySet.set(card.setId, job);
      }
      job.cards.push({ cardId: card.id, dexNumber: card.dexNumber, name: card.name, localId: card.localId, rarity: card.rarity });
    }
  }
  return [...bySet.values()]
    .sort((a, b) => a.setId.localeCompare(b.setId))
    .map((job) => ({
      ...job,
      cards: [...job.cards].sort((a, b) => a.localId.localeCompare(b.localId, undefined, { numeric: true })),
    }));
}

/**
 * Adapts a held no-image card into the same {row, dex} shape
 * resolveHarvestedCardImages expects. No cardArticleTitle disambiguator is
 * available for an already-held card (we've never fetched its wiki article),
 * so this always takes buildRowImageCandidates' strategy (b): guesses built
 * from the card's own name + the job's setName + localId.
 */
export function imageJobCardToGen1Row(card: ImageJobCard): Gen1MatchedRow {
  return {
    row: {
      cardNumber: card.localId,
      regulationMark: null,
      displayName: card.name,
      cardArticleTitle: card.name,
      primaryType: null,
      secondaryField: null,
      rarity: card.rarity,
      promoNote: null,
      nameSource: 'literal',
      originSetName: null,
    },
    dex: { number: card.dexNumber, name: card.name },
  };
}

export interface ImageResolvedCard {
  cardId: string;
  dexNumber: number;
  localId: string;
  imageFileTitle: string | null;
  imageUrl: string | null;
  imageMissing: boolean;
}

export interface ImageHarvestResult {
  language: string;
  setId: string;
  setName: string;
  harvestedAt: string;
  totalCards: number;
  imagesResolved: number;
  cards: ImageResolvedCard[];
}

/**
 * Resolves images for one image-only job. Every held card here is already
 * Gen1-scoped (this app's static database holds nothing else today, per the
 * project's current dex 1-151 scope), so the per-article infobox fallback
 * (strategy c, gated behind `parsePageWikitext` being provided) applies to
 * every still-unresolved card in the job -- no further row filtering is
 * needed before it runs.
 */
export async function resolveImageJobCards(
  client: Pick<WikiApiClient, 'queryImageInfo'> & { parsePageWikitext?: WikiApiClient['parsePageWikitext'] },
  job: ImageHarvestJob
): Promise<ImageResolvedCard[]> {
  const gen1Rows = job.cards.map(imageJobCardToGen1Row);
  const harvested = await resolveHarvestedCardImages(client, job.setName, gen1Rows);
  return harvested.map((card, i) => ({
    cardId: job.cards[i].cardId,
    dexNumber: card.dexNumber,
    localId: card.localId,
    imageFileTitle: card.imageFileTitle,
    imageUrl: card.imageUrl,
    imageMissing: card.imageMissing,
  }));
}

// --- Deep image resolution for already-held cards with NO image at all -----
//
// Unlike buildImageJobs (one job per setId, resolved by the cheap batched
// filename guess only), this targets the same underlying population --
// held cards with no image at all -- across EVERY generation file for a
// language (not just Gen1), ordered most-browsed-first, and escalates to
// per-card article-title resolution (deepImageResolver.ts) for whatever the
// cheap guess still can't find. See --job images-deep's own doc comment
// above for the full ladder.

/** Every generation's card database for one language, keyed by generation number (1-9), as read from public/data/cards/<lang>.json + public/data/cards/<lang>/gen<N>.json. */
export type LanguageGenerationFiles = Map<number, Record<string, CardRecord[]>>;

/**
 * Builds the ordered images-deep work queue: every held card across every
 * loaded generation file with no image at all, most-browsed first -- Gen1
 * ascending by dex number, then Gen2 ascending, ... Gen9 ascending (a
 * language missing some generation files simply skips them; nothing is
 * inferred). Pure and network-free -- the CLI reads every
 * public/data/cards file from disk and hands the parsed objects in here.
 */
export function buildDeepImageQueue(generationFiles: LanguageGenerationFiles): DeepImageJobCard[] {
  const queue: DeepImageJobCard[] = [];
  const generations = [...generationFiles.keys()].sort((a, b) => a - b);
  for (const generation of generations) {
    const cardsByDex = generationFiles.get(generation)!;
    const dexNumbers = Object.keys(cardsByDex)
      .map(Number)
      .sort((a, b) => a - b);
    for (const dexNumber of dexNumbers) {
      for (const card of cardsByDex[String(dexNumber)] ?? []) {
        if (card.imageBase || card.hostedThumbUrl || card.hostedFullUrl) continue;
        queue.push({
          cardId: card.id,
          dexNumber: card.dexNumber,
          generation,
          name: card.name,
          localId: card.localId,
          rarity: card.rarity,
          setId: card.setId,
          setName: card.setName,
        });
      }
    }
  }
  return queue;
}

export const DEEP_IMAGE_CHUNK_SIZE = 25;

/** Splits an already-ordered queue into fixed-size chunks, the last one possibly shorter. Pure, generic -- used for both dry-run reporting and the real per-chunk checkpoint loop. */
export function chunkQueue<T>(items: T[], size: number = DEEP_IMAGE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** One images-deep chunk's output -- same required fields as ImageHarvestResult (so mergeImages/mergeHarvest.ts's images-file loader accepts it unchanged, matched via the shared `images-` filename prefix), plus diagnostics mergeImages simply ignores. */
export interface DeepImageHarvestResult {
  language: string;
  setId: string;
  setName: string;
  harvestedAt: string;
  totalCards: number;
  imagesResolved: number;
  cards: DeepResolvedCard[];
  skipped: Array<{ cardId: string; name: string; setName: string; localId: string; reason: string }>;
  chunkIndex: number;
}

/**
 * The set-rows stage's pure core: matches still-unresolved held cards (all
 * of one setId) against their set article's parsed rows by print code --
 * exact normalized-code equality first ("SM198" == "SM198", "037" == "37"),
 * then the prefix-tolerant fallback (see cardCodesMatch) contextualized by
 * the row's own article-title disambiguator (which carries the set name
 * that accounts for a bare wiki-side number's missing prefix). A row is
 * consumed by at most one card. The match itself is the print-identity
 * proof for this stage: the set article was derived from the card's OWN
 * held setName, and the row was selected by print code, so the two held
 * facts corroborate each other before any image is trusted.
 */
export function matchDeepCardsToSetRows(
  cards: DeepImageJobCard[],
  rows: SetlistRow[],
  articleSetName: string
): Array<{ card: DeepImageJobCard; row: SetlistRow }> {
  const byCode = new Map<string, SetlistRow[]>();
  for (const row of rows) {
    const code = normalizeCardCode(row.cardNumber);
    const bucket = byCode.get(code);
    if (bucket) bucket.push(row);
    else byCode.set(code, [row]);
  }

  const consumed = new Set<SetlistRow>();
  const matched: Array<{ card: DeepImageJobCard; row: SetlistRow }> = [];
  for (const card of cards) {
    const exact = (byCode.get(normalizeCardCode(card.localId)) ?? []).find((row) => !consumed.has(row));
    let row = exact ?? null;
    if (!row) {
      row =
        rows.find((candidate) => {
          if (consumed.has(candidate)) return false;
          const rowContext = parseCardArticleDisambiguator(candidate.cardArticleTitle)?.setName ?? articleSetName;
          return cardCodesMatch(card.localId, candidate.cardNumber, rowContext);
        }) ?? null;
    }
    if (row) {
      consumed.add(row);
      matched.push({ card, row });
    }
  }
  return matched;
}

/** Article-title candidates for a held setName's own set page: "<setName> (TCG)" plus orthographic variants -- the same construction missing-set jobs use (deriveWikiArticleTitle's en-family branch). */
export function buildDeepSetArticleCandidates(setName: string): string[] {
  const base = `${setName} (TCG)`;
  return [base, ...generateTitleVariants(base)];
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

/** One recorded missing-set failure -- see recordMissingSetFailure/selectRetryTargets. */
export interface MissingSetFailureEntry {
  /** The article title (or job.setName) last attempted before failing. */
  setName: string;
  reason: string;
  /** Every title actually attempted, when the failure came from the retry-failed resolution chain. */
  attempts?: string[];
  failedAt: string;
}

export interface ProgressFile {
  missingSets: Record<string, Record<string, { setName: string; gen1Count: number; totalRows: number; completedAt: string }>>;
  enrich: Record<string, Record<string, { needsRarity: boolean; needsSetName: boolean; appliedCount: number; completedAt: string }>>;
  images: Record<string, Record<string, { cardCount: number; imagesResolved: number; completedAt: string }>>;
  /**
   * Per-language images-deep checkpoint: every cardId already attempted
   * (resolved OR conclusively skipped) via --job images-deep, keyed for
   * O(1) resume-skip -- the work queue itself is recomputed fresh every run
   * rather than addressed by a stable chunk index, since the held database
   * can change between runs. `nextChunk` is a simple incrementing counter
   * for output filenames only. Optional for backward compatibility with a
   * progress.json written before this job type existed.
   */
  imagesDeep?: Record<string, { doneCardIds: Record<string, true>; nextChunk: number }>;
  /** Missing-set jobs that failed outright (never produced an output file) -- see runMissingSets' catch block and --job retry-failed. */
  failed: Record<string, Record<string, MissingSetFailureEntry>>;
}

export function emptyProgress(): ProgressFile {
  return { missingSets: {}, enrich: {}, images: {}, imagesDeep: {}, failed: {} };
}

export function isMissingSetDone(progress: ProgressFile, language: string, proposedSetId: string): boolean {
  return Boolean(progress.missingSets[language]?.[proposedSetId]);
}

export function isEnrichDone(progress: ProgressFile, language: string, setId: string): boolean {
  return Boolean(progress.enrich[language]?.[setId]);
}

export function isImagesDone(progress: ProgressFile, language: string, setId: string): boolean {
  return Boolean(progress.images?.[language]?.[setId]);
}

/** True when a card has already been attempted (resolved or conclusively skipped) by a previous --job images-deep run. */
export function isDeepImageCardDone(progress: ProgressFile, language: string, cardId: string): boolean {
  return Boolean(progress.imagesDeep?.[language]?.doneCardIds[cardId]);
}

export function isMissingSetFailed(progress: ProgressFile, language: string, setId: string): boolean {
  return Boolean(progress.failed?.[language]?.[setId]);
}

/** True for a job that completed but produced zero rows -- the other retry-failed target, alongside outright failures. */
export function isMissingSetZeroRow(progress: ProgressFile, language: string, setId: string): boolean {
  return progress.missingSets[language]?.[setId]?.totalRows === 0;
}

export function recordMissingSetFailure(
  progress: ProgressFile,
  language: string,
  setId: string,
  entry: MissingSetFailureEntry
): void {
  progress.failed ??= {};
  progress.failed[language] ??= {};
  progress.failed[language][setId] = entry;
}

export function clearMissingSetFailure(progress: ProgressFile, language: string, setId: string): void {
  if (progress.failed?.[language]) delete progress.failed[language][setId];
}

/**
 * The setIds `--job retry-failed` should attempt for one language: every
 * outright-recorded failure, plus every missing-set job that completed but
 * yielded zero rows (still needs a diagnosable dump, and may resolve for
 * real once the resolution chain's variant/override/search stages run).
 * Pure selection over one language's progress records, no I/O.
 */
export function selectRetryTargets(progress: ProgressFile, language: string): string[] {
  const targets = new Set<string>();
  for (const setId of Object.keys(progress.failed?.[language] ?? {})) targets.add(setId);
  for (const [setId, entry] of Object.entries(progress.missingSets[language] ?? {})) {
    if (entry.totalRows === 0) targets.add(setId);
  }
  return [...targets];
}

/** Pure job-selection: drops already-done jobs, then applies an optional cap (for smoke tests). */
export function selectPendingJobs<T>(jobs: T[], isDone: (job: T) => boolean, limit?: number): T[] {
  const pending = jobs.filter((job) => !isDone(job));
  return typeof limit === 'number' ? pending.slice(0, limit) : pending;
}

// --- CLI ---------------------------------------------------------------------

interface CliArgs {
  language: string;
  job: 'missing-sets' | 'enrich' | 'images' | 'images-deep' | 'retry-failed' | 'discover-zh-cn';
  limit?: number;
  dryRun: boolean;
  /** Dumps every fetched article's wikitext to data/harvest/debug/, not just zero-row ones (which always dump regardless of this flag). */
  dumpWikitext: boolean;
}

const JOB_VALUES = ['missing-sets', 'enrich', 'images', 'images-deep', 'retry-failed', 'discover-zh-cn'] as const;

export function parseArgs(argv: string[]): CliArgs {
  let language: string | undefined;
  let job: CliArgs['job'] | undefined;
  let limit: number | undefined;
  let dryRun = false;
  let dumpWikitext = false;
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (flag === '--dump-wikitext') {
      dumpWikitext = true;
      continue;
    }
    if (flag === '--lang') {
      language = args.shift();
      continue;
    }
    if (flag === '--job') {
      const value = args.shift();
      if (!JOB_VALUES.includes(value as (typeof JOB_VALUES)[number])) {
        throw new Error(`--job must be one of: ${JOB_VALUES.join(', ')}.`);
      }
      job = value as CliArgs['job'];
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
    throw new Error(`Usage: npm run harvest -- --lang <code> --job <${JOB_VALUES.join('|')}> [--limit <n>] [--dry-run] [--dump-wikitext]`);
  }
  if (!job) throw new Error(`--job is required: one of ${JOB_VALUES.join(', ')}.`);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error('--limit must be a non-negative integer.');
  }
  return { language, job, limit, dryRun, dumpWikitext };
}

const DATA_DIR = 'data';
const GAP_MANIFEST_PATH = path.join(DATA_DIR, 'gap-audit', 'GAP-MANIFEST.json');
const LOCAL_INCOMPLETE_PATH = path.join(DATA_DIR, 'gap-audit', 'local-incomplete.json');
const ZH_CN_ARTICLES_PATH = path.join(DATA_DIR, 'harvest', 'zh-cn-articles.json');
const ZH_TW_MISSING_PATH = path.join(DATA_DIR, 'harvest', 'zh-tw-missing.json');
const ARTICLE_OVERRIDES_PATH = path.join(DATA_DIR, 'harvest', 'article-overrides.json');
const PROGRESS_PATH = path.join(DATA_DIR, 'harvest', 'progress.json');
const DEBUG_DIR = path.join(DATA_DIR, 'harvest', 'debug');
const APP_CARDS_DIR = path.resolve('..', '..', 'public', 'data', 'cards');

function harvestOutputDir(language: string): string {
  return path.join(DATA_DIR, 'harvest', language);
}

async function loadProgress(): Promise<ProgressFile> {
  try {
    const parsed = JSON.parse(await readFile(PROGRESS_PATH, 'utf8')) as Partial<ProgressFile>;
    return {
      missingSets: parsed.missingSets ?? {},
      enrich: parsed.enrich ?? {},
      images: parsed.images ?? {},
      imagesDeep: parsed.imagesDeep ?? {},
      failed: parsed.failed ?? {},
    };
  } catch {
    return emptyProgress();
  }
}

/**
 * Best-effort load of the curated article-overrides mapping (gitignored,
 * data/harvest/article-overrides.json) -- missing/unparseable is treated as
 * "no overrides", never fatal. The on-disk file wraps the actual
 * `${language}:${setId}` map in a metadata envelope (generatedFrom/notes/...),
 * matching this pipeline's existing zh-cn-articles.json convention, so only
 * its `overrides` field is the ArticleOverrideFile resolveJobArticles wants.
 */
async function loadArticleOverrides(): Promise<ArticleOverrideFile> {
  try {
    const parsed = JSON.parse(await readFile(ARTICLE_OVERRIDES_PATH, 'utf8')) as { overrides?: ArticleOverrideFile };
    return parsed.overrides ?? {};
  } catch {
    return {};
  }
}

/**
 * Writes every fetched article's raw wikitext to data/harvest/debug/ for
 * manual diagnosis -- always when the harvest produced zero rows (the fix
 * for the zh-cn zero-row sets: we don't have their wikitext saved from the
 * overnight run, so the NEXT run leaves diagnosable evidence), or for any
 * set when `force` (the --dump-wikitext flag) is set.
 */
async function dumpWikitextIfNeeded(
  language: string,
  setId: string,
  articles: Array<{ title: string; wikitext: string }>,
  totalRows: number,
  force: boolean
): Promise<void> {
  if (totalRows > 0 && !force) return;
  await mkdir(DEBUG_DIR, { recursive: true });
  for (let i = 0; i < articles.length; i++) {
    const suffix = articles.length > 1 ? `.${i + 1}` : '';
    const file = path.join(DEBUG_DIR, `${language}-${setId}${suffix}.wikitext`);
    await writeFile(file, articles[i].wikitext, 'utf8');
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

/**
 * zh-tw also has no per-set data in the gap manifest (missingSets is empty
 * -- zh-tw's harvest this cycle was pure enrichment on already-held sets),
 * so its missing-set jobs come from the curated jobs file instead -- see
 * buildZhTwJobs's own doc comment.
 */
async function loadZhTwJobs(): Promise<HarvestJob[]> {
  const mapping = JSON.parse(await readFile(ZH_TW_MISSING_PATH, 'utf8')) as ZhTwMissingSetsFile;
  return buildZhTwJobs(mapping);
}

async function loadMissingSetJobs(language: string): Promise<HarvestJob[]> {
  if (language === 'zh-cn') return loadZhCnJobs();
  if (language === 'zh-tw') return loadZhTwJobs();
  return buildMissingSetJobs(JSON.parse(await readFile(GAP_MANIFEST_PATH, 'utf8')) as GapManifest, [language]);
}

async function runMissingSets(cli: CliArgs): Promise<void> {
  const allJobs: HarvestJob[] = await loadMissingSetJobs(cli.language);
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
        sourceArticleTitles: [page.title],
        harvestedAt: new Date().toISOString(),
        totalRows: allRows.length,
        gen1Count: gen1Rows.length,
        imagesResolved: cards.filter((c) => c.imageUrl).length,
        cards,
      };

      await writeFile(path.join(outputDir, `${setId}.json`), JSON.stringify(result, null, 2), 'utf8');
      await dumpWikitextIfNeeded(cli.language, setId, [{ title: page.title, wikitext: page.wikitext }], allRows.length, cli.dumpWikitext);

      progress.missingSets[cli.language] ??= {};
      progress.missingSets[cli.language][job.proposedSetId] = {
        setName: realSetName,
        gen1Count: gen1Rows.length,
        totalRows: allRows.length,
        completedAt: result.harvestedAt,
      };
      clearMissingSetFailure(progress, cli.language, job.proposedSetId);
      await saveProgress(progress);

      console.log(
        `  done: ${allRows.length} row(s), ${gen1Rows.length} Gen1, ${result.imagesResolved} image(s) resolved.` +
          (allRows.length === 0 ? ' [0 rows -- wikitext dumped for diagnosis]' : '')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${job.proposedSetId}: ${message}`);
      recordMissingSetFailure(progress, cli.language, job.proposedSetId, {
        setName: job.setName,
        reason: message,
        failedAt: new Date().toISOString(),
      });
      await saveProgress(progress);
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

async function runImages(cli: CliArgs): Promise<void> {
  const cardsPath = path.join(APP_CARDS_DIR, `${cli.language}.json`);
  const cardsByDex = JSON.parse(await readFile(cardsPath, 'utf8')) as Record<string, CardRecord[]>;
  const allJobs = buildImageJobs(cardsByDex, cli.language);
  const progress = await loadProgress();
  const pending = selectPendingJobs(allJobs, (job) => isImagesDone(progress, job.language, job.setId), cli.limit);

  const totalCards = allJobs.reduce((n, job) => n + job.cards.length, 0);
  console.log(
    `Planned ${allJobs.length} image-only job(s) for ${cli.language} covering ${totalCards} card(s) with no image at all; ` +
      `${pending.length} job(s) pending after resume filter` +
      (typeof cli.limit === 'number' ? ` (limited to ${cli.limit})` : '') +
      '.'
  );
  if (cli.dryRun) {
    for (const job of pending) console.log(`  [dry-run] ${job.setId}: cards=${job.cards.length}`);
    return;
  }
  if (pending.length === 0) return;

  const client = createWikiApiClient();
  const outputDir = harvestOutputDir(cli.language);
  await mkdir(outputDir, { recursive: true });

  for (let i = 0; i < pending.length; i++) {
    const job = pending[i];
    console.log(`resolving images for set ${i + 1}/${pending.length} (${job.setId}) in ${cli.language}`);
    try {
      const cards = await resolveImageJobCards(client, job);

      const result: ImageHarvestResult = {
        language: cli.language,
        setId: job.setId,
        setName: job.setName,
        harvestedAt: new Date().toISOString(),
        totalCards: job.cards.length,
        imagesResolved: cards.filter((c) => c.imageUrl).length,
        cards,
      };

      await writeFile(path.join(outputDir, `images-${job.setId}.json`), JSON.stringify(result, null, 2), 'utf8');

      progress.images ??= {};
      progress.images[cli.language] ??= {};
      progress.images[cli.language][job.setId] = {
        cardCount: job.cards.length,
        imagesResolved: result.imagesResolved,
        completedAt: result.harvestedAt,
      };
      await saveProgress(progress);

      console.log(`  done: ${result.imagesResolved}/${job.cards.length} resolved.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${job.setId}: ${message}`);
    }
  }
}

const GENERATION_COUNT = 9;

/** Best-effort read of one generation's card database for a language -- generation 1 lives at public/data/cards/<lang>.json, generations 2-9 at public/data/cards/<lang>/gen<N>.json. A language missing a given generation file (not every language has all 9 yet) returns null rather than throwing. */
async function loadGenerationCardsByDex(language: string, generation: number): Promise<Record<string, CardRecord[]> | null> {
  const filePath =
    generation === 1
      ? path.join(APP_CARDS_DIR, `${language}.json`)
      : path.join(APP_CARDS_DIR, language, `gen${generation}.json`);
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, CardRecord[]>;
  } catch {
    return null;
  }
}

async function loadAllGenerationsForLanguage(language: string): Promise<LanguageGenerationFiles> {
  const files: LanguageGenerationFiles = new Map();
  for (let generation = 1; generation <= GENERATION_COUNT; generation++) {
    const cardsByDex = await loadGenerationCardsByDex(language, generation);
    if (cardsByDex) files.set(generation, cardsByDex);
  }
  return files;
}

function ensureImagesDeepState(
  progress: ProgressFile,
  language: string
): { doneCardIds: Record<string, true>; nextChunk: number } {
  progress.imagesDeep ??= {};
  progress.imagesDeep[language] ??= { doneCardIds: {}, nextChunk: 0 };
  return progress.imagesDeep[language];
}

async function runImagesDeep(cli: CliArgs): Promise<void> {
  const generationFiles = await loadAllGenerationsForLanguage(cli.language);
  const fullQueue = buildDeepImageQueue(generationFiles);
  const progress = await loadProgress();
  const state = ensureImagesDeepState(progress, cli.language);

  const isDone = (card: DeepImageJobCard) => Boolean(state.doneCardIds[card.cardId]);
  const pendingAll = fullQueue.filter((card) => !isDone(card));
  const pending = selectPendingJobs(fullQueue, isDone, cli.limit);

  console.log(
    `Planned images-deep for ${cli.language}: ${fullQueue.length} imageless card(s) across ${generationFiles.size} generation file(s), ` +
      `${pendingAll.length} pending after resume filter` +
      (typeof cli.limit === 'number' ? `; processing ${pending.length} this run (--limit ${cli.limit})` : '') +
      '.'
  );
  if (cli.dryRun) {
    for (const chunk of chunkQueue(pending)) {
      const preview = chunk
        .slice(0, 3)
        .map((c) => `${c.name}#${c.localId}(${c.setId})`)
        .join(', ');
      console.log(`  [dry-run] chunk of ${chunk.length}: ${preview}${chunk.length > 3 ? ', ...' : ''}`);
    }
    return;
  }
  if (pending.length === 0) return;

  const client = createWikiApiClient();
  const outputDir = harvestOutputDir(cli.language);
  await mkdir(outputDir, { recursive: true });

  // Run-scoped set-article cache: one fetch per setId covers EVERY card of
  // that set across every chunk this run touches (null = the set article
  // could not be resolved under any candidate title; also cached, so a
  // missing article costs its candidate fetches only once per run).
  const setPageCache = new Map<string, { rows: SetlistRow[]; articleSetName: string } | null>();

  async function loadSetRowsCached(card: DeepImageJobCard): Promise<{ rows: SetlistRow[]; articleSetName: string } | null> {
    const cached = setPageCache.get(card.setId);
    if (cached !== undefined) return cached;
    let resolved: { rows: SetlistRow[]; articleSetName: string } | null = null;
    for (const title of buildDeepSetArticleCandidates(card.setName)) {
      try {
        const page = await client.parsePageWikitext(title);
        const parsed = parseSetPageWikitext(page.wikitext);
        resolved = {
          rows: [...parsed.cardListRows, ...parsed.additionalCardRows],
          articleSetName: deriveSetNameFromArticleTitle(page.title),
        };
        break;
      } catch {
        // title doesn't exist -- try the next candidate
      }
    }
    setPageCache.set(card.setId, resolved);
    return resolved;
  }

  const chunks = chunkQueue(pending);
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const chunkNumber = state.nextChunk;
    console.log(`images-deep chunk ${c + 1}/${chunks.length} for ${cli.language} (chunk #${chunkNumber}, ${chunk.length} card(s))`);

    try {
      const results: DeepResolvedCard[] = [];
      const skipped: DeepImageHarvestResult['skipped'] = [];

      // Step (a): the cheap batched filename guess, generalized to this
      // chunk's per-card setNames -- see deepImageResolver.ts's own doc
      // comment on why the plain-images-job's grouped version can't be
      // reused verbatim here.
      const guessed = await resolveFilenameGuessBatch(client, chunk);
      const afterGuess: DeepImageJobCard[] = [];
      for (const card of chunk) {
        const hit = guessed.get(card.cardId);
        if (hit) {
          results.push({
            cardId: card.cardId,
            dexNumber: card.dexNumber,
            localId: card.localId,
            imageFileTitle: hit.fileTitle,
            imageUrl: hit.url,
            imageMissing: false,
            method: 'filename-guess',
            skipReason: null,
          });
        } else {
          afterGuess.push(card);
        }
      }

      // Step (b): the set-article row match -- fetch each still-unresolved
      // card's own set article ONCE per setId per run, match rows by print
      // code, then resolve the matched rows' images through the very same
      // resolveHarvestedCardImages path a fresh set harvest uses (its
      // strategy (a) reads each row's own article-title disambiguator --
      // the wiki's real naming -- which is exactly what our held setName
      // was too divergent to guess; confirmed live for both the promo
      // convention and reprint-only products like McDonald's sets).
      const stillUnresolved: DeepImageJobCard[] = [];
      const bySet = new Map<string, DeepImageJobCard[]>();
      for (const card of afterGuess) {
        const bucket = bySet.get(card.setId);
        if (bucket) bucket.push(card);
        else bySet.set(card.setId, [card]);
      }
      for (const [, setCards] of bySet) {
        const setPage = await loadSetRowsCached(setCards[0]);
        if (!setPage || setPage.rows.length === 0) {
          stillUnresolved.push(...setCards);
          continue;
        }
        const matches = matchDeepCardsToSetRows(setCards, setPage.rows, setPage.articleSetName);
        const matchedIds = new Set(matches.map((m) => m.card.cardId));
        stillUnresolved.push(...setCards.filter((card) => !matchedIds.has(card.cardId)));
        if (matches.length === 0) continue;

        const gen1Rows: Gen1MatchedRow[] = matches.map(({ card, row }) => ({
          row,
          dex: { number: card.dexNumber, name: card.name },
        }));
        const harvested = await resolveHarvestedCardImages(client, setPage.articleSetName, gen1Rows);
        for (let i = 0; i < matches.length; i++) {
          const { card } = matches[i];
          const outcome = harvested[i];
          if (outcome.imageUrl) {
            results.push({
              cardId: card.cardId,
              dexNumber: card.dexNumber,
              localId: card.localId,
              imageFileTitle: outcome.imageFileTitle,
              imageUrl: outcome.imageUrl,
              imageMissing: false,
              method: 'set-rows',
              skipReason: null,
            });
          } else {
            // The row matched but its image never resolved -- fall through
            // to the per-card ladder rather than giving up here.
            stillUnresolved.push(card);
          }
        }
      }

      // Steps (c)/(d)/(e): the per-card article-title ladder, one card at a
      // time -- each parsePageWikitext/searchPageTitles/queryImageInfo call
      // goes through the same client's shared politeScheduler, so the 5s
      // host gap applies automatically without any extra pacing code here.
      for (const card of stillUnresolved) {
        try {
          const resolved = await resolveCardArticleLadder(client, card);
          results.push(resolved);
          if (resolved.skipReason) {
            skipped.push({ cardId: card.cardId, name: card.name, setName: card.setName, localId: card.localId, reason: resolved.skipReason });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            cardId: card.cardId,
            dexNumber: card.dexNumber,
            localId: card.localId,
            imageFileTitle: null,
            imageUrl: null,
            imageMissing: true,
            method: null,
            skipReason: `error: ${message}`,
          });
        }
      }

      const methodCounts: Record<string, number> = {};
      for (const r of results) {
        const key = r.method ?? 'unresolved';
        methodCounts[key] = (methodCounts[key] ?? 0) + 1;
      }
      const imagesResolved = results.filter((r) => !r.imageMissing).length;

      const chunkResult: DeepImageHarvestResult = {
        language: cli.language,
        setId: `images-deep-chunk-${chunkNumber}`,
        setName: `Deep image resolution chunk ${chunkNumber}`,
        harvestedAt: new Date().toISOString(),
        totalCards: chunk.length,
        imagesResolved,
        cards: results,
        skipped,
        chunkIndex: chunkNumber,
      };

      await writeFile(path.join(outputDir, `images-deep-${chunkNumber}.json`), JSON.stringify(chunkResult, null, 2), 'utf8');

      for (const card of chunk) state.doneCardIds[card.cardId] = true;
      state.nextChunk += 1;
      await saveProgress(progress);

      console.log(
        `  done: ${imagesResolved}/${chunk.length} resolved (${JSON.stringify(methodCounts)}), ${skipped.length} skipped.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED chunk #${chunkNumber}: ${message} -- chunk not marked done, will be retried in full next run.`);
    }
  }
}

// --- Retry-failed -------------------------------------------------------------

function expectedSuffixFor(language: string): 'TCG' | 'ATCG' {
  return language === 'id' || language === 'th' || language === 'zh-cn' ? 'ATCG' : 'TCG';
}

async function runRetryFailed(cli: CliArgs): Promise<void> {
  const progress = await loadProgress();
  const retryTargets = new Set(selectRetryTargets(progress, cli.language));
  if (retryTargets.size === 0) {
    console.log(`No failed or zero-row missing-set jobs recorded for ${cli.language}; nothing to retry.`);
    return;
  }

  const allJobs: HarvestJob[] = await loadMissingSetJobs(cli.language);
  const pending = allJobs.filter((job) => retryTargets.has(job.proposedSetId));
  const limited = typeof cli.limit === 'number' ? pending.slice(0, cli.limit) : pending;

  console.log(
    `Retrying ${retryTargets.size} failed/zero-row set(s) for ${cli.language}; ${limited.length} job(s) matched the current job list` +
      (typeof cli.limit === 'number' ? ` (limited to ${cli.limit})` : '') +
      '.'
  );
  for (const setId of retryTargets) {
    if (!pending.some((job) => job.proposedSetId === setId)) {
      console.log(`  [unresolved] ${setId}: recorded as needing retry but no longer present in the current job list.`);
    }
  }

  if (cli.dryRun) {
    for (const job of limited) {
      console.log(`  [dry-run] ${job.proposedSetId}: direct -> variant -> override -> search.`);
    }
    return;
  }
  if (limited.length === 0) return;

  const overrides = await loadArticleOverrides();
  const client = createWikiApiClient();
  const outputDir = harvestOutputDir(cli.language);
  await mkdir(outputDir, { recursive: true });

  for (let i = 0; i < limited.length; i++) {
    const job = limited[i];
    console.log(`retrying set ${i + 1}/${limited.length} for ${cli.language}: ${job.proposedSetId}`);
    try {
      const targetName = deriveSetNameFromArticleTitle(job.setName);
      const { resolution, attempts, log } = await resolveJobArticles(client, {
        language: cli.language,
        setId: job.proposedSetId,
        articleTitle: job.setName,
        targetName,
        expectedSuffix: expectedSuffixFor(cli.language),
        overrides,
      });

      for (const line of log) console.log(`  ${line}`);

      if (!resolution) {
        console.error(`  UNRESOLVED ${job.proposedSetId}: tried ${attempts.join(', ')}.`);
        recordMissingSetFailure(progress, cli.language, job.proposedSetId, {
          setName: job.setName,
          reason: `unresolved after the full retry resolution chain`,
          attempts,
          failedAt: new Date().toISOString(),
        });
        await saveProgress(progress);
        continue;
      }

      const harvested = await harvestFromResolvedArticles(client, resolution.articles);

      let setId = job.proposedSetId;
      if (cli.language === 'zh-cn') {
        const csCode = extractCsCode(resolution.articles[0].page.setInfo);
        const zhResolution = resolveZhCnSetId(job.proposedSetId, csCode);
        if (zhResolution.mismatched) {
          console.warn(
            `  setId mismatch for ${job.proposedSetId}: mapping proposed "${job.proposedSetId}", infobox carries "${zhResolution.setId}" -- using the infobox value.`
          );
        }
        setId = zhResolution.setId;
      }

      const result: SetHarvestResult = {
        language: cli.language,
        setId,
        setName: harvested.realSetName,
        sourceArticleTitle: harvested.sourceArticleTitles.join(' + '),
        sourceArticleTitles: harvested.sourceArticleTitles,
        harvestedAt: new Date().toISOString(),
        totalRows: harvested.totalRows,
        gen1Count: harvested.gen1Count,
        imagesResolved: harvested.cards.filter((c) => c.imageUrl).length,
        cards: harvested.cards,
      };

      await writeFile(path.join(outputDir, `${setId}.json`), JSON.stringify(result, null, 2), 'utf8');
      await dumpWikitextIfNeeded(
        cli.language,
        setId,
        resolution.articles.map((a) => ({ title: a.fetchedTitle, wikitext: a.wikitext })),
        harvested.totalRows,
        cli.dumpWikitext
      );

      progress.missingSets[cli.language] ??= {};
      progress.missingSets[cli.language][job.proposedSetId] = {
        setName: harvested.realSetName,
        gen1Count: harvested.gen1Count,
        totalRows: harvested.totalRows,
        completedAt: result.harvestedAt,
      };
      clearMissingSetFailure(progress, cli.language, job.proposedSetId);
      await saveProgress(progress);

      console.log(
        `  done via ${resolution.method}: ${harvested.totalRows} row(s), ${harvested.gen1Count} Gen1, ` +
          `${result.imagesResolved} image(s) resolved.` +
          (harvested.totalRows === 0 ? ' [0 rows -- wikitext dumped for diagnosis]' : '')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${job.proposedSetId}: ${message}`);
      recordMissingSetFailure(progress, cli.language, job.proposedSetId, {
        setName: job.setName,
        reason: message,
        failedAt: new Date().toISOString(),
      });
      await saveProgress(progress);
    }
  }
}

// --- zh-cn article discovery (build, do not run automatically) --------------

async function runDiscoverZhCn(cli: CliArgs): Promise<void> {
  const mapping = JSON.parse(await readFile(ZH_CN_ARTICLES_PATH, 'utf8')) as ZhCnArticleMappingFile;
  const client = createWikiApiClient();

  // A broader sweep than the recon pass's original 29-article search --
  // see GAP-MANIFEST.json's zh-cn unresolved-bucket notes and
  // data/harvest/zh-cn-articles.json's own generatedFrom field.
  const discovered = await client.searchPageTitles('intitle:"(ATCG)"', { limit: 200 });
  const { mapping: merged, addedCount, addedKeys } = mergeDiscoveredZhCnArticles(mapping, discovered);

  console.log(
    `Broader (ATCG) title sweep found ${discovered.length} candidate(s); ${addedCount} new entr(y/ies) would be merged.`
  );
  for (const key of addedKeys) console.log(`  [discovered] ${key}`);

  if (cli.dryRun) {
    console.log('Dry run -- zh-cn-articles.json not written.');
    return;
  }
  await writeFile(ZH_CN_ARTICLES_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`zh-cn-articles.json updated: ${mapping.sets.length} -> ${merged.sets.length} entries.`);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.job === 'missing-sets') await runMissingSets(cli);
  else if (cli.job === 'enrich') await runEnrich(cli);
  else if (cli.job === 'images') await runImages(cli);
  else if (cli.job === 'images-deep') await runImagesDeep(cli);
  else if (cli.job === 'retry-failed') await runRetryFailed(cli);
  else await runDiscoverZhCn(cli);
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('runHarvest')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
