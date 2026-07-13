import { describe, expect, it } from 'vitest';
import {
  GENERATIONS,
  allDexEntries,
  entriesForGenerations,
  generationForDexNumber,
} from './generations';
import { GEN1_DEX } from './gen1Dex';
import { GEN2_DEX, GEN9_DEX } from './fullDex';
import { MEGA_DEX_BASE, MEGA_DEX_ENTRIES } from './megaDex';

// The nine real, numbered generations -- excludes the 'mega' pseudo-
// generation, which uses synthetic dex numbers far outside the real
// national dex range and so breaks the "contiguous 1..N" assumptions these
// pre-existing tests check. See the "Mega generation" describe block below
// for its own dedicated coverage.
const NUMBERED_GENERATIONS = GENERATIONS.filter((g) => typeof g.id === 'number');

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

  it('covers generations 1 through 9, one entry each, in order, plus a trailing Mega entry', () => {
    expect(GENERATIONS.map((g) => g.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 'mega']);
  });

  it('has a contiguous dex range across all nine numbered generations with no gaps or overlaps', () => {
    let expectedNext = 1;
    for (const generation of NUMBERED_GENERATIONS) {
      expect(generation.entries[0].number).toBe(expectedNext);
      expectedNext = generation.entries[generation.entries.length - 1].number + 1;
    }
    expect(expectedNext).toBe(1026);
  });

  it('sums to exactly 1025 entries across the nine numbered generations', () => {
    const total = NUMBERED_GENERATIONS.reduce((sum, g) => sum + g.entries.length, 0);
    expect(total).toBe(1025);
  });

  it('has a "mega" entry with exactly 48 synthetic-numbered entries, all above every real dex number', () => {
    const mega = GENERATIONS.find((g) => g.id === 'mega');
    expect(mega?.label).toBe('Mega');
    expect(mega?.entries).toHaveLength(48);
    expect(mega?.entries.every((e) => e.number > MEGA_DEX_BASE)).toBe(true);
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

  it('returns the Mega entries, in release order, when "mega" is requested', () => {
    const entries = entriesForGenerations(['mega']);
    expect(entries).toHaveLength(48);
    expect(entries.map((e) => e.number)).toEqual(
      MEGA_DEX_ENTRIES.map((e) => e.number).sort((a, b) => a - b)
    );
  });

  it('merges a numbered generation with "mega", sorted so Mega entries trail every real dex number', () => {
    const entries = entriesForGenerations([1, 'mega']);
    expect(entries).toHaveLength(151 + 48);
    expect(entries[0].name).toBe('Bulbasaur');
    expect(entries[150].name).toBe('Mew');
    expect(entries[151].number).toBeGreaterThan(MEGA_DEX_BASE);
  });
});

describe('allDexEntries', () => {
  it('returns every entry across every known generation, including Mega, sorted by dex number', () => {
    const entries = allDexEntries();
    expect(entries).toHaveLength(1025 + 48);
    expect(entries[0].name).toBe('Bulbasaur');
    expect(entries[1024].name).toBe('Pecharunt');
    expect(entries[entries.length - 1].number).toBe(MEGA_DEX_BASE + 48);
  });

  it('is numbered sequentially from 1 to 1025 for the real dex range, with no gaps or duplicates', () => {
    const entries = allDexEntries();
    entries.slice(0, 1025).forEach((entry, index) => {
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

  it('maps a synthetic Mega dex number to the "mega" generation id', () => {
    expect(generationForDexNumber(MEGA_DEX_ENTRIES[0].number)).toBe('mega');
  });

  it('returns undefined for a dex number outside every known generation', () => {
    expect(generationForDexNumber(0)).toBeUndefined();
    expect(generationForDexNumber(99999)).toBeUndefined();
  });
});
