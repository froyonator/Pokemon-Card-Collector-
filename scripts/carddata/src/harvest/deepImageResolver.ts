// scripts/carddata/src/harvest/deepImageResolver.ts
//
// Per-card, search-based deep image resolution for already-held cards whose
// stored setName diverges from the reference wiki's own article naming
// enough that the batched filename guess (cardImageResolver.ts, reused
// as-is by runImages/resolveImageJobCards) never finds them -- promos and
// vintage reprints especially. What's missing there is TITLE RESOLUTION per
// card: this module resolves the card's own article title first (direct
// guess plus known naming-convention forms, then orthographic variants,
// then a scored title search) and only then reads THAT article's infobox
// image field, exactly the way a human would navigate to the right scan by
// hand.
//
// A resolution is only ever trusted when the fetched article's own
// disambiguator agrees with the held card's name, print number, and set
// beyond normalization (see checkArticleMatchesPrint) -- anything less is
// reported via `skipReason`, never guessed. False art is worse than a
// placeholder.
import {
  guessCardImageFilename,
  isCardShapedImage,
  parseCardInfoboxImageFilename,
  resolveCardImages,
  toFileTitle,
} from './cardImageResolver';
import { generateTitleVariants } from './titleVariants';
import type { WikiImageInfo, WikiPageWikitext, WikiSearchResult } from './types';
import type { WikiApiClient } from './wikiApiClient';

/** One held card queued for deep resolution -- a flattened view of a CardRecord plus its generation, built by runHarvest.ts's buildDeepImageQueue. */
export interface DeepImageJobCard {
  cardId: string;
  dexNumber: number;
  generation: number;
  name: string;
  localId: string;
  rarity: string | null;
  setId: string;
  setName: string;
}

// --- small local helpers -----------------------------------------------------
//
// Local tokenize/overlap scoring in the spirit of retryResolution.ts's own,
// duplicated here rather than imported: runHarvest.ts imports FROM this
// module for the CLI job, so an import in the other direction would cycle.

/**
 * Normalizes a printed card code for print-identity comparison: numerator
 * only, alpha prefix uppercased, leading zeros stripped from the digit
 * part, any trailing suffix kept and uppercased -- so "SM198", "sm198",
 * and "SM0198" all normalize alike, and "074" meets "74". Held localIds
 * and wiki-side numbers both go through this before any comparison
 * (confirmed live: our "037" against a wiki row's "37", our "SWSH074"
 * against a wiki row's own "SWSH074").
 */
export function normalizeCardCode(value: string): string {
  const numerator = value.split('/')[0]?.trim() ?? value.trim();
  const match = numerator.match(/^([A-Za-z]*)0*(\d+)(.*)$/);
  if (!match) return numerator.toUpperCase();
  return `${match[1].toUpperCase()}${match[2]}${match[3].toUpperCase()}`;
}

/** Splits a normalized card code into its alpha prefix and the rest, e.g. "SM198" -> { prefix: "SM", rest: "198" }. */
function splitCardCode(normalizedCode: string): { prefix: string; rest: string } {
  const match = normalizedCode.match(/^([A-Z]*)(.*)$/);
  return { prefix: match?.[1] ?? '', rest: match?.[2] ?? normalizedCode };
}

/**
 * Print-number identity check, prefix-tolerantly: true on an exact
 * normalized-code match, and ALSO when only one side carries an alpha
 * prefix, the digit parts agree, and that prefix is accounted for by the
 * article's own set name (confirmed live: our "SM198" against the article
 * "Bulbasaur (SM Promo 198)" -- the SM lives in the article's set name,
 * not its number). A prefix the article's set name does NOT account for
 * stays a mismatch, so a held "SM198" can never match an "(XY Promo 198)"
 * article.
 */
export function cardCodesMatch(heldLocalId: string, articleNumber: string, articleSetName: string): boolean {
  const held = normalizeCardCode(heldLocalId);
  const article = normalizeCardCode(articleNumber);
  if (held === article) return true;

  const heldParts = splitCardCode(held);
  const articleParts = splitCardCode(article);
  if (heldParts.rest !== articleParts.rest) return false;
  const setTokens = tokenize(articleSetName);
  if (heldParts.prefix && !articleParts.prefix) return setTokens.has(heldParts.prefix.toLowerCase());
  if (articleParts.prefix && !heldParts.prefix) return setTokens.has(articleParts.prefix.toLowerCase());
  return false;
}

