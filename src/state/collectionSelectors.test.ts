import { beforeEach, describe, expect, it } from 'vitest';
import { buildCollectionRows, buildWishlistRows, sortRows } from './collectionSelectors';
import { setCachedCards, setCachedPricing } from '../storage/cardCache';
import type { CardRecord, OwnedRecord, WishlistRecord } from '../types';

const card: CardRecord = {
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

beforeEach(() => {
  localStorage.clear();
  setCachedCards('en', 6, [card]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 699.99,
    fetchedAt: '2026-07-09T00:00:00.000Z',
  });
});

describe('buildCollectionRows', () => {
  it('joins owned records with card data, name, and pricing', () => {
    const owned: Record<number, OwnedRecord> = {
      6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
    };
    const rows = buildCollectionRows('en', owned);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dexNumber: 6,
      pokemonName: 'Charizard',
      condition: 'Near Mint',
      cardmarketEurAvg: 372.8,
      tcgplayerUsdMarket: 699.99,
    });
    expect(rows[0].card?.id).toBe('sv03.5-199');
  });

  it('returns an empty array for empty owned/wishlist input', () => {
    expect(buildCollectionRows('en', {})).toEqual([]);
    expect(buildWishlistRows('en', {})).toEqual([]);
  });

  it('leaves card undefined and pricing null when the cardId has no cache entry', () => {
    const owned: Record<number, OwnedRecord> = {
      25: { dexNumber: 25, cardId: 'missing-card-id', condition: 'Mint', addedAt: '' },
    };
    const rows = buildCollectionRows('en', owned);
    expect(rows).toHaveLength(1);
    expect(rows[0].card).toBeUndefined();
    expect(rows[0].cardmarketEurAvg).toBeNull();
    expect(rows[0].tcgplayerUsdMarket).toBeNull();
  });
});

describe('buildWishlistRows', () => {
  it('joins wishlist records with card data and pricing', () => {
    const wishlist: Record<number, WishlistRecord> = {
      6: { dexNumber: 6, cardId: 'sv03.5-199', addedAt: '' },
    };
    const rows = buildWishlistRows('en', wishlist);
    expect(rows).toHaveLength(1);
    expect(rows[0].pokemonName).toBe('Charizard');
    expect(rows[0].tcgplayerUsdMarket).toBe(699.99);
  });
});

describe('sortRows', () => {
  const rows = [
    { dexNumber: 25, pokemonName: 'Pikachu' },
    { dexNumber: 6, pokemonName: 'Charizard' },
  ];

  it('sorts ascending by dex number', () => {
    const sorted = sortRows(rows, 'dexNumber', 'asc', () => null);
    expect(sorted.map((r) => r.dexNumber)).toEqual([6, 25]);
  });

  it('sorts descending by dex number', () => {
    const sorted = sortRows(rows, 'dexNumber', 'desc', () => null);
    expect(sorted.map((r) => r.dexNumber)).toEqual([25, 6]);
  });

  it('sorts alphabetically by name', () => {
    const sorted = sortRows(rows, 'name', 'asc', () => null);
    expect(sorted.map((r) => r.pokemonName)).toEqual(['Charizard', 'Pikachu']);
  });

  it('sorts by a price accessor', () => {
    const prices: Record<number, number> = { 25: 50, 6: 500 };
    const sorted = sortRows(rows, 'price', 'desc', (row) => prices[row.dexNumber]);
    expect(sorted.map((r) => r.dexNumber)).toEqual([6, 25]);
  });

  it('sorts a missing price (-Infinity fallback) to the top for asc and the bottom for desc', () => {
    const prices: Record<number, number | null> = { 6: 500, 25: null };
    const asc = sortRows(rows, 'price', 'asc', (row) => prices[row.dexNumber]);
    expect(asc.map((r) => r.dexNumber)).toEqual([25, 6]);
    const desc = sortRows(rows, 'price', 'desc', (row) => prices[row.dexNumber]);
    expect(desc.map((r) => r.dexNumber)).toEqual([6, 25]);
  });
});
