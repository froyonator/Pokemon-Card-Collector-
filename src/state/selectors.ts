import type { CardRecord, RarityGroup } from '../types';

export function activeRarities(groups: RarityGroup[], activeGroupIds: string[]): Set<string> {
  const set = new Set<string>();
  for (const group of groups) {
    if (activeGroupIds.includes(group.id)) {
      for (const rarity of group.rarities) {
        set.add(rarity);
      }
    }
  }
  return set;
}

export function availableCardsForDex(allCards: CardRecord[], activeSet: Set<string>): CardRecord[] {
  return allCards.filter((card) => activeSet.has(card.rarity));
}

export type TileState = 'available' | 'owned' | 'unavailable';

export function computeTileState(hasOwned: boolean, availableCount: number): TileState {
  if (hasOwned) return 'owned';
  if (availableCount === 0) return 'unavailable';
  return 'available';
}
