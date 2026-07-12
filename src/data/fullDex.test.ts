import { describe, expect, it } from 'vitest';
import {
  GEN1_DEX,
  GEN2_DEX,
  GEN3_DEX,
  GEN4_DEX,
  GEN5_DEX,
  GEN6_DEX,
  GEN7_DEX,
  GEN8_DEX,
  GEN9_DEX,
} from './fullDex';
import { GEN1_DEX as GEN1_DEX_SOURCE } from './gen1Dex';

const ALL_GEN_DEXES = [
  GEN1_DEX,
  GEN2_DEX,
  GEN3_DEX,
  GEN4_DEX,
  GEN5_DEX,
  GEN6_DEX,
  GEN7_DEX,
  GEN8_DEX,
  GEN9_DEX,
];

describe('fullDex', () => {
  it('re-exports GEN1_DEX from gen1Dex.ts unmodified, rather than duplicating it', () => {
    expect(GEN1_DEX).toBe(GEN1_DEX_SOURCE);
  });

  it('has exactly 1025 entries across all nine generation slices combined', () => {
    const total = ALL_GEN_DEXES.reduce((sum, dex) => sum + dex.length, 0);
    expect(total).toBe(1025);
  });

  it('is numbered sequentially from 1 to 1025 with no gaps or duplicates when concatenated in generation order', () => {
    const all = ALL_GEN_DEXES.flat();
    all.forEach((entry, index) => {
      expect(entry.number).toBe(index + 1);
    });
  });

  it('has unique names across the entire National Pokedex', () => {
    const all = ALL_GEN_DEXES.flat();
    const names = new Set(all.map((entry) => entry.name));
    expect(names.size).toBe(all.length);
  });

  it.each([
    ['GEN2_DEX', GEN2_DEX, 100, 152, 251, 'Chikorita', 'Celebi'],
    ['GEN3_DEX', GEN3_DEX, 135, 252, 386, 'Treecko', 'Deoxys'],
    ['GEN4_DEX', GEN4_DEX, 107, 387, 493, 'Turtwig', 'Arceus'],
    ['GEN5_DEX', GEN5_DEX, 156, 494, 649, 'Victini', 'Genesect'],
    ['GEN6_DEX', GEN6_DEX, 72, 650, 721, 'Chespin', 'Volcanion'],
    ['GEN7_DEX', GEN7_DEX, 88, 722, 809, 'Rowlet', 'Melmetal'],
    ['GEN8_DEX', GEN8_DEX, 96, 810, 905, 'Grookey', 'Enamorus'],
    ['GEN9_DEX', GEN9_DEX, 120, 906, 1025, 'Sprigatito', 'Pecharunt'],
  ] as const)(
    '%s has the correct length, dex number range, and boundary species',
    (_label, dex, length, first, last, firstName, lastName) => {
      expect(dex).toHaveLength(length);
      expect(dex[0].number).toBe(first);
      expect(dex[0].name).toBe(firstName);
      expect(dex[dex.length - 1].number).toBe(last);
      expect(dex[dex.length - 1].name).toBe(lastName);
    }
  );

  it('keeps every generation slice numbered sequentially within its own range', () => {
    for (const dex of ALL_GEN_DEXES) {
      const first = dex[0].number;
      dex.forEach((entry, index) => {
        expect(entry.number).toBe(first + index);
      });
    }
  });

  it('preserves the special-case display names this app already established for Gen 1 (Nidoran-F/-M, ASCII apostrophe)', () => {
    const nidoranF = GEN1_DEX.find((e) => e.number === 29);
    const nidoranM = GEN1_DEX.find((e) => e.number === 32);
    const farfetchd = GEN1_DEX.find((e) => e.number === 83);
    expect(nidoranF?.name).toBe('Nidoran-F');
    expect(nidoranM?.name).toBe('Nidoran-M');
    expect(farfetchd?.name).toBe("Farfetch'd");
  });

  it('applies the same ASCII-apostrophe convention to later generations (Sirfetch\'d)', () => {
    const sirfetchd = GEN8_DEX.find((e) => e.number === 865);
    expect(sirfetchd?.name).toBe("Sirfetch'd");
  });

  it('keeps real multi-word and punctuated species names verbatim (Type: Null, Tapu Koko, Mime Jr.)', () => {
    expect(GEN7_DEX.find((e) => e.number === 772)?.name).toBe('Type: Null');
    expect(GEN7_DEX.find((e) => e.number === 785)?.name).toBe('Tapu Koko');
    expect(GEN4_DEX.find((e) => e.number === 439)?.name).toBe('Mime Jr.');
  });
});
