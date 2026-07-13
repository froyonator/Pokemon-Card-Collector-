import type { RarityGroup } from '../types';

// The one built-in group whose membership isn't rarity-based at all -- see
// selectors.ts's availableCardsForDex, which is where 'mega' actually gets
// its special, name-based (isMegaCardName) treatment instead of matching
// against `rarities` like every other group here. Referenced by id rather
// than importing this constant everywhere a group needs to be checked,
// since the persisted `groups`/`activeGroupIds` arrays are plain JSON (see
// store.ts) -- there's no way to persist a function, so the special-casing
// has to live in code, keyed off this id, not on the group object itself.
export const MEGA_GROUP_ID = 'mega';

export const DEFAULT_RARITY_GROUPS: RarityGroup[] = [
  {
    id: 'full-art',
    name: 'Full Art',
    rarities: ['Ultra Rare'],
  },
  {
    id: 'alt-art',
    name: 'Alt Art / Illustration Rare',
    // 'Classic Collection' (Celebrations-set reprints of original Base Set artwork) intentionally
    // excluded: these use the classic small-artwork-window frame, not full-bleed/special art, and
    // TCGdex frequently has no `image` field at all for these cards, so they'd render broken anyway.
    rarities: ['Special illustration rare', 'Illustration rare', 'Full Art Trainer'],
  },
  {
    id: 'rainbow-gold',
    name: 'Rainbow / Gold Secret',
    rarities: ['Secret Rare', 'Hyper rare', 'Mega Hyper Rare', 'Amazing Rare', 'Black White Rare'],
  },
  {
    // Cross-cutting, NAME-based membership -- unlike every other group here,
    // 'rarities' below is never consulted for this one (and is left empty on
    // purpose; the Manage Groups panel's rarity-reassignment UI simply has
    // nothing to move here, which is correct). A card counts as a member
    // whenever isMegaCardName(card.name) is true (see megaDex.ts),
    // REGARDLESS of its rarity or which other group it already belongs to --
    // e.g. a Secret Rare Mega card is in both 'rainbow-gold' AND 'mega' at
    // once. See selectors.ts's availableCardsForDex for the actual
    // membership check, keyed off MEGA_GROUP_ID above, and store.ts for why
    // it's seeded ACTIVE by default (purely additive: toggling it on can
    // only ever surface more cards, never hide ones already visible).
    id: MEGA_GROUP_ID,
    name: 'Mega',
    rarities: [],
  },
  {
    id: 'vintage-special',
    name: 'Vintage Specials',
    // Seeded empty on purpose: genuine vintage specials (e.g. Neo Destiny's "Shining Charizard",
    // EX-era "Charizard ☆" Star cards) are NOT reliably distinguishable from ordinary common/
    // uncommon cards via TCGdex's `rarity` field alone. Both of those cards report
    // `"rarity":"Rare"`, identical to thousands of completely ordinary non-special cards, so
    // matching on "Rare" would flood the picker with false positives. The 'Shiny rare' family
    // ('Shiny rare', 'Shiny rare V', 'Shiny rare VMAX', 'Shiny Ultra Rare') was also removed from
    // here: it maps to "Shiny Vault" cards (Hidden Fates Shiny Vault, Paldean Fates), which use
    // the standard card frame with just an inverted color palette, not full-bleed/special art.
    // Note: the Manage Groups panel lists every rarity seen on a cached card, not just ones
    // already in a group (see getAllCachedRarities in storage/cardCache.ts), so once a card
    // bearing one of these rarities has been fetched at least once, it can be reassigned here
    // like any other rarity. There is no need to edit an exported JSON backup for this.
    rarities: [],
  },
  {
    id: 'not-usable',
    name: 'Not Usable',
    // Seeded empty and NOT included in the store's default activeGroupIds
    // (see store.ts): this is purely a manual bucket for cards the user
    // wants to hide from the Picker's available-card options -- e.g.
    // duplicate reprints, damaged/unwanted variants, or misidentified scans
    // -- via a per-card override or the Picker's multi-select bulk-assign
    // action, not automatic rarity matching.
    rarities: [],
  },
  {
    // Ordinary base-print rarities, plus cards whose source recorded no
    // rarity at all. INACTIVE by default (excluded from store.ts's
    // activeGroupIds seed, like not-usable above): this app's default lens
    // is special/full-art collecting, and flooding the curated views with
    // commons would bury it. It exists so sparse-data languages are
    // viewable AT ALL -- several (both Chinese variants, Thai, Indonesian,
    // Korean) carry ONLY these rarities, so before this group every one of
    // their cards was silently filtered out of every view: reported live,
    // twice, as "I can't see any Chinese cards". One tick of this chip in
    // Filters shows them.
    id: 'standard-prints',
    name: 'Standard prints',
    rarities: ['Common', 'Uncommon', 'Rare', 'Unknown', 'None'],
  },
];

export function fetchRarityList(groups: RarityGroup[] = DEFAULT_RARITY_GROUPS): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const rarity of group.rarities) {
      set.add(rarity);
    }
  }
  return Array.from(set);
}

export function isKnownPocketRarity(rarity: string): boolean {
  const pocketOnly = new Set([
    'One Diamond',
    'Two Diamond',
    'Three Diamond',
    'Four Diamond',
    'One Star',
    'Two Star',
    'Three Star',
    'Crown',
  ]);
  return pocketOnly.has(rarity);
}
