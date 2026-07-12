import type { CardRecord } from '../types';

// Memoizes the in-flight/resolved fetch per language, so repeated or
// concurrent calls for the same language within one app session (e.g. the
// DexGrid auto-load effect re-running as selectedGenerations changes) reuse
// the same promise instead of re-requesting the same static JSON file. A
// failed lookup (network error, 404, malformed JSON) resolves to `null` and
// that `null` result is cached too -- there is no retry-on-failure here, by
// design; a language with no static file is expected to stay that way for
// the rest of the session, and the caller's live-API fallback path takes
// over regardless.
const staticDataCache = new Map<string, Promise<Record<number, CardRecord[]> | null>>();

// Same memoization contract as staticDataCache above, but keyed per
// language+generation (see genCacheKey) instead of per language alone --
// Gen 1's static file stays a single per-language file at
// data/cards/<language>.json (unchanged, see staticDataCache), while Gens
// 2-9 each live in their own data/cards/<language>/gen<N>.json, so a
// language+generation pair that hasn't shipped a file yet (404) must not be
// confused with a sibling generation of the same language that has.
const staticDataByGenCache = new Map<string, Promise<Record<number, CardRecord[]> | null>>();

function genCacheKey(language: string, gen: number): string {
  return `${language}:${gen}`;
}

// Shared by every fetch-and-parse call below (the Gen 1 language-only path
// and the per-generation path, both the memoized and always-fresh variants
// of each) -- the only differences between callers are the URL built and
// whether an existing session memo entry short-circuits the call. Returns
// `null` -- never throws -- on any failure: a non-2xx response, a network
// error, or malformed JSON. `null` is the fallback signal callers key off of
// to mean "no static data for this language/generation, fall back to the
// existing live-API path exactly as before", so a failure here must never
// propagate as a rejected promise.
async function fetchStaticJson(
  url: string,
  fetchImpl: typeof fetch
): Promise<Record<number, CardRecord[]> | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return (await response.json()) as Record<number, CardRecord[]>;
  } catch {
    return null;
  }
}

// import.meta.env.BASE_URL carries Vite's configured `base` (a GitHub Pages
// subpath in production, `/` in dev), the same prefix Vite itself rewrites
// root-relative asset references in index.html to at build time -- this is
// the runtime-fetch equivalent for a `public/` asset referenced from
// application code rather than HTML.
function fetchStaticCardData(
  language: string,
  fetchImpl: typeof fetch
): Promise<Record<number, CardRecord[]> | null> {
  return fetchStaticJson(`${import.meta.env.BASE_URL}data/cards/${language}.json`, fetchImpl);
}

// Gen 2-9 static files each live at their own path, one directory level
// below the Gen 1 file: data/cards/<language>/gen<N>.json. Gen 1 itself is
// deliberately NOT servable through this path -- callers needing Gen 1 use
// loadStaticCardData/refreshStaticCardData above unchanged, so an existing
// gen-1-only session's requests, URLs, and cache keys stay byte-for-byte
// identical to before per-generation loading existed.
function fetchStaticCardDataForGen(
  language: string,
  gen: number,
  fetchImpl: typeof fetch
): Promise<Record<number, CardRecord[]> | null> {
  return fetchStaticJson(
    `${import.meta.env.BASE_URL}data/cards/${language}/gen${gen}.json`,
    fetchImpl
  );
}

// Fetches the pre-built static card database for a language, keyed by Gen1
// dex number, from this app's own `public/data/cards/<language>.json`
// (produced by scripts/carddata's buildStaticDatabase.ts, not the live
// primary-source API). Memoizes the in-flight/resolved fetch per language --
// see staticDataCache above -- so repeated or concurrent calls for the same
// language within one app session reuse the same promise instead of
// re-requesting the same static JSON file.
export function loadStaticCardData(
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<number, CardRecord[]> | null> {
  const cached = staticDataCache.get(language);
  if (cached) return cached;

  const promise = fetchStaticCardData(language, fetchImpl);
  staticDataCache.set(language, promise);
  return promise;
}

// Same fetch as loadStaticCardData, but deliberately bypasses (and then
// replaces) the per-session memo instead of reusing it. Refresh Data exists
// to pick up newly deployed static data, so a refresh on a static-covered
// language must not silently reuse whatever this session happened to fetch
// once before -- it issues a genuinely fresh request every time it's called.
// The memo entry is overwritten with THIS fetch's promise, so any later
// loadStaticCardData call for this language (e.g. the very next auto-load
// effect run) sees the refreshed data too, instead of racing back to the
// stale pre-refresh promise.
export function refreshStaticCardData(
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<number, CardRecord[]> | null> {
  const promise = fetchStaticCardData(language, fetchImpl);
  staticDataCache.set(language, promise);
  return promise;
}

// Same contract as loadStaticCardData above, but for a Gen 2-9 static file
// (data/cards/<language>/gen<N>.json) instead of the single Gen 1 file.
// Memoized per language+generation -- see staticDataByGenCache -- so a
// generation without a deployed file yet resolves to (and caches) `null`
// for the rest of the session, exactly like an uncovered language does for
// loadStaticCardData, and callers fall back to the live-API path per dex
// number regardless. Not meant to be called with gen 1 -- callers use
// loadStaticCardData for that, unchanged.
export function loadStaticCardDataForGen(
  language: string,
  gen: number,
  fetchImpl: typeof fetch = fetch
): Promise<Record<number, CardRecord[]> | null> {
  const key = genCacheKey(language, gen);
  const cached = staticDataByGenCache.get(key);
  if (cached) return cached;

  const promise = fetchStaticCardDataForGen(language, gen, fetchImpl);
  staticDataByGenCache.set(key, promise);
  return promise;
}

// Same relationship to loadStaticCardDataForGen as refreshStaticCardData has
// to loadStaticCardData: bypasses (and then replaces) the per-session memo
// with a genuinely fresh fetch, so Refresh Data picks up newly deployed
// per-generation static data instead of replaying whatever this session
// happened to fetch once before.
export function refreshStaticCardDataForGen(
  language: string,
  gen: number,
  fetchImpl: typeof fetch = fetch
): Promise<Record<number, CardRecord[]> | null> {
  const key = genCacheKey(language, gen);
  const promise = fetchStaticCardDataForGen(language, gen, fetchImpl);
  staticDataByGenCache.set(key, promise);
  return promise;
}
