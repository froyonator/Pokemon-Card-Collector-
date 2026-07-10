import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCardCache,
  getAllCachedRarities,
  getCachedCards,
  getCachedPricing,
  hasCachedDataForLanguage,
  setCachedCards,
  setCachedPricing,
} from './cardCache';
import type { CardPricing, CardRecord } from '../types';

const sampleCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const promoCard: CardRecord = {
  id: 'svp-044',
  name: 'Charmander',
  dexNumber: 4,
  setId: 'svp',
  setName: 'SV Promos',
  localId: '044',
  rarity: 'Promo',
  imageBase: 'https://assets.tcgdex.net/en/svp/svp/044',
  language: 'en',
};

const commonCardJa: CardRecord = {
  id: 'sv2a-001',
  name: 'Charmander',
  dexNumber: 4,
  setId: 'sv2a',
  setName: '151',
  localId: '001',
  rarity: 'Common',
  imageBase: 'https://assets.tcgdex.net/ja/sv/sv2a/001',
  language: 'ja',
};

const samplePricing: CardPricing = {
  cardId: 'sv03.5-199',
  cardmarketEurAvg: 372.8,
  tcgplayerUsdMarket: 699.99,
  fetchedAt: '2026-07-09T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

describe('card cache', () => {
  it('returns undefined for a dex number that has not been cached', () => {
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('falls back to undefined when the cached value is corrupted JSON', () => {
    localStorage.setItem('pcc:cardCache:v1', 'not valid json{');
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('round-trips a card list for a language and dex number', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('en', 6)).toEqual([sampleCard]);
  });

  it('keeps caches for different languages separate', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('ja', 6)).toBeUndefined();
  });

  it('clearCardCache empties the cache', () => {
    setCachedCards('en', 6, [sampleCard]);
    clearCardCache();
    expect(getCachedCards('en', 6)).toBeUndefined();
  });
});

describe('hasCachedDataForLanguage', () => {
  it('returns false when nothing has been cached for a language', () => {
    expect(hasCachedDataForLanguage('en')).toBe(false);
  });

  it('returns true once at least one dex number has been cached for that language', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(hasCachedDataForLanguage('en')).toBe(true);
    expect(hasCachedDataForLanguage('ja')).toBe(false);
  });
});

describe('pricing cache', () => {
  it('returns undefined for a card that has not been priced', () => {
    expect(getCachedPricing('sv03.5-199')).toBeUndefined();
  });

  it('round-trips pricing for a card id', () => {
    setCachedPricing('sv03.5-199', samplePricing);
    expect(getCachedPricing('sv03.5-199')).toEqual(samplePricing);
  });
});

describe('getAllCachedRarities', () => {
  it('returns an empty array when nothing has been cached', () => {
    expect(getAllCachedRarities()).toEqual([]);
  });

  it('returns the deduplicated set of rarities across every language and dex number', () => {
    setCachedCards('en', 6, [sampleCard]);
    setCachedCards('en', 4, [promoCard, sampleCard]);
    setCachedCards('ja', 4, [commonCardJa]);

    const rarities = getAllCachedRarities();
    expect(new Set(rarities)).toEqual(
      new Set(['Special illustration rare', 'Promo', 'Common'])
    );
    expect(rarities).toHaveLength(3);
  });
});
