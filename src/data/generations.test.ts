import { describe, expect, it } from 'vitest';
import { GENERATIONS, allDexEntries, entriesForGenerations } from './generations';
import { GEN1_DEX } from './gen1Dex';

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
});

describe('allDexEntries', () => {
  it('returns every entry across every known generation, sorted by dex number', () => {
    const entries = allDexEntries();
    expect(entries).toHaveLength(151);
    expect(entries[0].name).toBe('Bulbasaur');
  });
});
