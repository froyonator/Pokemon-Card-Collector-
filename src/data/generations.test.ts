import { describe, expect, it } from 'vitest';
import { GENERATIONS, allDexEntries, entriesForGenerations, generationForDexNumber } from './generations';
import { GEN1_DEX } from './gen1Dex';
import { GEN2_DEX, GEN9_DEX } from './fullDex';

describe('GENERATIONS', () => {
  it('includes Generation 1 backed by GEN1_DEX, unmodified', () => {
    const gen1 = GENERATIONS.find((g) => g.id === 1);
    expect(gen1?.entries).toEqual(GEN1_DEX);
  });

  it('does not mutate GEN1_DEX when entriesForGenerations sorts its result', () => {
    const before = [...GEN1_DEX];
    entriesForGenerations([1]);
    expect(GEN1_DEX).toEqual(before);
  });

  it('covers exactly generations 1 through 9, one entry each, in order', () => {
    expect(GENERATIONS.map((g) => g.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('has a contiguous dex range across all nine generations with no gaps or overlaps', () => {
    let expectedNext = 1;
    for (const generation of GENERATIONS) {
      expect(generation.entries[0].number).toBe(expectedNext);
      expectedNext = generation.entries[generation.entries.length - 1].number + 1;
    }
    expect(expectedNext).toBe(1026);
  });

  it('sums to exactly 1025 entries across every generation', () => {
    const total = GENERATIONS.reduce((sum, g) => sum + g.entries.length, 0);
    expect(total).toBe(1025);
  });
});

describe('entriesForGenerations', () => {
  it('returns entries only for the requested generation ids, sorted by dex number', () => {
    const entries = entriesForGenerations([1]);
    expect(entries).toHaveLength(151);
    expect(entries[0].name).toBe('Bulbasaur');
    expect(entries[150].name).toBe('Mew');
  });

  it('returns an empty list when no generation ids are requested', () => {
    expect(entriesForGenerations([])).toEqual([]);
  });

  it('ignores unknown generation ids rather than throwing', () => {
    expect(entriesForGenerations([999])).toEqual([]);
  });

  it('returns entries from multiple selected generations merged and sorted by dex number', () => {
    const entries = entriesForGenerations([1, 2]);
    expect(entries).toHaveLength(251);
    expect(entries[0].name).toBe('Bulbasaur');
    expect(entries[150].name).toBe('Mew');
    expect(entries[151].name).toBe('Chikorita');
    expect(entries[250].name).toBe('Celebi');
  });

  it('returns generations out of order in the requested list still sorted by dex number in the result', () => {
    const entries = entriesForGenerations([9, 1]);
    expect(entries[0].number).toBe(1);
    expect(entries[entries.length - 1].number).toBe(1025);
  });
});

describe('allDexEntries', () => {
  it('returns every entry across every known generation, sorted by dex number', () => {
    const entries = allDexEntries();
    expect(entries).toHaveLength(1025);
    expect(entries[0].name).toBe('Bulbasaur');
    expect(entries[entries.length - 1].name).toBe('Pecharunt');
  });

  it('is numbered sequentially from 1 to 1025 with no gaps or duplicates', () => {
    const entries = allDexEntries();
    entries.forEach((entry, index) => {
      expect(entry.number).toBe(index + 1);
    });
  });
});

describe('generationForDexNumber', () => {
  it('maps a Gen 1 dex number to generation id 1', () => {
    expect(generationForDexNumber(1)).toBe(1);
    expect(generationForDexNumber(151)).toBe(1);
  });

  it('maps a Gen 2 dex number to generation id 2', () => {
    expect(generationForDexNumber(GEN2_DEX[0].number)).toBe(2);
    expect(generationForDexNumber(GEN2_DEX[GEN2_DEX.length - 1].number)).toBe(2);
  });

  it('maps the final Gen 9 dex number to generation id 9', () => {
    expect(generationForDexNumber(GEN9_DEX[GEN9_DEX.length - 1].number)).toBe(9);
  });

  it('returns undefined for a dex number outside every known generation', () => {
    expect(generationForDexNumber(0)).toBeUndefined();
    expect(generationForDexNumber(99999)).toBeUndefined();
  });
});
