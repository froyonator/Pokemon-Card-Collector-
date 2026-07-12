// scripts/carddata/src/harvest/retryResolution.ts
//
// The fallback chain `--job retry-failed` (runHarvest.ts) uses to find an
// article for a set that 404'd or produced zero rows on the last run:
// direct title -> orthographic variants -> the curated override mapping ->
// a scored title search. Pure orchestration over an injected client (the
// same shape wikiApiClient.ts's real client satisfies), so every step is
// unit-testable against mock/fixture wikitext with zero live requests.
import { parseSetPageWikitext } from './setlistParser';
import type { ParsedSetPage, WikiSearchResult } from './types';
import { generateTitleVariants } from './titleVariants';
import type { WikiApiClient } from './wikiApiClient';

/** One article to fetch, with an optional named-section restriction (see setlistParser's parseSetPageWikitext options). */
export interface ArticleTarget {
  title: string;
  sectionTitle?: string | null;
}

/** One entry of data/harvest/article-overrides.json, keyed by `${language}:${setId}` (see overrideKey). */
export interface ArticleOverrideEntry {
  /** One or more articles whose rows are concatenated, in order, for this job -- see the ja paired-set / shared-article fixes. */
  articles: ArticleTarget[];
  /** Free-form provenance/reasoning, surfaced in the retry report and console log -- generic wording only, no source names. */
  note: string;
}

export type ArticleOverrideFile = Record<string, ArticleOverrideEntry>;

export function overrideKey(language: string, setId: string): string {
  return `${language}:${setId}`;
}

export function lookupOverride(
  overrides: ArticleOverrideFile,
  language: string,
  setId: string
): ArticleOverrideEntry | null {
  return overrides[overrideKey(language, setId)] ?? null;
}

// --- title search scoring ----------------------------------------------------

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/\(a?tcg\)/gi, '')
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
  );
}

/**
 * Token-overlap score between one search-result title and the target set
 * name, as a fraction of the target's own tokens matched, plus a bonus for
 * carrying the namespace suffix a resolved job of this kind is expected to
 * have. Deliberately simple/deterministic -- no AI interpretation, matching
 * this harvester's zero-token design throughout.
 */
export function scoreSearchCandidate(
  candidateTitle: string,
  targetName: string,
  expectedSuffix: 'TCG' | 'ATCG'
): number {
  const candidateTokens = tokenize(candidateTitle);
  const targetTokens = tokenize(targetName);
  if (targetTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) overlap++;
  }
  let score = overlap / targetTokens.size;
  // The suffix bonus only sweetens a candidate that already has some real
  // overlap -- a title that merely happens to end in "(TCG)"/"(ATCG)" with
  // zero shared tokens is not a plausible match and must stay at 0.
  if (score > 0 && new RegExp(`\\(${expectedSuffix}\\)$`).test(candidateTitle.trim())) score += 0.25;
  return score;
}

/** Picks the highest-scoring search candidate, or null when every candidate scores 0 (no meaningful overlap at all). */
export function pickBestSearchCandidate(
  results: WikiSearchResult[],
  targetName: string,
  expectedSuffix: 'TCG' | 'ATCG'
): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null;
  for (const result of results) {
    const score = scoreSearchCandidate(result.title, targetName, expectedSuffix);
    if (!best || score > best.score) best = { title: result.title, score };
  }
  return best && best.score > 0 ? best : null;
}

// --- resolution chain ---------------------------------------------------------

export type ResolutionMethod = 'direct' | 'variant' | 'override' | 'search';

export interface ResolvedArticle extends ArticleTarget {
  /** The title actually returned by the fetch (can differ from `title` when the request followed a redirect). */
  fetchedTitle: string;
  page: ParsedSetPage;
  wikitext: string;
}

export interface JobResolution {
  method: ResolutionMethod;
  articles: ResolvedArticle[];
}

export interface ResolveJobOptions {
  language: string;
  setId: string;
  /** The direct article title already known to 404 (job.setName from the previous run). */
  articleTitle: string;
  /** Human set name (namespace suffix stripped) used as the title-search query and scoring target. */
  targetName: string;
  expectedSuffix: 'TCG' | 'ATCG';
  overrides: ArticleOverrideFile;
}

export interface ResolveJobResult {
  resolution: JobResolution | null;
  /** Every article title actually attempted, across every stage -- for the "tried: ..." unresolved report line. */
  attempts: string[];
  /** Generic, source-name-free log lines describing which stage/candidate resolved the job. */
  log: string[];
}

type ResolutionClient = Pick<WikiApiClient, 'parsePageWikitext' | 'searchPageTitles'>;

/**
 * Resolves one failed/zero-row job's article(s), trying progressively
 * less-direct strategies until one produces a fetchable page: the original
 * direct title, then generated orthographic variants (titleVariants.ts),
 * then the curated override mapping (possibly multiple articles,
 * concatenated), then a scored automatic title search as a last resort.
 * Never throws -- a fully unresolved job comes back with `resolution: null`
 * and the full attempt list for the caller to report.
 */
export async function resolveJobArticles(
  client: ResolutionClient,
  options: ResolveJobOptions
): Promise<ResolveJobResult> {
  const attempts: string[] = [];
  const log: string[] = [];

  async function tryFetch(target: ArticleTarget): Promise<ResolvedArticle | null> {
    attempts.push(target.title);
    try {
      const fetched = await client.parsePageWikitext(target.title);
      const page = parseSetPageWikitext(fetched.wikitext, { sectionTitle: target.sectionTitle });
      return { ...target, fetchedTitle: fetched.title, page, wikitext: fetched.wikitext };
    } catch {
      return null;
    }
  }

  const direct = await tryFetch({ title: options.articleTitle });
  if (direct) return { resolution: { method: 'direct', articles: [direct] }, attempts, log };

  for (const variant of generateTitleVariants(options.articleTitle)) {
    const resolved = await tryFetch({ title: variant });
    if (resolved) {
      log.push('resolved via an orthographic title variant');
      return { resolution: { method: 'variant', articles: [resolved] }, attempts, log };
    }
  }

  const override = lookupOverride(options.overrides, options.language, options.setId);
  if (override && override.articles.length > 0) {
    const resolved: ResolvedArticle[] = [];
    for (const target of override.articles) {
      const article = await tryFetch(target);
      if (article) resolved.push(article);
    }
    if (resolved.length > 0) {
      log.push(`resolved via the curated override mapping (${override.note})`);
      return { resolution: { method: 'override', articles: resolved }, attempts, log };
    }
  }

  const searchResults = await client.searchPageTitles(options.targetName, { limit: 10 });
  const best = pickBestSearchCandidate(searchResults, options.targetName, options.expectedSuffix);
  if (best) {
    const resolved = await tryFetch({ title: best.title });
    if (resolved) {
      log.push(
        `resolved via an automatic title search; picked candidate "${best.title}" (overlap score ${best.score.toFixed(2)})`
      );
      return { resolution: { method: 'search', articles: [resolved] }, attempts, log };
    }
  }

  return { resolution: null, attempts, log };
}
