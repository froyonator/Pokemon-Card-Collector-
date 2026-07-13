import { describe, expect, it } from 'vitest';
import {
  deriveCardEra,
  getCardFoilEffect,
  getFoilMaskSpec,
  getFoilTier,
} from './cardFoilMask';

describe('getFoilTier', () => {
  it('classifies Common and Uncommon as none -- no foil layer at all', () => {
    expect(getFoilTier('Common')).toBe('none');
    expect(getFoilTier('Uncommon')).toBe('none');
  });

  it('classifies other plain rarities (and anything unrecognized) as a faint sheen fallback', () => {
    expect(getFoilTier('Rare')).toBe('sheen');
    expect(getFoilTier('None')).toBe('sheen');
    expect(getFoilTier('Promo')).toBe('sheen');
    expect(getFoilTier('Classic Collection')).toBe('sheen');
    expect(getFoilTier('Some Future Rarity Nobody Has Seen Yet')).toBe('sheen');
    expect(getFoilTier('')).toBe('sheen');
  });

  it('classifies the classic-holo family as holo', () => {
    expect(getFoilTier('Rare Holo')).toBe('holo');
    expect(getFoilTier('Common Holo')).toBe('holo');
    expect(getFoilTier('Uncommon Holo')).toBe('holo');
    expect(getFoilTier('Holo Rare')).toBe('holo');
    expect(getFoilTier('Holo Rare V')).toBe('holo');
    expect(getFoilTier('Holo Rare VMAX')).toBe('holo');
    expect(getFoilTier('Holo Rare VSTAR')).toBe('holo');
    expect(getFoilTier('Rare Holo LV.X')).toBe('holo');
    expect(getFoilTier('Rare PRIME')).toBe('holo');
    expect(getFoilTier('Rare VMAX')).toBe('holo');
    expect(getFoilTier('Rare VSTAR')).toBe('holo');
    expect(getFoilTier('Radiant Rare')).toBe('holo');
    expect(getFoilTier('Shiny rare')).toBe('holo');
    expect(getFoilTier('Shiny rare V')).toBe('holo');
    expect(getFoilTier('Shiny rare VMAX')).toBe('holo');
  });

  it('normalizes casing so both "Double Rare" and "Double rare" land in the same tier', () => {
    expect(getFoilTier('Double Rare')).toBe('holo');
    expect(getFoilTier('Double rare')).toBe('holo');
  });

  it('classifies the full-art-adjacent tiers as ultra', () => {
    expect(getFoilTier('Hyper rare')).toBe('ultra');
    expect(getFoilTier('Illustration rare')).toBe('ultra');
    expect(getFoilTier('Special illustration rare')).toBe('ultra');
    expect(getFoilTier('Mega Hyper Rare')).toBe('ultra');
    expect(getFoilTier('Secret Rare')).toBe('ultra');
    expect(getFoilTier('Shiny Ultra Rare')).toBe('ultra');
    expect(getFoilTier('Ultra Rare')).toBe('ultra');
    expect(getFoilTier('Ultra-Rare Rare')).toBe('ultra');
  });
});