/** Lowercased word tokens with a light plural stem (trailing "s" dropped from longer tokens), so "Promos" and "Promo" count as the same token -- a confirmed live divergence between our stored promo set names and the wiki's article naming. */
function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
  );
}

/** Fraction of `a`'s own tokens also present in `b` -- asymmetric on purpose, matching retryResolution.ts's scoreSearchCandidate convention. */
function tokenOverlap(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap++;
  return overlap / aTokens.size;
}

// --- print-disambiguator parsing ----------------------------------------------

/** True for a disambiguator's final token that plausibly IS a card number/code ("198", "SM198", "H4", "15A1"), as opposed to the last word of a number-less set name ("Battle" in "Squirtle (My First Battle)"). */
function looksLikeCardCode(token: string): boolean {
  return /\d/.test(token) && /^[A-Za-z]{0,8}\d+[A-Za-z0-9]*$/.test(token);
}

export interface PrintDisambiguator {
  cardName: string;
  setName: string;
  /** Null for a number-less "Name (Set)" article title -- the wiki's convention when a card is that set's only print of the name (confirmed live: "Squirtle (My First Battle)"). */
  number: string | null;
}

/**
 * Splits a card article title's trailing "(...)" disambiguator into card
 * name, set name, and print number -- unlike cardImageResolver's own
 * parseCardArticleDisambiguator, this also accepts the number-LESS
 * "Name (Set)" form, only treating the parenthetical's last token as a
 * number when it actually looks like one.
 */
export function parsePrintDisambiguator(title: string): PrintDisambiguator | null {
  const match = title.match(/^(.+?)\s\(([^()]+)\)$/);
  if (!match) return null;
  const cardName = match[1].trim();
  const inner = match[2].trim();
  if (!cardName || !inner) return null;

  const lastSpace = inner.lastIndexOf(' ');
  if (lastSpace !== -1) {
    const lastToken = inner.slice(lastSpace + 1).trim();
    if (looksLikeCardCode(lastToken)) {
      const setName = inner.slice(0, lastSpace).trim();
      if (setName) return { cardName, setName, number: lastToken };
    }
    return { cardName, setName: inner, number: null };
  }
  // Single-token parenthetical: a bare number is not a set name; a bare
  // word is a number-less set name.
  if (looksLikeCardCode(inner)) return null;
  return { cardName, setName: inner, number: null };
}

