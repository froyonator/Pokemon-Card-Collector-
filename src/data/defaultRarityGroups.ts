import type { RarityGroup } from '../types';

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
    id: 'vintage-special',
    name: 'Vintage Specials',
    // Seeded empty on purpose: genuine vintage specials (e.g. Neo Destiny's "Shining Charizard",
    // EX-era "Charizard ☆" Star cards) are NOT reliably distinguishable from ordinary common/
    // uncommon cards via TCGdex's `rarity` field alone — both of those cards report
    // `"rarity":"Rare"`, identical to thousands of completely ordinary non-special cards, so
    // matching on "Rare" would flood the picker with false positives. The 'Shiny rare' family
    // ('Shiny rare', 'Shiny rare V', 'Shiny rare VMAX', 'Shiny Ultra Rare') was also removed from
    // here: it maps to "Shiny Vault" cards (Hidden Fates Shiny Vault, Paldean Fates), which use
    // the standard card frame with just an inverted color palette, not full-bleed/special art.
    // Users can still add rarities to this group manually via the Manage Groups panel.
    rarities: [],
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
