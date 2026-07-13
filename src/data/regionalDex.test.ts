import { describe, expect, it } from 'vitest';
import {
  ALOLAN_DEX,
  ALOLAN_DEX_BASE,
  GALARIAN_DEX,
  GALARIAN_DEX_BASE,
  HISUIAN_DEX,
  HISUIAN_DEX_BASE,
  PALDEAN_DEX,
  PALDEAN_DEX_BASE,
  REGIONAL_DEX_ENTRIES,
  REGIONAL_FAMILIES,
  cardsForRegionalEntry,
  excludeRegionalFormCards,
  isRegionalCardName,
  isRegionalDexNumber,
  regionalDexEntriesForBaseDex,
  regionalDexEntryByNumber,
  regionalFamiliesForBaseDex,
} from './regionalDex';

describe('per-family rosters', () => {
  it('has the pipeline-documented counts for each family', () => {
    expect(ALOLAN_DEX).toHaveLength(19);
    expect(GALARIAN_DEX).toHaveLength(26);
    expect(HISUIAN_DEX).toHaveLength(19);
    expect(PALDEAN_DEX).toHaveLength(5);
    expect(REGIONAL_DEX_ENTRIES).toHaveLength(19 + 26 + 19 + 5);
  });

  it('assigns synthetic numbers as that family\'s own base + within-family order, contiguous with no gaps', () => {
    for (const [dex, base] of [
      [ALOLAN_DEX, ALOLAN_DEX_BASE],
      [GALARIAN_DEX, GALARIAN_DEX_BASE],
      [HISUIAN_DEX, HISUIAN_DEX_BASE],
      [PALDEAN_DEX, PALDEAN_DEX_BASE],
    ] as const) {
      const numbers = dex.map((e) => e.number).sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: dex.length }, (_, i) => base + i + 1));
    }
  });

  it('every family base is a distinct 1000-block with no overlap across families or with Mega/VMAX', () => {
    expect(ALOLAN_DEX_BASE).toBe(22000);
    expect(GALARIAN_DEX_BASE).toBe(23000);
    expect(HISUIAN_DEX_BASE).toBe(24000);
    expect(PALDEAN_DEX_BASE).toBe(25000);
  });

  it('has one entry per family in REGIONAL_FAMILIES with a matching formCount', () => {
    expect(REGIONAL_FAMILIES.find((f) => f.family === 'alolan')?.formCount).toBe(19);
    expect(REGIONAL_FAMILIES.find((f) => f.family === 'galarian')?.formCount).toBe(26);
    expect(REGIONAL_FAMILIES.find((f) => f.family === 'hisuian')?.formCount).toBe(19);
    expect(REGIONAL_FAMILIES.find((f) => f.family === 'paldean')?.formCount).toBe(5);
  });

  it('includes exclusive-evolution species (hasOwnVariety: false) alongside pokeapi varieties', () => {
    const obstagoon = GALARIAN_DEX.find((e) => e.slug === 'obstagoon');
    expect(obstagoon?.hasOwnVariety).toBe(false);
    expect(obstagoon?.baseDexNumber).toBe(862);
    const growlithe = HISUIAN_DEX.find((e) => e.slug === 'growlithe-hisui');
    expect(growlithe?.hasOwnVariety).toBe(true);
  });

  it('includes Tauros\'s three Paldean breeds and Darmanitan\'s two modes as separate entries sharing one base dex', () => {
    expect(regionalDexEntriesForBaseDex(128).map((e) => e.slug).sort()).toEqual([
      'tauros-paldea-aqua-breed',
      'tauros-paldea-blaze-breed',
      'tauros-paldea-combat-breed',
    ]);
    expect(regionalDexEntriesForBaseDex(555).map((e) => e.slug).sort()).toEqual([
      'darmanitan-galar-standard',
      'darmanitan-galar-zen',
    ]);
  });

  it('includes Meowth in BOTH the Alolan and Galarian families, sharing the same base dex', () => {
    const meowthEntries = REGIONAL_DEX_ENTRIES.filter((e) => e.baseDexNumber === 52);
    expect(meowthEntries.map((e) => e.family).sort()).toEqual(['alolan', 'galarian']);
  });
});

describe('isRegionalDexNumber / regionalDexEntryByNumber', () => {
  it('recognizes every real entry number and rejects a real national dex number', () => {
    for (const entry of REGIONAL_DEX_ENTRIES) {
      expect(isRegionalDexNumber(entry.number)).toBe(true);
      expect(regionalDexEntryByNumber(entry.number)).toBe(entry);
    }
    expect(isRegionalDexNumber(58)).toBe(false);
  });
});

