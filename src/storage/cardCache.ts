import type { CardPricing, CardRecord } from '../types';

const CARD_CACHE_KEY = 'pcc:cardCache:v1';
const PRICE_CACHE_KEY = 'pcc:priceCache:v1';
const FULL_PRINT_HISTORY_KEY = 'pcc:fullPrintHistory:v1';

interface CardCacheShape {
  [key: string]: CardRecord[];
}

// Tracks, per language+dexNumber key, whether the cache entry currently
// holds a Pokemon's *complete* unfiltered print history (from
// loadAllPrintingsForDex) rather than just the curated-rarity subset (from
// loadAllCardData). The CardRecord cache itself can't tell these apart after
// the fact -- both are stored as a plain CardRecord[] under the same key --
// so this sits alongside it as the signal that lets a "Show all cards"
// toggle skip re-fetching once it's already been run for that Pokemon.
interface FullPrintHistoryCacheShape {
  [key: string]: boolean;
}

interface PriceCacheShape {
  [cardId: string]: CardPricing;
}

// In-memory cache of the parsed blob for each localStorage key, so repeated
// reads within a short span (e.g. DexGrid's cardsByDexNumber memo calling
// getCachedCards once per dex entry -- up to 151 times -- which now
// recomputes on every onDexLoaded-triggered, rAF-coalesced dataVersion bump
// during a streaming load, not just once at the very end) don't re-run
// JSON.parse over the entire ever-growing cache blob on every single call.
//
// Keyed on the raw string actually read from localStorage, not just
// invalidated on writes made through writeJson below: localStorage.getItem
// is cheap (an object property lookup), so every read still confirms the
// underlying raw string hasn't changed before trusting a cached parse. That
// is what keeps this correct even against mutations this module didn't make
// itself -- direct localStorage.setItem/removeItem/clear() calls, which the
// test suite's `beforeEach(() => localStorage.clear())` and at least one
// test (cardCache.test.ts's corrupted-JSON case) both do -- not just writes
// that happened to go through writeJson.
//
// Read results (e.g. from getCachedCards) are the cached object's own
// nested arrays/values, not defensive copies, so callers must treat them as
// read-only; nothing in this codebase currently mutates a returned array in
// place; if that ever changes, copy before mutating.
const parsedCache = new Map<string, { raw: string | null; parsed: unknown }>();

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  const cached = parsedCache.get(key);
  if (cached && cached.raw === raw) {
    return cached.parsed as T;
  }
  if (!raw) {
    parsedCache.set(key, { raw, parsed: fallback });
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as T;
    parsedCache.set(key, { raw, parsed });
    return parsed;
  } catch {
    parsedCache.set(key, { raw, parsed: fallback });
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  // Cache the write's own value directly (not just invalidate-and-let-the-
  // next-read-reparse) so a write is reflected immediately without an
  // unnecessary redundant JSON.parse of what we just serialized ourselves.
  parsedCache.set(key, { raw, parsed: value });
}

export function cardCacheKey(language: string, dexNumber: number): string {
  return `${language}:${dexNumber}`;
}

export function getCachedCards(language: string, dexNumber: number): CardRecord[] | undefined {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  return cache[cardCacheKey(language, dexNumber)];
}

export function setCachedCards(language: string, dexNumber: number, cards: CardRecord[]): void {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  cache[cardCacheKey(language, dexNumber)] = cards;
  writeJson(CARD_CACHE_KEY, cache);
}

export function getCachedPricing(cardId: string): CardPricing | undefined {
  const cache = readJson<PriceCacheShape>(PRICE_CACHE_KEY, {});
  return cache[cardId];
}

export function setCachedPricing(cardId: string, pricing: CardPricing): void {
  const cache = readJson<PriceCacheShape>(PRICE_CACHE_KEY, {});
  cache[cardId] = pricing;
  writeJson(PRICE_CACHE_KEY, cache);
}

export function clearCardCache(): void {
  localStorage.removeItem(CARD_CACHE_KEY);
  localStorage.removeItem(FULL_PRINT_HISTORY_KEY);
}

export function hasFullPrintHistory(language: string, dexNumber: number): boolean {
  const cache = readJson<FullPrintHistoryCacheShape>(FULL_PRINT_HISTORY_KEY, {});
  return Boolean(cache[cardCacheKey(language, dexNumber)]);
}

export function markFullPrintHistoryFetched(language: string, dexNumber: number): void {
  const cache = readJson<FullPrintHistoryCacheShape>(FULL_PRINT_HISTORY_KEY, {});
  cache[cardCacheKey(language, dexNumber)] = true;
  writeJson(FULL_PRINT_HISTORY_KEY, cache);
}

// Called whenever curated-only data (loadAllCardData) overwrites a dex
// number's cache entry, so a stale "already have the full print history"
// flag from an earlier "Show all cards" toggle doesn't survive a refresh
// that just replaced that same cache slot with the narrower curated subset.
export function clearFullPrintHistory(language: string, dexNumber: number): void {
  const cache = readJson<FullPrintHistoryCacheShape>(FULL_PRINT_HISTORY_KEY, {});
  delete cache[cardCacheKey(language, dexNumber)];
  writeJson(FULL_PRINT_HISTORY_KEY, cache);
}

export function hasCachedDataForLanguage(language: string): boolean {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  return Object.keys(cache).some((key) => key.startsWith(`${language}:`));
}

// Scans every language+dexNumber entry currently in the cache and returns
// the distinct set of rarity strings seen across all of them. Used by
// ManageGroupsPanel so a rarity that has never been assigned to a group
// (e.g. 'Promo') can still show up as assignable once at least one cached
// card carries it.
export function getAllCachedRarities(): string[] {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  const set = new Set<string>();
  for (const cards of Object.values(cache)) {
    for (const card of cards) {
      set.add(card.rarity);
    }
  }
  return Array.from(set);
}
