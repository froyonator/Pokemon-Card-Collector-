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

// Fetches the pre-built static card database for a language, keyed by Gen1
// dex number, from this app's own `public/data/cards/<language>.json`
// (produced by scripts/carddata's buildStaticDatabase.ts, not the live
// primary-source API). Returns `null` -- never throws -- on any failure: a non-2xx
// response, a network error, or malformed JSON. `null` is the fallback
// signal callers key off of to mean "no static data for this language, fall
// back to the existing live-API path exactly as before", so a failure here
// must never propagate as a rejected promise.
export function loadStaticCardData(
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<number, CardRecord[]> | null> {
  const cached = staticDataCache.get(language);
  if (cached) return cached;

  const promise = (async (): Promise<Record<number, CardRecord[]> | null> => {
    try {
      // import.meta.env.BASE_URL carries Vite's configured `base` (a
      // GitHub Pages subpath in production, `/` in dev), the same prefix
      // Vite itself rewrites root-relative asset references in index.html
      // to at build time -- this is the runtime-fetch equivalent for a
      // `public/` asset referenced from application code rather than HTML.
      const url = `${import.meta.env.BASE_URL}data/cards/${language}.json`;
      const response = await fetchImpl(url);
      if (!response.ok) return null;
      return (await response.json()) as Record<number, CardRecord[]>;
    } catch {
      return null;
    }
  })();

  staticDataCache.set(language, promise);
  return promise;
}
