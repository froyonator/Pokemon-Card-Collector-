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
    rarities: [
      'Special illustration rare',
      'Illustration rare',
      'Classic Collection',
      'Full Art Trainer',
    ],
  },
  {
    id: 'rainbow-gold',
    name: 'Rainbow / Gold Secret',
    rarities: ['Secret Rare', 'Hyper rare', 'Mega Hyper Rare', 'Amazing Rare', 'Black White Rare'],
  },
  {
    id: 'vintage-special',
    name: 'Vintage Specials',
    rarities: ['Shiny rare', 'Shiny rare V', 'Shiny rare VMAX', 'Shiny Ultra Rare'],
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
