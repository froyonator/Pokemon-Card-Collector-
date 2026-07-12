// scripts/carddata/src/harvest/wikiApiClient.ts
//
// Thin client for the reference wiki's MediaWiki API. Wikitext only (never
// rendered HTML) via action=parse, plus action=query for imageinfo/search.
// Every request is routed through a shared politeScheduler so no two
// requests to the host fire less than `minRequestGapMs` apart, honoring the
// site's own declared crawl-delay as a floor, not a suggestion.
import { createPoliteScheduler } from '../politeScheduler';
import type { WikiImageInfo, WikiPageWikitext, WikiSearchResult } from './types';

// Literal endpoint value the client needs to function. Kept as a plain
// string constant, not embedded in identifiers or prose elsewhere in this
// module -- see the harvester's provenance-handling convention.
const WIKI_API_URL = 'https://bulbapedia.bulbagarden.net/w/api.php';

// The site's robots.txt declares Crawl-delay: 5 on the wiki host; treat
// that as an authoritative floor, not a default that callers can loosen.
export const DEFAULT_MIN_REQUEST_GAP_MS = 5000;
export const DEFAULT_USER_AGENT = 'CollectorsLedger-harvest/1.0 (personal project)';
export const IMAGEINFO_BATCH_SIZE = 50;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 750;
// Guards against a pathological/misbehaving continuation loop; real result
// sets for this harvester's use cases (one set's card list, one set's image
// batch) never come close to this many pages of continuation.
const MAX_CONTINUATION_PAGES = 25;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export interface WikiApiClientOptions {
  fetchImpl?: typeof fetch;
  /** Minimum gap between any two requests this client sends. Never set below the site's declared crawl-delay in production use. */
  minRequestGapMs?: number;
  userAgent?: string;
  attempts?: number;
  retryDelayMs?: number;
}

export interface WikiApiClient {
  /** action=parse&prop=wikitext for one page title. Throws if the page does not exist. */
  parsePageWikitext(title: string): Promise<WikiPageWikitext>;
  /** action=query&prop=imageinfo for any number of File: titles, batched at IMAGEINFO_BATCH_SIZE per request with continuation handling. */
  queryImageInfo(fileTitles: string[]): Promise<Map<string, WikiImageInfo>>;
  /** action=query&list=search, for set/category discovery. */
  searchPageTitles(
    query: string,
    options?: { namespace?: number; limit?: number }
  ): Promise<WikiSearchResult[]>;
}

