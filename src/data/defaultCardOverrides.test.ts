import { describe, expect, it } from 'vitest';
import { DEFAULT_CARD_OVERRIDES } from './defaultCardOverrides';
import { DEFAULT_RARITY_GROUPS } from './defaultRarityGroups';

describe('DEFAULT_CARD_OVERRIDES', () => {
  it('only points at group ids that actually exist in the default rarity groups', () => {
    const validIds = new Set(DEFAULT_RARITY_GROUPS.map((g) => g.id));
    for (const groupId of Object.values(DEFAULT_CARD_OVERRIDES)) {
      expect(validIds.has(groupId)).toBe(true);
    }
  });

  it('classifies the Charmander Obsidian Flames ETB promo as full art', () => {
    expect(DEFAULT_CARD_OVERRIDES['svp-044']).toBe('full-art');
  });
});
