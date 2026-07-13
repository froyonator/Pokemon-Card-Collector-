import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RARITY_GROUPS,
  MEGA_GROUP_ID,
  fetchRarityList,
  isKnownPocketRarity,
} from './defaultRarityGroups';

describe('DEFAULT_RARITY_GROUPS', () => {
  it('has 7 groups with unique ids', () => {
    expect(DEFAULT_RARITY_GROUPS).toHaveLength(7);
    const ids = new Set(DEFAULT_RARITY_GROUPS.map((g) => g.id));
    expect(ids.size).toBe(7);
  });

  it('seeds the Mega group with an empty rarities list (name-based membership, not rarity-based)', () => {
    const group = DEFAULT_RARITY_GROUPS.find((g) => g.id === MEGA_GROUP_ID);
    expect(group?.name).toBe('Mega');
    expect(group?.rarities).toEqual([]);
  });

  it('seeds standard-prints with the base-print rarities plus the two "source recorded nothing" values', () => {
    const group = DEFAULT_RARITY_GROUPS.find((g) => g.id === 'standard-prints');
    expect(group?.rarities).toEqual(['Common', 'Uncommon', 'Rare', 'Unknown', 'None']);
  });

  it('seeds not-usable with an empty rarities list', () => {
    const group = DEFAULT_RARITY_GROUPS.find((g) => g.id === 'not-usable');
    expect(group?.rarities).toEqual([]);
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
