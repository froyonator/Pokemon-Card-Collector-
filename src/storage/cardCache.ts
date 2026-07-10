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

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
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
