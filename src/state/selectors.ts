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

export function availableCardsForDex(
  allCards: CardRecord[],
  activeSet: Set<string>,
  overrides: Record<string, string> = {},
  activeGroupIds: string[] = []
): CardRecord[] {
  return allCards.filter((card) => {
    const overrideGroupId = overrides[card.id];
    if (overrideGroupId !== undefined) {
      return activeGroupIds.includes(overrideGroupId);
    }
    return activeSet.has(card.rarity);
  });
}

export type TileState = 'available' | 'owned' | 'unavailable' | 'loading';

export function computeTileState(
  hasOwned: boolean,
  availableCount: number,
  isLoading: boolean
): TileState {
  // hasOwned is checked before isLoading deliberately: whether the user owns
  // a card for this Pokemon comes from the app's own `owned` store record,
  // available synchronously regardless of whether this dex number's TCGdex
  // card-print data has finished loading, so an owned Pokemon should never
  // show a loading spinner over its gold "owned" tile.
  if (hasOwned) return 'owned';
  if (isLoading) return 'loading';
  if (availableCount === 0) return 'unavailable';
  return 'available';
}
