import type { CardPricing, CardRecord } from '../types';

const CARD_CACHE_KEY = 'pcc:cardCache:v1';
const PRICE_CACHE_KEY = 'pcc:priceCache:v1';

interface CardCacheShape {
  [key: string]: CardRecord[];
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
}

export function hasCachedDataForLanguage(language: string): boolean {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  return Object.keys(cache).some((key) => key.startsWith(`${language}:`));
}
