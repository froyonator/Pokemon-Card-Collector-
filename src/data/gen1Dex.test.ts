import { describe, expect, it } from 'vitest';
import { GEN1_DEX } from './gen1Dex';

describe('GEN1_DEX', () => {
  it('has exactly 151 entries', () => {
    expect(GEN1_DEX).toHaveLength(151);
  });

  it('is numbered sequentially from 1 to 151', () => {
    GEN1_DEX.forEach((entry, index) => {
      expect(entry.number).toBe(index + 1);
    });
  });

  it('has unique names', () => {
    const names = new Set(GEN1_DEX.map((entry) => entry.name));
    expect(names.size).toBe(151);
  });

  it('starts with Bulbasaur and ends with Mew', () => {
    expect(GEN1_DEX[0].name).toBe('Bulbasaur');
    expect(GEN1_DEX[150].name).toBe('Mew');
  });
});
