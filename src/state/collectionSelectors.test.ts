import { beforeEach, describe, expect, it } from 'vitest';
import { buildCollectionRows, buildWishlistRows, sortRows } from './collectionSelectors';
import { setCachedCards } from '../storage/cardCache';
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
});

describe('buildCollectionRows', () => {
  it('joins owned records with card data and name', () => {
    const owned: Record<number, OwnedRecord> = {
      6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
    };
    const rows = buildCollectionRows('en', owned);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dexNumber: 6,
      pokemonName: 'Charizard',
      condition: 'Near Mint',
    });
    expect(rows[0].card?.id).toBe('sv03.5-199');
  });

  it('returns an empty array for empty owned/wishlist input', () => {
    expect(buildCollectionRows('en', {})).toEqual([]);
    expect(buildWishlistRows('en', {})).toEqual([]);
  });

  it('leaves card undefined when the cardId has no cache entry', () => {
    const owned: Record<number, OwnedRecord> = {
      25: { dexNumber: 25, cardId: 'missing-card-id', condition: 'Mint', addedAt: '' },
    };
    const rows = buildCollectionRows('en', owned);
    expect(rows).toHaveLength(1);
    expect(rows[0].card).toBeUndefined();
  });
});

describe('buildWishlistRows', () => {
  it('joins wishlist records with card data', () => {
    const wishlist: Record<number, WishlistRecord> = {
      6: { dexNumber: 6, cardId: 'sv03.5-199', addedAt: '' },
    };
    const rows = buildWishlistRows('en', wishlist);
    expect(rows).toHaveLength(1);
    expect(rows[0].pokemonName).toBe('Charizard');
    expect(rows[0].card?.id).toBe('sv03.5-199');
  });
});

describe('sortRows', () => {
  const rows = [
    { dexNumber: 25, pokemonName: 'Pikachu' },
    { dexNumber: 6, pokemonName: 'Charizard' },
  ];

  it('sorts ascending by dex number', () => {
    const sorted = sortRows(rows, 'dexNumber', 'asc');
    expect(sorted.map((r) => r.dexNumber)).toEqual([6, 25]);
  });

  it('sorts descending by dex number', () => {
    const sorted = sortRows(rows, 'dexNumber', 'desc');
    expect(sorted.map((r) => r.dexNumber)).toEqual([25, 6]);
  });

  it('sorts alphabetically by name', () => {
    const sorted = sortRows(rows, 'name', 'asc');
    expect(sorted.map((r) => r.pokemonName)).toEqual(['Charizard', 'Pikachu']);
  });
});
