// scripts/carddata/src/harvest/titleVariants.test.ts
import { describe, expect, it } from 'vitest';
import { generateTitleVariants } from './titleVariants';

describe('generateTitleVariants', () => {
  it('generates the accented Pokemon spelling (the real en pps1-9 fix)', () => {
    const variants = generateTitleVariants('Play! Pokemon Prize Pack Series One (TCG)');
    expect(variants).toContain('Play! Pokémon Prize Pack Series One (TCG)');
  });

  it('generates the plain spelling from an accented title', () => {
    const variants = generateTitleVariants('Play! Pokémon Prize Pack Series One (TCG)');
    expect(variants).toContain('Play! Pokemon Prize Pack Series One (TCG)');
  });

  it('swaps "&" for "and" and vice versa', () => {
    expect(generateTitleVariants('Sword & Shield (TCG)')).toContain('Sword and Shield (TCG)');
    expect(generateTitleVariants('Sword and Shield (TCG)')).toContain('Sword & Shield (TCG)');
  });

  it('falls back an (ATCG) title to the base (TCG) namespace', () => {
    expect(generateTitleVariants('Fusion Arts (ATCG)')).toContain('Fusion Arts (TCG)');
  });

  it('composes two substitutions when a title needs both', () => {
    const variants = generateTitleVariants('Black and White Pokemon Collection (ATCG)');
    expect(variants).toContain('Black & White Pokémon Collection (ATCG)');
  });

  it('never includes the original title', () => {
    expect(generateTitleVariants('Surging Sparks (TCG)')).not.toContain('Surging Sparks (TCG)');
  });

  it('returns an empty list for a title with no known fork', () => {
    expect(generateTitleVariants('Surging Sparks (TCG)')).toEqual([]);
  });
});
