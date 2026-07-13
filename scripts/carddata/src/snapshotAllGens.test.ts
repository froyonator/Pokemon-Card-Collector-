import { describe, expect, it } from 'vitest';
import {
  dexNumberInAnyRange,
  emptyProgress,
  excludeDigitalOnlySets,
  inRangeDexIds,
  isSetDone,
  markSetDone,
  parseArguments,
  parseGenerationsArg,
  rangesForGenerations,
  selectPendingSets,
  type SnapshotAllGensProgress,
} from './snapshotAllGens';

describe('parseGenerationsArg', () => {
  it('defaults to generations 2-9 when unset', () => {
    expect(parseGenerationsArg(undefined)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('parses a comma list, sorted and deduplicated', () => {
    expect(parseGenerationsArg('5,2,2,9')).toEqual([2, 5, 9]);
  });

  it('rejects Gen1 and anything outside 2-9', () => {
    expect(() => parseGenerationsArg('1,2')).toThrow();
    expect(() => parseGenerationsArg('10')).toThrow();
    expect(() => parseGenerationsArg('abc')).toThrow();
  });
});

describe('rangesForGenerations / dexNumberInAnyRange', () => {
  it('resolves each requested generation to its dex range', () => {
    const ranges = rangesForGenerations([2, 3]);
    expect(ranges).toEqual([
      { generation: 2, min: 152, max: 251 },
      { generation: 3, min: 252, max: 386 },
    ]);
  });

  it('reports true only for dex numbers inside one of the ranges', () => {
    const ranges = rangesForGenerations([2, 3]);
    expect(dexNumberInAnyRange(1, ranges)).toBe(false); // Gen1, not requested
    expect(dexNumberInAnyRange(200, ranges)).toBe(true);
    expect(dexNumberInAnyRange(300, ranges)).toBe(true);
    expect(dexNumberInAnyRange(400, ranges)).toBe(false); // Gen4, not requested
  });

  it('supports a non-contiguous generation selection', () => {
    const ranges = rangesForGenerations([2, 9]);
    expect(dexNumberInAnyRange(200, ranges)).toBe(true);
    expect(dexNumberInAnyRange(300, ranges)).toBe(false); // Gen3, skipped
    expect(dexNumberInAnyRange(1000, ranges)).toBe(true);
  });
});

describe('inRangeDexIds', () => {
  const ranges = rangesForGenerations([2, 3]);

  it('returns only the qualifying dex numbers from a card dexId array', () => {
    expect(inRangeDexIds([1, 200, 999], ranges)).toEqual([200]);
  });

  it('can return more than one qualifying dex number for a multi-Pokemon card', () => {
    expect(inRangeDexIds([160, 300], ranges)).toEqual([160, 300]);
  });

  it('returns empty for undefined or all-out-of-range dexId', () => {
    expect(inRangeDexIds(undefined, ranges)).toEqual([]);
    expect(inRangeDexIds([1, 500], ranges)).toEqual([]);
  });
});

describe('checkpoint/resume', () => {
  it('emptyProgress starts with nothing done', () => {
    const progress = emptyProgress();
    expect(isSetDone(progress, 'en', 'base1')).toBe(false);
  });

  it('markSetDone records a set as done without mutating the input', () => {
    const before = emptyProgress();
    const after = markSetDone(before, 'en', 'base1', {
      setName: 'Base Set',
      cardsWritten: 5,
      completedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(isSetDone(before, 'en', 'base1')).toBe(false);
    expect(isSetDone(after, 'en', 'base1')).toBe(true);
    expect(after.en.base1).toEqual({
      setName: 'Base Set',
      cardsWritten: 5,
      completedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps per-language sets independent', () => {
    let progress = emptyProgress();
    progress = markSetDone(progress, 'en', 'base1', {
      setName: 'Base Set',
      cardsWritten: 5,
      completedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(isSetDone(progress, 'ja', 'base1')).toBe(false);
  });

  it('selectPendingSets drops already-done sets for that language only', () => {
    const progress: SnapshotAllGensProgress = {
      en: { base1: { setName: 'Base Set', cardsWritten: 5, completedAt: '2026-01-01T00:00:00.000Z' } },
    };
    const sets = [{ id: 'base1' }, { id: 'base2' }];
    expect(selectPendingSets(sets, progress, 'en')).toEqual([{ id: 'base2' }]);
    expect(selectPendingSets(sets, progress, 'ja')).toEqual(sets);
  });
});

describe('excludeDigitalOnlySets', () => {
  it('drops digital-only sets from the catalog, keeping physical ones', () => {
    const sets = [{ id: 'base1' }, { id: 'A1' }, { id: 'sv01' }, { id: 'B2a' }];
    expect(excludeDigitalOnlySets(sets)).toEqual([{ id: 'base1' }, { id: 'sv01' }]);
  });

  it('is a no-op when the catalog has no digital-only sets', () => {
    const sets = [{ id: 'base1' }, { id: 'sv01' }];
    expect(excludeDigitalOnlySets(sets)).toEqual(sets);
  });
});

describe('parseArguments', () => {
  it('parses a bare language with all defaults', () => {
    expect(parseArguments(['en'])).toEqual({
      language: 'en',
      generations: [2, 3, 4, 5, 6, 7, 8, 9],
      delayMs: 200,
      limit: undefined,
      setId: undefined,
      skipImages: false,
    });
  });

  it('parses every flag', () => {
    expect(
      parseArguments(['ja', '--gens', '2,3', '--delay-ms', '500', '--limit', '20', '--set', 'me01', '--skip-images'])
    ).toEqual({
      language: 'ja',
      generations: [2, 3],
      delayMs: 500,
      limit: 20,
      setId: 'me01',
      skipImages: true,
    });
  });

  it('rejects an unsupported or missing language', () => {
    expect(() => parseArguments([])).toThrow();
    expect(() => parseArguments(['xx'])).toThrow();
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArguments(['en', '--bogus', 'x'])).toThrow();
  });
});
