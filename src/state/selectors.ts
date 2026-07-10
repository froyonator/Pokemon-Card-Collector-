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

// Trainer Gallery is a dedicated alt-art insert subset, distinct from a
// set's main card line, confirmed by checking TCGdex's entire set catalog:
// exactly three set ids end in "tg", and all three are literally named
// "<Set> Trainer Gallery" (swsh9.5tg, swsh11.5tg, swsh12.5tg). Its cards
// commonly carry the generic "Holo Rare" rarity, shared with hundreds of
// ordinary non-special cards (confirmed via a live rarity=eq:Holo Rare
// query), so unlike this problem's other instances (Promo, vintage Rare),
// rarity alone can't identify them -- but the set id reliably can, since
// Trainer Gallery is a genuine TCG-design-level alternate-art subset, not a
// mixed bag requiring per-card visual verification.
export function isTrainerGalleryCard(setId: string): boolean {
  return setId.endsWith('tg');
}

export function availableCardsForDex(
  allCards: CardRecord[],
  activeSet: Set<string>,
  overrides: Record<string, string> = {},
  activeGroupIds: string[] = []
): CardRecord[] {
  return allCards.filter((card) => {
    // Precedence: an explicit per-card override (user-assigned or seeded via
    // DEFAULT_CARD_OVERRIDES) always wins. Failing that, automatic Trainer
    // Gallery detection assigns the card into 'alt-art' as if it had been
    // overridden there. Failing that, fall back to raw rarity matching.
    const overrideGroupId =
      overrides[card.id] ?? (isTrainerGalleryCard(card.setId) ? 'alt-art' : undefined);
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
