import { entriesForGenerations } from '../data/generations';
import { activeRarities, availableCardsForDex } from './selectors';
import { getCachedCards } from '../storage/cardCache';
import type { OwnedRecord, RarityGroup } from '../types';

export interface CollectionStatsData {
  totalCount: number;
  ownedCount: number;
  possibleCount: number;
  missingCount: number;
}

// Pure so the counting logic can be unit-tested independently of rendering
// -- see collectionStats.test.ts. Reads the card cache directly (like
// DexGrid's own availableCardsForDex usage) rather than taking pre-resolved
// card lists, since the sidebar summary this feeds doesn't otherwise need
// per-dex card data threaded into it.
export function computeCollectionStats(
  selectedGenerations: number[],
  owned: Record<number, OwnedRecord>,
  language: string,
  groups: RarityGroup[],
  activeGroupIds: string[],
  cardOverrides: Record<string, string>
): CollectionStatsData {
  const entries = entriesForGenerations(selectedGenerations);
  const activeSet = activeRarities(groups, activeGroupIds);
  let ownedCount = 0;
  // "Possible to own" = a Pokemon that either already has an owned card, or
  // has at least one card matching the currently active rarity groups --
  // i.e. everything EXCEPT a Pokemon with zero special/rare cards released
  // for it at all (an "unavailable" tile). This is deliberately a different,
  // usually smaller denominator than totalCount: totalCount/ownedCount
  // tracks raw dex completion, while possibleCount is what's actually
  // achievable to own right now given the active rarity-group filter.
  let possibleCount = 0;

  for (const entry of entries) {
    const isOwned = Boolean(owned[entry.number]);
    if (isOwned) {
      ownedCount++;
      possibleCount++;
      continue;
    }
    const cards = getCachedCards(language, entry.number) ?? [];
    const available = availableCardsForDex(cards, activeSet, cardOverrides, activeGroupIds);
    if (available.length > 0) possibleCount++;
  }

  return {
    totalCount: entries.length,
    ownedCount,
    possibleCount,
    missingCount: possibleCount - ownedCount,
  };
}
