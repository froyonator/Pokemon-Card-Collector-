import { describe, expect, it } from 'vitest';
import { DEFAULT_RARITY_GROUPS, fetchRarityList, isKnownPocketRarity } from './defaultRarityGroups';

describe('DEFAULT_RARITY_GROUPS', () => {
  it('has 4 groups with unique ids', () => {
    expect(DEFAULT_RARITY_GROUPS).toHaveLength(4);
    const ids = new Set(DEFAULT_RARITY_GROUPS.map((g) => g.id));
    expect(ids.size).toBe(4);
  });

  it('has no duplicate rarity across groups', () => {
    const all = DEFAULT_RARITY_GROUPS.flatMap((g) => g.rarities);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('fetchRarityList', () => {
  it('flattens all group rarities into one deduplicated list', () => {
    const list = fetchRarityList(DEFAULT_RARITY_GROUPS);
    expect(list).toContain('Ultra Rare');
    expect(list).toContain('Special illustration rare');
    expect(list.length).toBe(new Set(list).size);
  });
});

describe('isKnownPocketRarity', () => {
  it('flags Pocket-only rarity tiers', () => {
    expect(isKnownPocketRarity('Crown')).toBe(true);
    expect(isKnownPocketRarity('Two Diamond')).toBe(true);
  });

  it('does not flag physical rarity tiers', () => {
    expect(isKnownPocketRarity('Ultra Rare')).toBe(false);
    expect(isKnownPocketRarity('Shiny rare')).toBe(false);
  });
});
