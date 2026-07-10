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

  it('seeds vintage-special with an empty rarities list', () => {
    const group = DEFAULT_RARITY_GROUPS.find((g) => g.id === 'vintage-special');
    expect(group?.rarities).toEqual([]);
  });

  it('never treats Shiny Vault rarities as full/special art by default', () => {
    const list = fetchRarityList(DEFAULT_RARITY_GROUPS);
    expect(list).not.toContain('Shiny rare');
    expect(list).not.toContain('Shiny rare V');
    expect(list).not.toContain('Shiny rare VMAX');
    expect(list).not.toContain('Shiny Ultra Rare');
  });

  it('does not treat Classic Collection reprints as alt art', () => {
    const altArt = DEFAULT_RARITY_GROUPS.find((g) => g.id === 'alt-art');
    expect(altArt?.rarities).not.toContain('Classic Collection');
    expect(fetchRarityList(DEFAULT_RARITY_GROUPS)).not.toContain('Classic Collection');
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