describe('deriveCardEra', () => {
  it('buckets vintage WotC/Neo/e-Card/EX sets as classic', () => {
    expect(deriveCardEra('base1')).toBe('classic');
    expect(deriveCardEra('base5')).toBe('classic');
    expect(deriveCardEra('gym1')).toBe('classic');
    expect(deriveCardEra('neo1')).toBe('classic');
    expect(deriveCardEra('ecard1')).toBe('classic');
    expect(deriveCardEra('ex1')).toBe('classic');
    expect(deriveCardEra('ex16')).toBe('classic');
    expect(deriveCardEra('ex5.5')).toBe('classic');
    expect(deriveCardEra('basep')).toBe('classic');
  });

  it('buckets DP/Platinum/HGSS/BW/XY sets as transitional', () => {
    expect(deriveCardEra('dp1')).toBe('transitional');
    expect(deriveCardEra('pl1')).toBe('transitional');
    expect(deriveCardEra('hgss1')).toBe('transitional');
    expect(deriveCardEra('bw1')).toBe('transitional');
    expect(deriveCardEra('xy1')).toBe('transitional');
    expect(deriveCardEra('xya')).toBe('transitional');
    expect(deriveCardEra('dpp')).toBe('transitional');
    expect(deriveCardEra('hgssp')).toBe('transitional');
    expect(deriveCardEra('bwp')).toBe('transitional');
  });

  it('buckets SM/SWSH/SV sets as modern', () => {
    expect(deriveCardEra('sm1')).toBe('modern');
    expect(deriveCardEra('swsh1')).toBe('modern');
    expect(deriveCardEra('sv01')).toBe('modern');
    expect(deriveCardEra('smp')).toBe('modern');
    expect(deriveCardEra('swshp')).toBe('modern');
    expect(deriveCardEra('svp')).toBe('modern');
  });

  it('reads the era off the literal suffix on dated McDonald\'s-style ids', () => {
    expect(deriveCardEra('2014xy')).toBe('transitional');
    expect(deriveCardEra('2017sm')).toBe('modern');
    expect(deriveCardEra('2021swsh')).toBe('modern');
    expect(deriveCardEra('2023sv')).toBe('modern');
  });

  it('reads the era off the middle token on theme-deck ids, including the hs shorthand for HGSS', () => {
    expect(deriveCardEra('tk-ex-m')).toBe('classic');
    expect(deriveCardEra('tk-dp-l')).toBe('transitional');
    expect(deriveCardEra('tk-hs-g')).toBe('transitional');
    expect(deriveCardEra('tk-xy-n')).toBe('transitional');
    expect(deriveCardEra('tk-sm-r')).toBe('modern');
  });

  it('is case-insensitive', () => {
    expect(deriveCardEra('BASE1')).toBe('classic');
    expect(deriveCardEra('SWSH1')).toBe('modern');
  });

  it('defaults unrecognized set ids to modern', () => {
    expect(deriveCardEra('some-future-set')).toBe('modern');
    expect(deriveCardEra('')).toBe('modern');
  });
});

describe('getFoilMaskSpec', () => {
  it('gives the sheen tier a full-surface (unmasked) spec', () => {
    expect(getFoilMaskSpec('sheen', 'classic')).toEqual({ shape: 'full' });
  });

  it('gives the ultra tier a full-surface (unmasked) spec, since real full-art foil runs edge to edge', () => {
    expect(getFoilMaskSpec('ultra', 'modern')).toEqual({ shape: 'full' });
  });

  it('masks the holo tier to the illustration window for its era', () => {
    expect(getFoilMaskSpec('holo', 'classic')).toEqual({
      shape: 'window',
      inset: { top: 10, right: 6, bottom: 42, left: 6 },
    });
    expect(getFoilMaskSpec('holo', 'transitional')).toEqual({
      shape: 'window',
      inset: { top: 9, right: 5, bottom: 40, left: 5 },
    });
    expect(getFoilMaskSpec('holo', 'modern')).toEqual({
      shape: 'window',
      inset: { top: 8, right: 4, bottom: 38, left: 4 },
    });
  });
});

describe('getCardFoilEffect', () => {
  it('combines tier + era into one effect spec for a classic-era holo card', () => {
    expect(getCardFoilEffect('Rare Holo', 'base1')).toEqual({
      tier: 'holo',
      mask: { shape: 'window', inset: { top: 10, right: 6, bottom: 42, left: 6 } },
    });
  });

  it('combines tier + era into one effect spec for a modern ultra-tier card', () => {
    expect(getCardFoilEffect('Special illustration rare', 'sv03.5')).toEqual({
      tier: 'ultra',
      mask: { shape: 'full' },
    });
  });

  it('combines tier + era into one effect spec for a plain common card (no foil layer)', () => {
    expect(getCardFoilEffect('Common', 'swsh1')).toEqual({
      tier: 'none',
      mask: { shape: 'full' },
    });
  });

  it('combines tier + era into one effect spec for an unrecognized rarity (faint sheen fallback)', () => {
    expect(getCardFoilEffect('Some New Rarity', 'swsh1')).toEqual({
      tier: 'sheen',
      mask: { shape: 'full' },
    });
  });
});
