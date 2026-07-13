import { describe, expect, it } from 'vitest';
import {
  MEGA_DEX_BASE,
  MEGA_DEX_ENTRIES,
  MEGA_NAME_PATTERNS,
  cardMatchesMegaEntry,
  cardsForMegaEntry,
  isMegaCardName,
  isMegaDexNumber,
  megaDexEntryByNumber,
  megaDexEntriesForBaseDex,
} from './megaDex';

describe('MEGA_DEX_ENTRIES', () => {
  it('has exactly 96 forms across 87 species, matching the pipeline roster', () => {
    expect(MEGA_DEX_ENTRIES).toHaveLength(96);
    const species = new Set(MEGA_DEX_ENTRIES.map((e) => e.baseDexNumber));
    expect(species.size).toBe(87);
  });

  it('assigns synthetic numbers as MEGA_DEX_BASE + release order, contiguous with no gaps or duplicates', () => {
    const numbers = MEGA_DEX_ENTRIES.map((e) => e.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 96 }, (_, i) => MEGA_DEX_BASE + i + 1));
  });

  it('assigns a contiguous 1..96 order with no gaps or duplicates', () => {
    const orders = MEGA_DEX_ENTRIES.map((e) => e.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 96 }, (_, i) => i + 1));
  });

  it('orders the X&Y wave before the ORAS wave before the newest-game waves (release order)', () => {
    const venusaur = MEGA_DEX_ENTRIES.find((e) => e.slug === 'venusaur-mega'); // X&Y wave
    const beedrill = MEGA_DEX_ENTRIES.find((e) => e.slug === 'beedrill-mega'); // ORAS wave
    const clefable = MEGA_DEX_ENTRIES.find((e) => e.slug === 'clefable-mega'); // newest, base game
    const raichuX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'raichu-mega-x'); // newest, DLC
    expect(venusaur!.order).toBeLessThan(beedrill!.order);
    expect(venusaur!.number).toBeLessThan(beedrill!.number);
    expect(beedrill!.order).toBeLessThan(clefable!.order);
    expect(clefable!.order).toBeLessThan(raichuX!.order);
  });

  it('has unique slugs and synthetic numbers', () => {
    expect(new Set(MEGA_DEX_ENTRIES.map((e) => e.slug)).size).toBe(96);
    expect(new Set(MEGA_DEX_ENTRIES.map((e) => e.number)).size).toBe(96);
  });

  it('sets spriteSlug equal to slug', () => {
    for (const entry of MEGA_DEX_ENTRIES) {
      expect(entry.spriteSlug).toBe(entry.slug);
    }
  });

  it('builds display name as "Mega " + species label', () => {
    const charizardX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-x');
    expect(charizardX?.name).toBe('Mega Charizard X');
  });

  it('includes Charizard X/Y and Mewtwo X/Y as separate entries sharing one base dex', () => {
    expect(megaDexEntriesForBaseDex(6).map((e) => e.slug).sort()).toEqual([
      'charizard-mega-x',
      'charizard-mega-y',
    ]);
    expect(megaDexEntriesForBaseDex(150).map((e) => e.slug).sort()).toEqual([
      'mewtwo-mega-x',
      'mewtwo-mega-y',
    ]);
  });

  it('includes the newest-wave entries: Raichu X/Y, Zygarde, Magearna\'s two colors, Tatsugiri\'s three forms, and the Absol/Garchomp/Lucario Z forms', () => {
    expect(megaDexEntriesForBaseDex(26).map((e) => e.slug).sort()).toEqual(['raichu-mega-x', 'raichu-mega-y']);
    expect(megaDexEntriesForBaseDex(718).map((e) => e.slug)).toEqual(['zygarde-mega']);
    expect(megaDexEntriesForBaseDex(801).map((e) => e.slug).sort()).toEqual(['magearna-mega', 'magearna-original-mega']);
    expect(megaDexEntriesForBaseDex(978).map((e) => e.slug).sort()).toEqual([
      'tatsugiri-curly-mega', 'tatsugiri-droopy-mega', 'tatsugiri-stretchy-mega',
    ]);
    expect(megaDexEntriesForBaseDex(359).map((e) => e.slug).sort()).toEqual(['absol-mega', 'absol-mega-z']);
    expect(megaDexEntriesForBaseDex(445).map((e) => e.slug).sort()).toEqual(['garchomp-mega', 'garchomp-mega-z']);
    expect(megaDexEntriesForBaseDex(448).map((e) => e.slug).sort()).toEqual(['lucario-mega', 'lucario-mega-z']);
  });
});

describe('isMegaDexNumber / megaDexEntryByNumber', () => {
  it('recognizes every synthetic Mega number and no others', () => {
    for (const entry of MEGA_DEX_ENTRIES) {
      expect(isMegaDexNumber(entry.number)).toBe(true);
      expect(megaDexEntryByNumber(entry.number)).toBe(entry);
    }
    expect(isMegaDexNumber(6)).toBe(false);
    expect(isMegaDexNumber(MEGA_DEX_BASE)).toBe(false);
    expect(megaDexEntryByNumber(6)).toBeUndefined();
  });
});

