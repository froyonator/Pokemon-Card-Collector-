// scripts/carddata/src/data/megaDex.test.ts
import { describe, expect, it } from 'vitest';
import {
  MEGA_DEX,
  MEGA_NAME_PATTERNS,
  VARIANT_OVERRIDES,
  isMegaCardName,
  megaFormBySlug,
  megaFormsForDex,
} from './megaDex';

describe('MEGA_DEX', () => {
  it('has exactly 96 forms, matching the source wiki article\'s total', () => {
    expect(MEGA_DEX).toHaveLength(96);
  });

  it('has unique slugs', () => {
    const slugs = new Set(MEGA_DEX.map((f) => f.slug));
    expect(slugs.size).toBe(MEGA_DEX.length);
  });

  it('assigns a contiguous 1..96 order with no gaps or duplicates', () => {
    const orders = MEGA_DEX.map((f) => f.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 96 }, (_, i) => i + 1));
  });

  it('keeps the original 48 X&Y/ORAS forms unchanged and first', () => {
    expect(MEGA_DEX.slice(0, 48).map((f) => f.slug)).toEqual([
      'venusaur-mega', 'charizard-mega-x', 'charizard-mega-y', 'blastoise-mega', 'alakazam-mega',
      'gengar-mega', 'kangaskhan-mega', 'pinsir-mega', 'gyarados-mega', 'aerodactyl-mega',
      'mewtwo-mega-x', 'mewtwo-mega-y', 'ampharos-mega', 'steelix-mega', 'scizor-mega',
      'heracross-mega', 'houndoom-mega', 'tyranitar-mega', 'blaziken-mega', 'gardevoir-mega',
      'mawile-mega', 'aggron-mega', 'medicham-mega', 'manectric-mega', 'banette-mega',
      'absol-mega', 'latias-mega', 'latios-mega', 'garchomp-mega', 'lucario-mega',
      'abomasnow-mega', 'diancie-mega',
      'beedrill-mega', 'pidgeot-mega', 'slowbro-mega', 'sceptile-mega', 'swampert-mega',
      'sableye-mega', 'sharpedo-mega', 'camerupt-mega', 'altaria-mega', 'glalie-mega',
      'salamence-mega', 'metagross-mega', 'rayquaza-mega', 'lopunny-mega', 'gallade-mega',
      'audino-mega',
    ]);
    expect(MEGA_DEX.slice(0, 48).every((f) => f.order <= 48)).toBe(true);
  });

  it('includes Charizard X/Y and Mewtwo X/Y as separate forms sharing one base dex', () => {
    expect(megaFormsForDex(6).map((f) => f.slug).sort()).toEqual(['charizard-mega-x', 'charizard-mega-y']);
    expect(megaFormsForDex(150).map((f) => f.slug).sort()).toEqual(['mewtwo-mega-x', 'mewtwo-mega-y']);
  });

  it('gives Absol, Garchomp, and Lucario a second (Z) form alongside their classic form', () => {
    expect(megaFormsForDex(359).map((f) => f.slug).sort()).toEqual(['absol-mega', 'absol-mega-z']);
    expect(megaFormsForDex(445).map((f) => f.slug).sort()).toEqual(['garchomp-mega', 'garchomp-mega-z']);
    expect(megaFormsForDex(448).map((f) => f.slug).sort()).toEqual(['lucario-mega', 'lucario-mega-z']);
  });

  it('includes the newest-wave forms: Raichu X/Y, Zygarde, Magearna\'s two colors, and Tatsugiri\'s three forms', () => {
    expect(megaFormsForDex(26).map((f) => f.slug).sort()).toEqual(['raichu-mega-x', 'raichu-mega-y']);
    expect(megaFormBySlug('zygarde-mega')).toMatchObject({ baseDex: 718, displayName: 'Mega Zygarde' });
    expect(megaFormsForDex(801).map((f) => f.slug).sort()).toEqual(['magearna-mega', 'magearna-original-mega']);
    expect(megaFormsForDex(978).map((f) => f.slug).sort()).toEqual([
      'tatsugiri-curly-mega', 'tatsugiri-droopy-mega', 'tatsugiri-stretchy-mega',
    ]);
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

  it('orders the X&Y wave before the ORAS wave, and both before the newest-game waves', () => {
    const beedrill = megaFormBySlug('beedrill-mega'); // ORAS wave
    const venusaur = megaFormBySlug('venusaur-mega'); // X&Y wave
    const clefable = megaFormBySlug('clefable-mega'); // newest-wave base game
    const raichuX = megaFormBySlug('raichu-mega-x'); // newest-wave DLC
    expect(venusaur!.order).toBeLessThan(beedrill!.order);
    expect(beedrill!.order).toBeLessThan(clefable!.order);
    expect(clefable!.order).toBeLessThan(raichuX!.order);
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
    // newest-wave modern-mega-ex-gx cards, confirmed live in
    // public/data/cards/en/gen*.json (Zygarde, Skarmory, Feraligatr,
    // Meganium, Emboar, Greninja, Pyroar, Floette, Dragalge -- proof the
    // existing pattern already covers the newest wave with no changes)
    'Mega Zygarde ex',
    'Mega Skarmory ex',
    'Mega Feraligatr ex',
    'Mega Meganium ex',
    'Mega Emboar ex',
    'Mega Greninja ex',
    'Mega Pyroar ex',
    'Mega Floette ex',
    'Mega Dragalge ex',
    // newest-wave ja-modern-mega card, confirmed live in
    // public/data/cards/ja/gen*.json
    'メガジガルデex',
  ];

  const shouldNotMatch = [
    // species whose romanized/katakana name coincidentally starts with
    // "Mega" but is not a Mega-tagged card
    'Meganium',
    'Meganium ex',
    'メガニウム',
    'メガニウム（デルタ種）',
    // Yanmega: a real, unrelated species (dex 469) whose name merely
    // CONTAINS "mega" midword, not at the start -- must not match either
    // "Mega"-prefixed pattern (see the guard comment in megaDex.ts)
    'Yanmega',
    'Yanmega ex',
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

describe('VARIANT_OVERRIDES (data mirror of the app-side table)', () => {
  it('resolves the confirmed BREAKthrough Mewtwo prints (the wiki source states the ndex field and Origin prose directly)', () => {
    expect(VARIANT_OVERRIDES['XY8::63']).toBe('X');
    expect(VARIANT_OVERRIDES['XY8::64']).toBe('Y');
  });

  it('resolves the confirmed Charizard prints across Generations/Flashfire/Evolutions', () => {
    expect(VARIANT_OVERRIDES['G1::12']).toBe('X');
    expect(VARIANT_OVERRIDES['XY2::13']).toBe('Y');
    expect(VARIANT_OVERRIDES['XY2::69']).toBe('X');
  });

  it('has no Raichu (dex 26) entries -- no printed Mega Raichu cards exist in the data yet', () => {
    const raichuLikeKeys = Object.keys(VARIANT_OVERRIDES).filter((k) => k.startsWith('RAICHU'));
    expect(raichuLikeKeys).toHaveLength(0);
  });
});
