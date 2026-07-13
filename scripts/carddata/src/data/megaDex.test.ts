// scripts/carddata/src/data/megaDex.test.ts
import { describe, expect, it } from 'vitest';
import { MEGA_DEX, MEGA_NAME_PATTERNS, isMegaCardName, megaFormBySlug, megaFormsForDex } from './megaDex';

describe('MEGA_DEX', () => {
  it('has exactly 48 forms across 46 species', () => {
    expect(MEGA_DEX).toHaveLength(48);
    const species = new Set(MEGA_DEX.map((f) => f.baseDex));
    expect(species.size).toBe(46);
  });

  it('has unique slugs', () => {
    const slugs = new Set(MEGA_DEX.map((f) => f.slug));
    expect(slugs.size).toBe(MEGA_DEX.length);
  });

  it('assigns a contiguous 1..48 order with no gaps or duplicates', () => {
    const orders = MEGA_DEX.map((f) => f.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
  });

  it('includes Charizard X/Y and Mewtwo X/Y as separate forms sharing one base dex', () => {
    expect(megaFormsForDex(6).map((f) => f.slug).sort()).toEqual(['charizard-mega-x', 'charizard-mega-y']);
    expect(megaFormsForDex(150).map((f) => f.slug).sort()).toEqual(['mewtwo-mega-x', 'mewtwo-mega-y']);
  });

  it('builds displayName as "Mega " + speciesLabel', () => {
    for (const form of MEGA_DEX) {
      expect(form.displayName).toBe(`Mega ${form.speciesLabel}`);
    }
  });

  it('looks up a known slug', () => {
    expect(megaFormBySlug('lucario-mega')).toMatchObject({ baseDex: 448, displayName: 'Mega Lucario' });
    expect(megaFormBySlug('does-not-exist')).toBeUndefined();
  });

  it('orders the X&Y wave before the ORAS wave', () => {
    const beedrill = megaFormBySlug('beedrill-mega'); // ORAS wave
    const venusaur = megaFormBySlug('venusaur-mega'); // X&Y wave
    expect(venusaur!.order).toBeLessThan(beedrill!.order);
  });
});

describe('MEGA_NAME_PATTERNS / isMegaCardName', () => {
  // Fixture names pulled directly from public/data/cards/**/*.json during
  // the mega-audit.md audit -- real card names, not invented examples.
  const shouldMatch = [
    // legacy-m-ex (English + European hyphen/space variants)
    'M Charizard EX',
    'M Mewtwo EX',
    'M-Ampharos EX',
    'M-Lucario EX',
    'M Manectric-EX',
    'M-Rayquaza-EX',
    // modern-mega-ex-gx
    'Mega Charizard X ex',
    'Mega Lucario ex',
    'Mega-Meganium-ex',
    'Mega Sableye & Tyranitar GX',
    'Mega-Zobiris & Despotar GX',
    'Mega Charizard X-ex',
    // ja-modern-mega
    'メガリザードンXex',
    'メガルカリオex',
  ];

  const shouldNotMatch = [
    // species whose romanized/katakana name coincidentally starts with
    // "Mega" but is not a Mega-tagged card
    'Meganium',
    'Meganium ex',
    'メガニウム',
    'メガニウム（デルタ種）',
    // plain cards, no mega tag
    'Charizard',
    'Pikachu ex',
    'Mewtwo & Mew',
    'M. Mime', // not a real card name, but guards the "M" + separator rule
  ];

  for (const name of shouldMatch) {
    it(`matches "${name}"`, () => {
      expect(isMegaCardName(name)).toBe(true);
    });
  }

  for (const name of shouldNotMatch) {
    it(`does not match "${name}"`, () => {
      expect(isMegaCardName(name)).toBe(false);
    });
  }

  it('exposes one regex per documented pattern id', () => {
    const ids = MEGA_NAME_PATTERNS.map((p) => p.id);
    expect(ids).toEqual(['legacy-m-ex', 'modern-mega-ex-gx', 'ja-modern-mega']);
  });
});