describe('isRegionalCardName', () => {
  it('matches the English prefix shape', () => {
    expect(isRegionalCardName('alolan', 'Vulpix', 'Alolan Vulpix')).toBe(true);
    expect(isRegionalCardName('galarian', 'Ponyta', 'Galarian Ponyta')).toBe(true);
    expect(isRegionalCardName('hisuian', 'Growlithe', 'Hisuian Growlithe')).toBe(true);
    expect(isRegionalCardName('paldean', 'Tauros', 'Paldean Tauros')).toBe(true);
  });

  it('does not match a plain (non-regional) species name', () => {
    expect(isRegionalCardName('hisuian', 'Growlithe', 'Growlithe')).toBe(false);
    expect(isRegionalCardName('alolan', 'Vulpix', 'Vulpix')).toBe(false);
  });

  it('does not cross-match a different species carrying the same family marker', () => {
    expect(isRegionalCardName('galarian', 'Ponyta', 'Galarian Slowpoke')).toBe(false);
  });

  it('matches the English fusion "tag team" shape (Alolan family only)', () => {
    expect(isRegionalCardName('alolan', 'Raichu', 'Raichu & Alolan Raichu GX')).toBe(true);
    expect(isRegionalCardName('alolan', 'Exeggutor', 'Rowlet & Alolan Exeggutor GX')).toBe(true);
  });

  it('matches a suffix-style language shape (es/pt "de <Family>")', () => {
    expect(isRegionalCardName('alolan', 'Vulpix', 'Vulpix de Alola')).toBe(true);
    expect(isRegionalCardName('galarian', 'Ponyta', 'Ponyta de Galar')).toBe(true);
  });

  it('matches the Japanese prefix+space shape', () => {
    expect(isRegionalCardName('alolan', 'コラッタ', 'アローラ コラッタ')).toBe(true);
    expect(isRegionalCardName('galarian', 'ポニータ', 'ガラル ポニータ')).toBe(true);
  });

  it('matches the German hyphen-or-space prefix shape, both variants for Alolan', () => {
    expect(isRegionalCardName('alolan', 'Rattfratz', 'Alola-Rattfratz')).toBe(true);
    expect(isRegionalCardName('alolan', 'Vulpix', 'Alola Vulpix')).toBe(true);
  });
});

describe('cardsForRegionalEntry', () => {
  it('filters a species\' shared card bucket down to just that family\'s tagged prints', () => {
    const growlithe = HISUIAN_DEX.find((e) => e.slug === 'growlithe-hisui')!;
    const cards = [
      { name: 'Growlithe' },
      { name: 'Hisuian Growlithe' },
      { name: 'Hisuian Growlithe V' },
      { name: 'Arcanine' },
    ];
    expect(cardsForRegionalEntry(cards, growlithe).map((c) => c.name)).toEqual([
      'Hisuian Growlithe',
      'Hisuian Growlithe V',
    ]);
  });

  it('shows an ambiguous breed-less card name on every sibling breed/mode tile (no distinguishing token exists in the TCG)', () => {
    const combat = PALDEAN_DEX.find((e) => e.slug === 'tauros-paldea-combat-breed')!;
    const blaze = PALDEAN_DEX.find((e) => e.slug === 'tauros-paldea-blaze-breed')!;
    const cards = [{ name: 'Paldean Tauros' }];
    expect(cardsForRegionalEntry(cards, combat).map((c) => c.name)).toEqual(['Paldean Tauros']);
    expect(cardsForRegionalEntry(cards, blaze).map((c) => c.name)).toEqual(['Paldean Tauros']);
  });
});

describe('regionalFamiliesForBaseDex / excludeRegionalFormCards', () => {
  it('returns an empty list, and is a pure no-op, for a base dex with no regional form at all', () => {
    expect(regionalFamiliesForBaseDex(1)).toEqual([]);
    const cards = [{ name: 'Bulbasaur' }];
    expect(excludeRegionalFormCards(1, cards)).toBe(cards);
  });

  it('lists both families for a base dex with regional forms in more than one family (Meowth)', () => {
    const families = regionalFamiliesForBaseDex(52);
    expect(families.map((f) => f.family).sort()).toEqual(['alolan', 'galarian']);
  });

  it('excludes a regional-tagged print but keeps the plain species print, for a single-family base dex (Growlithe)', () => {
    const cards = [{ name: 'Growlithe' }, { name: 'Hisuian Growlithe' }];
    expect(excludeRegionalFormCards(58, cards).map((c) => c.name)).toEqual(['Growlithe']);
  });

  it('excludes prints from EVERY family that tags a base dex with more than one (Meowth)', () => {
    const cards = [{ name: 'Meowth' }, { name: 'Alolan Meowth' }, { name: 'Galarian Meowth' }];
    expect(excludeRegionalFormCards(52, cards).map((c) => c.name)).toEqual(['Meowth']);
  });

  it('excludes every print for an exclusive-evolution species (its base tile has no non-regional print at all)', () => {
    const cards = [{ name: 'Galarian Obstagoon' }, { name: 'Galarian Obstagoon V' }];
    expect(excludeRegionalFormCards(862, cards)).toEqual([]);
  });
});