// --- step (a): filename-guess batch, reused as-is ----------------------------
//
// Same guess+resolve building blocks resolveHarvestedCardImages's (a)/(b)
// rounds use (guessCardImageFilename, resolveCardImages, toFileTitle from
// cardImageResolver.ts), generalized to a per-card setName: unlike a normal
// harvest job or the plain images job, a deep-resolution chunk is NOT
// grouped by setId -- it deliberately spans many different sets per chunk
// (that's the whole point of ordering by dex-then-generation), so the
// candidate list can't share one promoSetName across the batch the way
// buildRowImageCandidates does.
export async function resolveFilenameGuessBatch(
  client: Pick<WikiApiClient, 'queryImageInfo'>,
  cards: DeepImageJobCard[]
): Promise<Map<string, WikiImageInfo>> {
  interface GuessState {
    card: DeepImageJobCard;
    candidates: string[];
    resolved: WikiImageInfo | null;
  }

  const states: GuessState[] = cards.map((card) => ({
    card,
    candidates: [
      guessCardImageFilename({ cardName: card.name, setName: card.setName, cardNumber: card.localId, extension: 'jpg' }),
      guessCardImageFilename({ cardName: card.name, setName: card.setName, cardNumber: card.localId, extension: 'png' }),
    ].filter((f): f is string => f !== null),
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

  const resolved = new Map<string, WikiImageInfo>();
  for (const state of states) {
    if (state.resolved) resolved.set(state.card.cardId, state.resolved);
  }
  return resolved;
}

// --- step (b): derived article-title candidates -------------------------------

/** The digit part of a normalized code, prefix/suffix stripped, for building wiki-convention titles whose numbers are bare ("SM198" -> "198"). */
function bareCodeDigits(localId: string): string {
  const { rest } = splitCardCode(normalizeCardCode(localId));
  return rest;
}

/**
 * Candidate article titles for a card's OWN print, cheapest/most-likely
 * first:
 *  - the direct "Name (SetName Code)" construction from our held data
 *    (code normalized -- the wiki never zero-pads its title numbers);
 *  - for a "<Series> Black Star Promos" set, the wiki's own promo article
 *    convention "Name (<Series> Promo <bare number>)" (confirmed live:
 *    held "SM Black Star Promos" + "SM198" resolves as
 *    "Bulbasaur (SM Promo 198)");
 *  - the number-less "Name (SetName)" form the wiki uses when a card is
 *    its set's only print of that name (confirmed live:
 *    "Squirtle (My First Battle)");
 *  - orthographic variants of all of the above (Pokemon/Pokémon, &/and,
 *    ...) via titleVariants.ts -- the same forks that make a plain
 *    missing-set title guess 404 unnecessarily.
 */
export function buildArticleTitleCandidates(card: DeepImageJobCard): string[] {
  const bases: string[] = [];
  bases.push(`${card.name} (${card.setName} ${normalizeCardCode(card.localId)})`);

  const promoMatch = card.setName.match(/^(.*?)\s*Black Star Promos$/i);
  if (promoMatch) {
    const series = promoMatch[1].trim() || splitCardCode(normalizeCardCode(card.localId)).prefix;
    if (series) bases.push(`${card.name} (${series} Promo ${bareCodeDigits(card.localId)})`);
  }

  bases.push(`${card.name} (${card.setName})`);

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    for (const title of [base, ...generateTitleVariants(base)]) {
      if (!seen.has(title)) {
        seen.add(title);
        candidates.push(title);
      }
    }
  }
  return candidates;
}

// --- correctness guard --------------------------------------------------------

export interface ArticleMatchResult {
  ok: boolean;
  reason: string | null;
}

const SET_NAME_OVERLAP_THRESHOLD = 0.5;
/** A number-less title has one less independent signal confirming the print, so its set name must match ours more convincingly before it is trusted. */
const NUMBERLESS_SET_NAME_OVERLAP_THRESHOLD = 0.75;

/**
 * The false-art guard: a fetched article is only trusted for a held card
 * when its own disambiguator names the SAME card (exact name,
 * case-insensitive), the SAME print (prefix-tolerant code match, see
 * cardCodesMatch), and a set name close enough to ours (token overlap --
 * never exact equality, since our stored setNames are known to diverge
 * from the wiki's own naming; that divergence is this whole job's reason
 * to exist). A number-less "Name (Set)" title is accepted only under a
 * stricter set-name bar, since the print number can't corroborate it.
 * Any check failing is reported, never silently guessed past.
 *
 * `card` only needs the three identity fields (name, localId, setName), not
 * the full DeepImageJobCard shape -- runHarvest.ts's own strategy-(c) guard
 * (resolveViaCardArticleInfobox) reuses this same guard for a bare literal
 * cardArticleTitle row, which has no dexNumber/generation/rarity/setId to
 * offer.
 */
export function checkArticleMatchesPrint(
  fetchedTitle: string,
  card: Pick<DeepImageJobCard, 'name' | 'localId' | 'setName'>
): ArticleMatchResult {
  const disambiguator = parsePrintDisambiguator(fetchedTitle);
  if (!disambiguator) {
    return { ok: false, reason: `no "(Set Number)" disambiguator to verify against` };
  }
  if (disambiguator.cardName.toLowerCase() !== card.name.toLowerCase()) {
    return { ok: false, reason: `name "${disambiguator.cardName}" does not match held name "${card.name}"` };
  }
  const overlap = tokenOverlap(card.setName, disambiguator.setName);
  if (disambiguator.number === null) {
    if (overlap < NUMBERLESS_SET_NAME_OVERLAP_THRESHOLD) {
      return {
        ok: false,
        reason: `number-less title's set "${disambiguator.setName}" does not sufficiently match held set "${card.setName}" (token overlap ${overlap.toFixed(2)})`,
      };
    }
    return { ok: true, reason: null };
  }
  if (!cardCodesMatch(card.localId, disambiguator.number, disambiguator.setName)) {
    return { ok: false, reason: `number "${disambiguator.number}" does not match held localId "${card.localId}"` };
  }
  if (overlap < SET_NAME_OVERLAP_THRESHOLD) {
    return {
      ok: false,
      reason: `set "${disambiguator.setName}" does not sufficiently match held set "${card.setName}" (token overlap ${overlap.toFixed(2)})`,
    };
  }
  return { ok: true, reason: null };
}

// --- step (c): scored title search --------------------------------------------

/** True for a title shaped like a card article ("Name (Set Number)" or the number-less "Name (Set)"), as opposed to a species page, category, or disambiguation page. */
export function isCardArticleShapedTitle(title: string): boolean {
  return parsePrintDisambiguator(title) !== null;
}

export function buildCardSearchQuery(card: DeepImageJobCard): string {
  return `${card.name} ${card.setName}`;
}

const CARD_SEARCH_MIN_SCORE = 1.5;

/**
 * Scores a search-result title for how confidently it names the SAME print
 * as `card`. Returns null (a hard disqualification, not a low score) for
 * anything the correctness guard would reject -- delegating to
 * checkArticleMatchesPrint keeps search scoring and the final guard
 * identical by construction. A qualifying numbered candidate scores 1 (the
 * number match) plus its set-name token-overlap fraction; a qualifying
 * number-less candidate scores only its (necessarily high, see the guard's
 * stricter bar) set-name overlap plus 0.75, keeping it below any
 * number-confirmed candidate for the same card.
 */
export function scoreCardSearchCandidate(candidateTitle: string, card: DeepImageJobCard): number | null {
  if (!checkArticleMatchesPrint(candidateTitle, card).ok) return null;
  const disambiguator = parsePrintDisambiguator(candidateTitle)!;
  const overlap = tokenOverlap(card.setName, disambiguator.setName);
  return (disambiguator.number === null ? 0.75 : 1) + overlap;
}

export type CardSearchOutcome =
  | { status: 'hit'; title: string; score: number }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'none' };

/**
 * Picks a single high-confidence search hit, or reports why not: `'none'`
 * when nothing cleared the bar, `'ambiguous'` when more than one candidate
 * tied for the top qualifying score. Candidates are already restricted to
 * card-article-shaped, exact-name, code-matching titles by
 * scoreCardSearchCandidate itself, so an 'ambiguous' result means two
 * DIFFERENT sets both plausibly matching -- a real, if rare, scenario worth
 * logging rather than silently picking one (never guess between two
 * plausible prints).
 */
export function pickBestCardSearchCandidate(results: WikiSearchResult[], card: DeepImageJobCard): CardSearchOutcome {
  const scored = results
    .map((r) => ({ title: r.title, score: scoreCardSearchCandidate(r.title, card) }))
    .filter((s): s is { title: string; score: number } => s.score !== null && s.score >= CARD_SEARCH_MIN_SCORE);
  if (scored.length === 0) return { status: 'none' };
  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore);
  if (top.length > 1) return { status: 'ambiguous', candidates: top.map((s) => s.title) };
  return { status: 'hit', title: top[0].title, score: top[0].score };
}

