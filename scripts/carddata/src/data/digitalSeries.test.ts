// scripts/carddata/src/data/digitalSeries.test.ts
import { describe, expect, it } from 'vitest';
import { DIGITAL_ONLY_SERIES_IDS, DIGITAL_ONLY_SET_IDS, isDigitalOnlySeriesId, isDigitalOnlySetId } from './digitalSeries';

describe('DIGITAL_ONLY_SET_IDS', () => {
  it('has exactly the 15 setIds enumerated from the digital-only series', () => {
    expect([...DIGITAL_ONLY_SET_IDS].sort()).toEqual(
      ['A1', 'A1a', 'A2', 'A2a', 'A2b', 'A3', 'A3a', 'A3b', 'A4', 'A4a', 'B1', 'B1a', 'B2', 'B2a', 'P-A'].sort()
    );
  });
});

describe('isDigitalOnlySetId', () => {
  it('returns true for every known digital-only setId', () => {
    for (const setId of DIGITAL_ONLY_SET_IDS) {
      expect(isDigitalOnlySetId(setId)).toBe(true);
    }
  });

  it('returns false for an ordinary physical setId', () => {
    expect(isDigitalOnlySetId('base1')).toBe(false);
    expect(isDigitalOnlySetId('sv01')).toBe(false);
    expect(isDigitalOnlySetId('mcd21')).toBe(false);
  });

  it('does not false-positive on the Japanese-franchise-named physical series id (PMCG)', () => {
    expect(isDigitalOnlySetId('PMCG1')).toBe(false);
    expect(isDigitalOnlySeriesId('PMCG')).toBe(false);
  });

  it('returns false for missing/nullish input without throwing', () => {
    expect(isDigitalOnlySetId(undefined)).toBe(false);
    expect(isDigitalOnlySetId(null)).toBe(false);
    expect(isDigitalOnlySetId('')).toBe(false);
  });
});

describe('isDigitalOnlySeriesId', () => {
  it('returns true only for the tcgp series', () => {
    expect(isDigitalOnlySeriesId('tcgp')).toBe(true);
    expect([...DIGITAL_ONLY_SERIES_IDS]).toEqual(['tcgp']);
  });

  it('returns false for missing/nullish input without throwing', () => {
    expect(isDigitalOnlySeriesId(undefined)).toBe(false);
    expect(isDigitalOnlySeriesId(null)).toBe(false);
  });
});
