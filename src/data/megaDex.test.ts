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

  it('assigns a variant-ambiguous Lucario card to the classic entry only, not the Z entry (no observed "Z" card-naming convention yet)', () => {
    expect(cardMatchesMegaEntry('Mega Lucario ex', lucario)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Lucario ex', lucarioZ)).toBe(false);
    expect(cardMatchesMegaEntry('M-Lucario EX', lucario)).toBe(true);
    expect(cardMatchesMegaEntry('M-Lucario EX', lucarioZ)).toBe(false);
  });

  it('would assign an explicit Z-token Lucario card to the Z entry only, not the classic one, if one ever appears', () => {
    expect(cardMatchesMegaEntry('Mega Lucario Z ex', lucarioZ)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Lucario Z ex', lucario)).toBe(false);
  });

  it('applies the same classic-vs-Z split to Garchomp and Absol', () => {
    const garchomp = MEGA_DEX_ENTRIES.find((e) => e.slug === 'garchomp-mega')!;
    const garchompZ = MEGA_DEX_ENTRIES.find((e) => e.slug === 'garchomp-mega-z')!;
    const absol = MEGA_DEX_ENTRIES.find((e) => e.slug === 'absol-mega')!;
    const absolZ = MEGA_DEX_ENTRIES.find((e) => e.slug === 'absol-mega-z')!;
    expect(cardMatchesMegaEntry('M Garchomp-EX', garchomp)).toBe(true);
    expect(cardMatchesMegaEntry('M Garchomp-EX', garchompZ)).toBe(false);
    expect(cardMatchesMegaEntry('Mega Garchomp Z ex', garchompZ)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Garchomp Z ex', garchomp)).toBe(false);
    expect(cardMatchesMegaEntry('M Absol EX', absol)).toBe(true);
    expect(cardMatchesMegaEntry('M Absol EX', absolZ)).toBe(false);
    expect(cardMatchesMegaEntry('Mega Absol Z ex', absolZ)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Absol Z ex', absol)).toBe(false);
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

  it('does not bleed an explicit-token Mewtwo Y card onto the Mewtwo X tile, or vice versa (regression: reported live as Mega Mewtwo X showing Y cards)', () => {
    const mewtwoX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'mewtwo-mega-x')!;
    const mewtwoY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'mewtwo-mega-y')!;
    expect(cardMatchesMegaEntry('Mega Mewtwo X ex', mewtwoX)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Mewtwo X ex', mewtwoY)).toBe(false);
    expect(cardMatchesMegaEntry('Mega Mewtwo Y ex', mewtwoY)).toBe(true);
    expect(cardMatchesMegaEntry('Mega Mewtwo Y ex', mewtwoX)).toBe(false);
    // The real data today only has the tokenless legacy "M Mewtwo EX" family
    // (no modern X/Y-tagged Mewtwo print exists yet) -- that stays on BOTH
    // tiles, per the documented ambiguous-legacy-card rule, not a bleed.
    expect(cardMatchesMegaEntry('M Mewtwo EX', mewtwoX)).toBe(true);
    expect(cardMatchesMegaEntry('M Mewtwo EX', mewtwoY)).toBe(true);
  });

  // Real card names pulled directly from public/data/cards/en.json's dex-9
  // (Blastoise) bucket -- the exact species reported live as "Mega Blastoise
  // shows no cards" -- covering both naming families and both rarity tiers
  // (a mobile-game Pocket-exclusive rarity alongside an Ultra Rare).
  it('matches every real Mega Blastoise card name shape found in the data, both naming families', () => {
    const blastoiseMega = MEGA_DEX_ENTRIES.find((e) => e.slug === 'blastoise-mega')!;
    const realBlastoiseCards = [
      { name: 'Mega Blastoise ex', rarity: 'Four Diamond' },
      { name: 'Mega Blastoise ex', rarity: 'Two Star' },
      { name: 'Mega Blastoise ex', rarity: 'Two Star' },
      { name: 'M Blastoise EX', rarity: 'Ultra Rare' },
      { name: 'M Blastoise EX', rarity: 'Ultra Rare' },
      { name: 'M Blastoise EX', rarity: 'Ultra Rare' },
      { name: 'M Blastoise EX', rarity: 'Ultra Rare' },
      // Plain (non-Mega) Blastoise prints from the same dex-9 bucket, which
      // must never leak onto the Mega tile.
      { name: 'Blastoise', rarity: 'Common' },
      { name: 'Blastoise ex', rarity: 'Double Rare' },
      { name: 'Blastoise EX', rarity: 'Ultra Rare' },
    ];
    expect(cardsForMegaEntry(realBlastoiseCards, blastoiseMega)).toHaveLength(7);
  });
});

describe('multi-Pokemon (TAG TEAM) Mega adjacency guard', () => {
  // Regression: reported live as Mega Tyranitar's tile showing the "Mega
  // Sableye & Tyranitar-GX" TAG TEAM card. Both Sableye (dex 302) and
  // Tyranitar (dex 248) are independently Mega species, and this one
  // physical card is filed under BOTH their dex buckets (it depicts both
  // Pokemon) -- real card names pulled directly from
  // public/data/cards/en/gen2.json's dex-248 bucket and
  // public/data/cards/en/gen3.json's dex-302 bucket. The "Mega" tag itself
  // belongs only to the FIRST-named (adjacent) species, per real TCG
  // naming convention -- confirmed against every "&" mega-tagged card
  // found anywhere in the static database (public/data/cards/**), all of
  // which put the Mega'd Pokemon first.
  const tyranitarMega = MEGA_DEX_ENTRIES.find((e) => e.slug === 'tyranitar-mega')!;
  const sableyeMega = MEGA_DEX_ENTRIES.find((e) => e.slug === 'sableye-mega')!;

  it('cardMatchesMegaEntry: rejects a TAG TEAM card whose adjacent species is a different Mega entry, once a reference species name is supplied', () => {
    expect(
      cardMatchesMegaEntry('Mega Sableye & Tyranitar GX', sableyeMega, { referenceSpeciesName: 'Sableye' })
    ).toBe(true);
    expect(
      cardMatchesMegaEntry('Mega Sableye & Tyranitar GX', tyranitarMega, { referenceSpeciesName: 'Tyranitar' })
    ).toBe(false);
  });

  it('cardMatchesMegaEntry: the adjacency guard is a no-op when no reference species name is supplied (existing 2-arg call sites keep their pre-fix behavior)', () => {
    expect(cardMatchesMegaEntry('Mega Sableye & Tyranitar GX', tyranitarMega)).toBe(true);
  });

  it("cardsForMegaEntry: Tyranitar's own dex-248 bucket does not show the Sableye TAG TEAM card, but Sableye's dex-302 bucket does (real card names)", () => {
    const tyranitarBucket = [
      { name: 'Tyranitar', setId: 'neo2', localId: '12' },
      { name: 'M Tyranitar EX', setId: 'xy7', localId: '42' },
      { name: 'Mega Sableye & Tyranitar GX', setId: 'sm11', localId: '126' },
    ];
    const sableyeBucket = [
      { name: 'Sableye', setId: 'xy1', localId: '68' },
      { name: 'Mega Sableye & Tyranitar GX', setId: 'sm11', localId: '126' },
    ];
    expect(cardsForMegaEntry(tyranitarBucket, tyranitarMega).map((c) => c.name)).toEqual(['M Tyranitar EX']);
    expect(cardsForMegaEntry(sableyeBucket, sableyeMega).map((c) => c.name)).toEqual([
      'Mega Sableye & Tyranitar GX',
    ]);
  });

  it('applies the same adjacency guard to the real German localization ("Mega-Zobiris & Despotar GX"), deriving the reference species name straight from the data with no hardcoded translation table', () => {
    const despotarBucket = [
      { name: 'Despotar', setId: 'neo2', localId: '12' },
      { name: 'Mega-Zobiris & Despotar GX', setId: 'sm11', localId: '126' },
    ];
    const zobirisBucket = [
      { name: 'Zobiris', setId: 'xy1', localId: '68' },
      { name: 'Mega-Zobiris & Despotar GX', setId: 'sm11', localId: '126' },
    ];
    expect(cardsForMegaEntry(despotarBucket, tyranitarMega)).toHaveLength(0);
    expect(cardsForMegaEntry(zobirisBucket, sableyeMega).map((c) => c.name)).toEqual([
      'Mega-Zobiris & Despotar GX',
    ]);
  });

  // No Japanese equivalent of this TAG TEAM pairing exists anywhere in the
  // static database (verified live: neither public/data/cards/ja.json nor
  // any public/data/cards/ja/gen*.json file has a card whose name contains
  // "&" alongside a Mega marker) -- confirmed by scanning every language
  // file for a "&"-joined Mega-tagged name; only English and German carry
  // this pairing (and the Lopunny/Jigglypuff one, which never bled since
  // Jigglypuff has no Mega entry of its own to bleed onto). Nothing to test
  // for ja here as a result.

  it("derivePlainSpeciesName (via cardsForMegaEntry) picks the SHORTEST plain sibling name, not just the first one, so a modified print like 'Sableye G' occurring before the bare 'Sableye' print doesn't corrupt the reference", () => {
    const sableyeBucketWithModifiedFirst = [
      { name: 'Sableye G', setId: 'pl3', localId: '41' },
      { name: 'Sableye', setId: 'xy1', localId: '68' },
      { name: 'Mega Sableye & Tyranitar GX', setId: 'sm11', localId: '126' },
    ];
    expect(cardsForMegaEntry(sableyeBucketWithModifiedFirst, sableyeMega).map((c) => c.name)).toEqual([
      'Mega Sableye & Tyranitar GX',
    ]);
  });

  it('never applies the adjacency guard to a plain (non-"&") card name, even with a mismatched reference species name supplied', () => {
    // megaAdjacentSpeciesToken only ever returns non-null for a "&"-joined
    // name -- a plain card's Mega tag is scoped entirely by the caller's
    // dex-bucket filtering (see the module comment up top), never by this
    // guard, so even a deliberately WRONG reference name here must not
    // reject it.
    const charizardX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-x')!;
    expect(
      cardMatchesMegaEntry('Mega Charizard X ex', charizardX, { referenceSpeciesName: 'NotCharizard' })
    ).toBe(true);
  });
});

describe('VARIANT_OVERRIDES', () => {
  const charizardX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-x')!;
  const charizardY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-y')!;
  const mewtwoX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'mewtwo-mega-x')!;
  const mewtwoY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'mewtwo-mega-y')!;

  // Evidence: the reference wiki's own card articles state outright which
  // Mega form each print depicts -- "M Mewtwo-EX (BREAKthrough 63)"'s
  // structured ndex field reads "150MX" and its Origin section reads "This
  // card depicts Mewtwo X."; "M Mewtwo-EX (BREAKthrough 64)"'s reads
  // "150MY" / "This card depicts Mewtwo Y." -- fetched live via
  // harvest/wikiApiClient.ts, raw wikitext kept under
  // scripts/carddata/data/gap-audit/ (gitignored) for the record.
  it('overrides a tokenless card to its one confirmed variant, beating the token-absence default that would otherwise show it on every tile', () => {
    expect(
      cardMatchesMegaEntry('M Mewtwo EX', mewtwoX, { overrideVariant: 'X' })
    ).toBe(true);
    expect(
      cardMatchesMegaEntry('M Mewtwo EX', mewtwoY, { overrideVariant: 'X' })
    ).toBe(false);
    expect(
      cardMatchesMegaEntry('M Mewtwo EX', mewtwoY, { overrideVariant: 'Y' })
    ).toBe(true);
    expect(
      cardMatchesMegaEntry('M Mewtwo EX', mewtwoX, { overrideVariant: 'Y' })
    ).toBe(false);
  });

  it('cardsForMegaEntry: BREAKthrough 63 (confirmed Mewtwo X) shows ONLY on the X tile, BREAKthrough 64 (confirmed Mewtwo Y) shows ONLY on the Y tile', () => {
    const bucket = [
      { name: 'M Mewtwo EX', setId: 'xy8', localId: '63' },
      { name: 'M Mewtwo EX', setId: 'xy8', localId: '64' },
    ];
    expect(cardsForMegaEntry(bucket, mewtwoX).map((c) => c.localId)).toEqual(['63']);
    expect(cardsForMegaEntry(bucket, mewtwoY).map((c) => c.localId)).toEqual(['64']);
  });

  it('cardsForMegaEntry: also resolves the confirmed Charizard prints (Generations 12 = X, Flashfire 13/107 = Y, Flashfire 69/108 = X, Evolutions 13/101 = Y)', () => {
    const bucket = [
      { name: 'M Charizard EX', setId: 'g1', localId: '12' },
      { name: 'M Charizard EX', setId: 'xy2', localId: '13' },
      { name: 'M Charizard EX', setId: 'xy2', localId: '107' },
      { name: 'M Charizard EX', setId: 'xy2', localId: '69' },
      { name: 'M Charizard EX', setId: 'xy2', localId: '108' },
      { name: 'M Charizard EX', setId: 'xy12', localId: '13' },
      { name: 'M Charizard EX', setId: 'xy12', localId: '101' },
    ];
    expect(cardsForMegaEntry(bucket, charizardX).map((c) => c.localId).sort()).toEqual(['108', '12', '69']);
    expect(cardsForMegaEntry(bucket, charizardY).map((c) => c.localId).sort()).toEqual(['101', '107', '13', '13']);
  });

  it('a tokenless card with NO override entry still shows on every variant tile, unchanged from before this table existed', () => {
    const bucket = [{ name: 'M Charizard EX', setId: 'not-a-real-set', localId: '999' }];
    expect(cardsForMegaEntry(bucket, charizardX)).toHaveLength(1);
    expect(cardsForMegaEntry(bucket, charizardY)).toHaveLength(1);
  });

  it('overrides never affect the classic-vs-Z split for Absol/Garchomp/Lucario: a real (non-overridden) print keeps its existing behavior even when it carries setId/localId fields', () => {
    const lucario = MEGA_DEX_ENTRIES.find((e) => e.slug === 'lucario-mega')!;
    const lucarioZ = MEGA_DEX_ENTRIES.find((e) => e.slug === 'lucario-mega-z')!;
    const bucket = [{ name: 'M Lucario EX', setId: 'xy1', localId: '78' }];
    expect(cardsForMegaEntry(bucket, lucario)).toHaveLength(1);
    expect(cardsForMegaEntry(bucket, lucarioZ)).toHaveLength(0);
  });

  it('has no entries for Raichu (dex 26): zero printed Mega Raichu cards exist in the data today, so nothing is disambiguated yet', () => {
    const raichuX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'raichu-mega-x')!;
    const raichuY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'raichu-mega-y')!;
    // No real card data to test against -- this just documents that a
    // tokenless Raichu card (should one ever be printed) would fall
    // through to the same "shows on every variant tile" default as any
    // other non-overridden ambiguous print, until a real print's evidence
    // is added to VARIANT_OVERRIDES.
    const hypothetical = [{ name: 'M Raichu EX', setId: 'not-yet-printed', localId: '1' }];
    expect(cardsForMegaEntry(hypothetical, raichuX)).toHaveLength(1);
    expect(cardsForMegaEntry(hypothetical, raichuY)).toHaveLength(1);
  });
});