// --- step (d) + full per-card ladder -------------------------------------------

export type DeepResolutionMethod = 'filename-guess' | 'set-rows' | 'article-direct' | 'article-variant' | 'article-search';

export interface DeepResolvedCard {
  cardId: string;
  dexNumber: number;
  localId: string;
  imageFileTitle: string | null;
  imageUrl: string | null;
  imageMissing: boolean;
  method: DeepResolutionMethod | null;
  /** Populated only when an article was found but rejected by the correctness guard, or a search tie -- distinct from a plain "nothing found" miss. */
  skipReason: string | null;
}

type DeepClient = Pick<WikiApiClient, 'parsePageWikitext' | 'searchPageTitles' | 'queryImageInfo'>;

interface ArticleAttempt {
  fetched: WikiPageWikitext;
  guard: ArticleMatchResult;
}

async function tryResolveFromArticle(client: DeepClient, card: DeepImageJobCard, title: string): Promise<ArticleAttempt | null> {
  let fetched: WikiPageWikitext;
  try {
    fetched = await client.parsePageWikitext(title);
  } catch {
    return null;
  }
  return { fetched, guard: checkArticleMatchesPrint(fetched.title, card) };
}

/** Step (d): reads the matched article's infobox image field for the matching print and resolves it via imageinfo. Reuses parseCardInfoboxImageFilename's own multi-printing/recaption handling verbatim. */
async function resolveInfoboxImage(
  client: Pick<WikiApiClient, 'queryImageInfo'>,
  card: DeepImageJobCard,
  fetched: WikiPageWikitext
): Promise<WikiImageInfo | null> {
  const disambiguator = parsePrintDisambiguator(fetched.title);
  const targetSetNames = [card.setName, disambiguator?.setName].filter((s): s is string => Boolean(s));
  const filename = parseCardInfoboxImageFilename(fetched.wikitext, targetSetNames);
  if (!filename) return null;
  const info = await resolveCardImages(client, [filename]);
  const result = info.get(toFileTitle(filename));
  return result && !result.missing && isCardShapedImage(result) ? result : null;
}

