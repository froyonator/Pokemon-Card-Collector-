import { SUPPORTED_LANGUAGES } from '../types';

// Languages the static database (scripts/carddata's pipeline output under
// public/data/cards/) has no coverage for at all -- see
// scripts/carddata/src/buildStaticDatabase.ts's LANGUAGE_SNAPSHOTS list and
// its own comment on why nl/ru/pl are absent: confirmed, live against the
// primary data source, zero per-card data upstream for Gen1-relevant sets --
// a real upstream gap, not a pipeline bug. Every other supported language has
// at least a Gen1 static file, so these three are the only ones whose card
// data -- and therefore whose "how fresh is it" signal -- comes entirely from
// the live API fallback path (see state/loadCardData.ts's staticBucketForDex,
// which returns `undefined` for exactly these and lets its callers fall
// through to the live fetch).
const LIVE_ONLY_LANGUAGES = new Set(['nl', 'ru', 'pl']);

// Whether `language` has at least a Gen1 static database file. A rough,
// language-only signal (not generation-aware) -- good enough for call sites
// that just need "is there any static answer here at all worth preferring
// over a live call" (e.g. Summary.tsx's data-currency indicator), as opposed
// to state/loadCardData.ts's own per-generation staticBucketForDex, which is
// the authoritative, generation-aware check used before any actual card data
// is read or written.
export function isStaticCoveredLanguage(language: string): boolean {
  return !LIVE_ONLY_LANGUAGES.has(language);
}

// Every supported language code covered by the static database -- used by
// state/dbVersionSync.ts to scope a stale-cache invalidation to exactly the
// languages a static-database version bump could actually affect, leaving
// nl/ru/pl's live-API-sourced cache entries untouched.
export function staticCoveredLanguages(): string[] {
  return SUPPORTED_LANGUAGES.map((language) => language.code).filter(isStaticCoveredLanguage);
}
