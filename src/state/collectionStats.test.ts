import { beforeEach, describe, expect, it } from 'vitest';
import { computeCollectionStats } from './collectionStats';
import { setCachedCards } from '../storage/cardCache';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { CardRecord } from '../types';

const fullArtCard: CardRecord = {
  id: 'sv1-1',
  name: 'Bulbasaur',
  dexNumber: 1,
  setId: 'sv1',
  setName: 'Test Set',
  localId: '1',
  rarity: 'Ultra Rare',
  imageBase: 'https://x/1',
  language: 'en',
};

beforeEach(() => {
  localStorage.clear();
});

describe('computeCollectionStats', () => {
  it('counts every Pokemon in the selected generations as the total, regardless of ownership or availability', () => {
    const stats = computeCollectionStats([1], {}, 'en', DEFAULT_RARITY_GROUPS, ['full-art'], {});
    expect(stats.totalCount).toBe(151);
  });

  it('counts an owned Pokemon toward both ownedCount and possibleCount even if it has no cached cards at all', () => {
    const owned = {
      1: { dexNumber: 1, cardId: 'sv1-1', condition: 'Near Mint' as const, addedAt: '' },
    };
    const stats = computeCollectionStats([1], owned, 'en', DEFAULT_RARITY_GROUPS, ['full-art'], {});
    expect(stats.ownedCount).toBe(1);
    expect(stats.possibleCount).toBeGreaterThanOrEqual(1);
  });

  it('counts a not-yet-owned Pokemon toward possibleCount when it has a card matching an active rarity group', () => {
    setCachedCards('en', 1, [fullArtCard]);
    const stats = computeCollectionStats([1], {}, 'en', DEFAULT_RARITY_GROUPS, ['full-art'], {});
    expect(stats.ownedCount).toBe(0);
    expect(stats.possibleCount).toBe(1);
    expect(stats.missingCount).toBe(1);
  });

  it('does not count a not-yet-owned Pokemon toward possibleCount when its only cached card is outside the active rarity groups', () => {
    setCachedCards('en', 1, [fullArtCard]);
    const stats = computeCollectionStats([1], {}, 'en', DEFAULT_RARITY_GROUPS, ['alt-art'], {});
    expect(stats.possibleCount).toBe(0);
    expect(stats.missingCount).toBe(0);
  });

  it('missingCount is possibleCount minus ownedCount, not totalCount minus ownedCount', () => {
    setCachedCards('en', 1, [fullArtCard]);
    const owned = { 4: { dexNumber: 4, cardId: 'x', condition: 'Near Mint' as const, addedAt: '' } };
    // dex 4 owned (counts toward both), dex 1 has an active-group card but
    // isn't owned (possible but missing), every other dex 1-151 has no
    // cached cards at all (not possible, shouldn't count toward missing).
    const stats = computeCollectionStats([1], owned, 'en', DEFAULT_RARITY_GROUPS, ['full-art'], {});
    expect(stats.ownedCount).toBe(1);
    expect(stats.possibleCount).toBe(2);
    expect(stats.missingCount).toBe(1);
  });
});