function notResolved(card: DeepImageJobCard, skipReason: string | null = null): DeepResolvedCard {
  return {
    cardId: card.cardId,
    dexNumber: card.dexNumber,
    localId: card.localId,
    imageFileTitle: null,
    imageUrl: null,
    imageMissing: true,
    method: null,
    skipReason,
  };
}

function resolvedVia(card: DeepImageJobCard, method: DeepResolutionMethod, info: WikiImageInfo): DeepResolvedCard {
  return {
    cardId: card.cardId,
    dexNumber: card.dexNumber,
    localId: card.localId,
    imageFileTitle: info.fileTitle,
    imageUrl: info.url,
    imageMissing: false,
    method,
    skipReason: null,
  };
}

/**
 * Runs ladder steps (b)/(c)/(d) for ONE card already confirmed unresolved
 * by both the cheap filename-guess batch (step a) and the set-article row
 * match (runHarvest.ts's own stage, which amortizes one set-page fetch
 * across every held card of that set). Tries the direct article-title
 * guesses and their variants, then a scored title search, taking the FIRST
 * article that both fetches and clears the correctness guard AND resolves a
 * real image. A guard rejection or a matched-but-imageless article does not
 * abort the ladder -- later candidates (a different variant, or the search
 * step) can still land on the right article -- but every rejection along
 * the way is accumulated into the final `skipReason` so an ultimately
 * unresolved card still carries a diagnosable trail.
 */
export async function resolveCardArticleLadder(client: DeepClient, card: DeepImageJobCard): Promise<DeepResolvedCard> {
  const skipReasons: string[] = [];

  const candidates = buildArticleTitleCandidates(card);
  for (let i = 0; i < candidates.length; i++) {
    const attempt = await tryResolveFromArticle(client, card, candidates[i]);
    if (!attempt) continue; // title doesn't exist on the wiki -- try the next candidate
    if (!attempt.guard.ok) {
      skipReasons.push(`title "${candidates[i]}": ${attempt.guard.reason}`);
      continue;
    }
    const info = await resolveInfoboxImage(client, card, attempt.fetched);
    if (info) return resolvedVia(card, i === 0 ? 'article-direct' : 'article-variant', info);
    skipReasons.push(`article "${attempt.fetched.title}" matched but carried no resolvable image field`);
  }

  const searchResults = await client.searchPageTitles(buildCardSearchQuery(card), { limit: 10 });
  const outcome = pickBestCardSearchCandidate(searchResults, card);
  if (outcome.status === 'ambiguous') {
    skipReasons.push(`ambiguous title search: ${outcome.candidates.join(', ')} all matched equally well`);
  } else if (outcome.status === 'hit') {
    const attempt = await tryResolveFromArticle(client, card, outcome.title);
    if (!attempt) {
      skipReasons.push(`search hit "${outcome.title}" could not be fetched`);
    } else if (!attempt.guard.ok) {
      skipReasons.push(`search hit "${outcome.title}": ${attempt.guard.reason}`);
    } else {
      const info = await resolveInfoboxImage(client, card, attempt.fetched);
      if (info) return resolvedVia(card, 'article-search', info);
      skipReasons.push(`search hit "${outcome.title}" matched but carried no resolvable image field`);
    }
  }

  return notResolved(card, skipReasons.length > 0 ? skipReasons.join('; ') : null);
}