describe('MEGA_NAME_PATTERNS / isMegaCardName', () => {
  // Fixture names pulled directly from public/data/cards/**/*.json (see
  // scripts/carddata/data/mega-audit.md, gitignored) -- real card names,
  // not invented examples.
  const shouldMatch = [
    'M Charizard EX',
    'M Mewtwo EX',
    'M-Ampharos EX',
    'M-Lucario EX',
    'M Manectric-EX',
    'M-Rayquaza-EX',
    'Mega Charizard X ex',
    'Mega Lucario ex',
    'Mega-Meganium-ex',
    'Mega Sableye & Tyranitar GX',
    'Mega-Zobiris & Despotar GX',
    'Mega Charizard X-ex',
    'メガリザードンXex',
    'メガルカリオex',
    // newest-wave modern-mega-ex-gx cards, confirmed live in the card data
    // (no matcher changes were needed for the newest game wave)
    'Mega Zygarde ex',
    'Mega Skarmory ex',
    'Mega Feraligatr ex',
    'Mega Meganium ex',
    'Mega Emboar ex',
    'Mega Greninja ex',
    'Mega Pyroar ex',
    'Mega Floette ex',
    'Mega Dragalge ex',
    'メガジガルデex',
  ];

  const shouldNotMatch = [
    'Meganium',
    'Meganium ex',
    'メガニウム',
    'メガニウム（デルタ種）',
    // Yanmega: a real, unrelated species (dex 469) whose name merely
    // CONTAINS "mega" midword, not at the start -- must not match
    'Yanmega',
    'Yanmega ex',
    'Charizard',
    'Charizard ex',
    'Pikachu ex',
    'Mewtwo & Mew',
    'M. Mime',
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
    expect(MEGA_NAME_PATTERNS.map((p) => p.id)).toEqual([
      'legacy-m-ex',
      'modern-mega-ex-gx',
      'ja-modern-mega',
    ]);
  });
});

describe('cardMatchesMegaEntry / cardsForMegaEntry', () => {
  const charizardX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-x')!;
  const charizardY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-y')!;
  const lucario = MEGA_DEX_ENTRIES.find((e) => e.slug === 'lucario-mega')!;
  const lucarioZ = MEGA_DEX_ENTRIES.find((e) => e.slug === 'lucario-mega-z')!;
  const raichuX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'raichu-mega-x')!;
  const raichuY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'raichu-mega-y')!;

  it('matches the legacy and modern Mega families for a species, rejects a plain non-mega print', () => {
    expect(cardMatchesMegaEntry('M Charizard-EX', charizardX)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Charizard ex', charizardX)).toBe(true);
    expect(cardMatchesMegaEntry('Charizard ex', charizardX)).toBe(false);
  });

  it('splits X/Y variants by their own explicit name token', () => {
    expect(cardMatchesMegaEntry('Mega Charizard X ex', charizardX)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Charizard X ex', charizardY)).toBe(false);
    expect(cardMatchesMegaEntry('Mega Charizard Y ex', charizardY)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Charizard Y ex', charizardX)).toBe(false);
  });

  it('splits the Japanese X/Y variant token fused onto the "ex" suffix', () => {
    expect(cardMatchesMegaEntry('メガリザードンXex', charizardX)).toBe(true);
    expect(cardMatchesMegaEntry('メガリザードンXex', charizardY)).toBe(false);
    expect(cardMatchesMegaEntry('メガリザードンYex', charizardY)).toBe(true);
    expect(cardMatchesMegaEntry('メガリザードンYex', charizardX)).toBe(false);
  });

  it('includes a variant-ambiguous legacy name on BOTH the X and Y tile rather than dropping it', () => {
    expect(cardMatchesMegaEntry('M Charizard EX', charizardX)).toBe(true);
    expect(cardMatchesMegaEntry('M Charizard EX', charizardY)).toBe(true);
  });

  it('never applies the X/Y split to a species with only one Mega form', () => {
    expect(cardMatchesMegaEntry('Mega Lucario ex', lucario)).toBe(true);
    expect(cardMatchesMegaEntry('M-Lucario EX', lucario)).toBe(true);
  });

  it('splits Raichu X/Y variants by their own explicit name token (newest-wave DLC)', () => {
    expect(cardMatchesMegaEntry('Mega Raichu X ex', raichuX)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Raichu X ex', raichuY)).toBe(false);
    expect(cardMatchesMegaEntry('Mega Raichu Y ex', raichuY)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Raichu Y ex', raichuX)).toBe(false);
  });

  it('does NOT split Lucario\'s classic and Z mega forms (no observed "Z" card-naming convention) -- a matching card counts for both', () => {
    expect(cardMatchesMegaEntry('Mega Lucario ex', lucario)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Lucario ex', lucarioZ)).toBe(true);
  });

  it('cardsForMegaEntry filters a card list down to just this entry\'s matches, fixtured from the spec', () => {
    const cards = [
      { name: 'M Charizard-EX' },
      { name: 'Mega Charizard ex' },
      { name: 'Charizard ex' },
    ];
    expect(cardsForMegaEntry(cards, charizardX).map((c) => c.name)).toEqual([
      'M Charizard-EX',
      'Mega Charizard ex',
    ]);
  });
});
