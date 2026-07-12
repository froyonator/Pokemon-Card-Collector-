import { describe, expect, it } from 'vitest';
import { GEN_RANGES, generationForDexNumber, rangeForGeneration } from './data/genRanges';

describe('GEN_RANGES', () => {
  it('covers 1-1025 with no gaps and no overlaps, in ascending order', () => {
    const sorted = [...GEN_RANGES].sort((a, b) => a.generation - b.generation);
    expect(sorted).toEqual(GEN_RANGES);
    expect(sorted[0].min).toBe(1);
    expect(sorted[sorted.length - 1].max).toBe(1025);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
    }
  });
});

describe('generationForDexNumber', () => {
  it('maps boundary dex numbers to the right generation', () => {
    expect(generationForDexNumber(1)).toBe(1);
    expect(generationForDexNumber(151)).toBe(1);
    expect(generationForDexNumber(152)).toBe(2);
    expect(generationForDexNumber(251)).toBe(2);
    expect(generationForDexNumber(252)).toBe(3);
    expect(generationForDexNumber(386)).toBe(3);
    expect(generationForDexNumber(387)).toBe(4);
    expect(generationForDexNumber(493)).toBe(4);
    expect(generationForDexNumber(494)).toBe(5);
    expect(generationForDexNumber(649)).toBe(5);
    expect(generationForDexNumber(650)).toBe(6);
    expect(generationForDexNumber(721)).toBe(6);
    expect(generationForDexNumber(722)).toBe(7);
    expect(generationForDexNumber(809)).toBe(7);
    expect(generationForDexNumber(810)).toBe(8);
    expect(generationForDexNumber(905)).toBe(8);
    expect(generationForDexNumber(906)).toBe(9);
    expect(generationForDexNumber(1025)).toBe(9);
  });

  it('throws for a dex number outside every range', () => {
    expect(() => generationForDexNumber(0)).toThrow();
    expect(() => generationForDexNumber(1026)).toThrow();
  });
});

describe('rangeForGeneration', () => {
  it('returns the matching range for every known generation', () => {
    for (const range of GEN_RANGES) {
      expect(rangeForGeneration(range.generation)).toEqual(range);
    }
  });

  it('throws for an unknown generation', () => {
    expect(() => rangeForGeneration(10)).toThrow();
    expect(() => rangeForGeneration(0)).toThrow();
  });
});