export function createWikiApiClient(options: WikiApiClientOptions = {}): WikiApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const minRequestGapMs = options.minRequestGapMs ?? DEFAULT_MIN_REQUEST_GAP_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const scheduler = createPoliteScheduler(minRequestGapMs);

  async function politeFetchJson<T>(url: string): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        // Each individual attempt -- including retries -- goes through the
        // scheduler, so a retry never tightens the gap between requests;
        // it can only add to it via the backoff wait below.
        const response = await scheduler(() =>
          fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': userAgent } })
        );
        if (response.ok) return (await response.json()) as T;
        const error = new Error(`Wiki API request failed with HTTP ${response.status}: ${url}`);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) throw error;
        lastError = error;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === attempts) throw lastError;
      }
      await wait(retryDelayMs * attempt);
    }
    throw lastError ?? new Error(`Wiki API request failed: ${url}`);
  }

  async function parsePageWikitext(title: string): Promise<WikiPageWikitext> {
    const url = buildUrl(WIKI_API_URL, {
      action: 'parse',
      format: 'json',
      formatversion: 2,
      prop: 'wikitext',
      page: title,
      // Several set titles this harvester needs (confirmed live: a whole
      // year's McDonald's Collection article) are themselves #REDIRECTs to
      // a combined article. Without this, action=parse returns just the
      // one-line "#REDIRECT[[...]]" stub instead of the real content.
      redirects: 1,
    });
    const data = await politeFetchJson<{
      error?: { code?: string; info?: string };
      parse?: { title?: string; pageid?: number; wikitext?: string };
    }>(url);
    if (data.error) {
      throw new Error(
        `Wiki page request failed for "${title}": ${data.error.info ?? data.error.code ?? 'unknown error'}`
      );
    }
    if (!data.parse || typeof data.parse.wikitext !== 'string') {
      throw new Error(`Wiki page request for "${title}" returned no wikitext`);
    }
    return {
      title: data.parse.title ?? title,
      pageId: typeof data.parse.pageid === 'number' ? data.parse.pageid : null,
      wikitext: data.parse.wikitext,
    };
  }

  // The File: namespace is a shared repository backed by a separate media
  // host, but this same wiki's own api.php resolves it transparently --
  // imageinfo never needs a second endpoint, just this one with titles=.
  // Confirmed live: a file that lives ONLY on the shared repository (true
  // of every real card scan) comes back with `missing: true` on the page
  // itself (there's no LOCAL File: page for it) while still carrying a
  // fully populated `imageinfo` array with a real url -- `missing` on its
  // own is not a reliable "does this file exist" signal here. Whether
  // `imageinfo` was returned at all is.
  async function queryImageInfoBatch(
    fileTitles: string[],
    result: Map<string, WikiImageInfo>
  ): Promise<void> {
    let continueParams: Record<string, string> = {};
    for (let page = 0; page < MAX_CONTINUATION_PAGES; page++) {
      const url = buildUrl(WIKI_API_URL, {
        action: 'query',
        format: 'json',
        formatversion: 2,
        prop: 'imageinfo',
        iiprop: 'url|size|mime|sha1',
        titles: fileTitles.join('|'),
        ...continueParams,
      });
      const data = await politeFetchJson<{
        query?: {
          // MediaWiki normalizes requested titles (underscores -> spaces,
          // first-letter case) before matching them to pages, and reports
          // any change it made here rather than in `pages` itself --
          // `pages[].title` comes back ALREADY NORMALIZED. Skipping this
          // mapping means every title whose normalized form differs from
          // what was requested reads back as a miss on lookup, even though
          // the wiki found a real page for it.
          normalized?: Array<{ from: string; to: string }>;
          pages?: Array<{
            title: string;
            missing?: boolean;
            imageinfo?: Array<{
              url?: string;
              thumburl?: string;
              width?: number;
              height?: number;
              mime?: string;
              sha1?: string;
            }>;
          }>;
        };
        continue?: Record<string, string>;
      }>(url);

      const normalizedToRequested = new Map<string, string>();
      for (const entry of data.query?.normalized ?? []) {
        normalizedToRequested.set(entry.to, entry.from);
      }

      for (const page of data.query?.pages ?? []) {
        const info = page.imageinfo?.[0];
        const requestedTitle = normalizedToRequested.get(page.title) ?? page.title;
        result.set(requestedTitle, {
          fileTitle: page.title,
          url: info?.url ?? null,
          thumbUrl: info?.thumburl,
          width: info?.width,
          height: info?.height,
          mime: info?.mime,
          sha1: info?.sha1,
          missing: !info,
        });
      }

      if (!data.continue) return;
      continueParams = data.continue;
    }
  }

  async function queryImageInfo(fileTitles: string[]): Promise<Map<string, WikiImageInfo>> {
    const result = new Map<string, WikiImageInfo>();
    for (const batch of chunk(fileTitles, IMAGEINFO_BATCH_SIZE)) {
      if (batch.length === 0) continue;
      await queryImageInfoBatch(batch, result);
    }
    return result;
  }

  async function searchPageTitles(
    query: string,
    searchOptions: { namespace?: number; limit?: number } = {}
  ): Promise<WikiSearchResult[]> {
    const limit = searchOptions.limit ?? 20;
    const results: WikiSearchResult[] = [];
    let continueParams: Record<string, string> = {};
    for (let page = 0; page < MAX_CONTINUATION_PAGES && results.length < limit; page++) {
      const url = buildUrl(WIKI_API_URL, {
        action: 'query',
        format: 'json',
        formatversion: 2,
        list: 'search',
        srsearch: query,
        srnamespace: searchOptions.namespace,
        srlimit: Math.min(limit - results.length, 50),
        ...continueParams,
      });
      const data = await politeFetchJson<{
        query?: { search?: Array<{ title: string; snippet?: string }> };
        continue?: Record<string, string>;
      }>(url);
      const batch = data.query?.search ?? [];
      for (const item of batch) results.push({ title: item.title, snippet: item.snippet });
      if (!data.continue || batch.length === 0) break;
      continueParams = data.continue;
    }
    return results.slice(0, limit);
  }

  return { parsePageWikitext, queryImageInfo, searchPageTitles };
}
