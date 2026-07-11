import { describe, expect, it } from 'vitest';
import {
  computeBinderPages,
  computeSplitRange,
  computeSpreadPageIndices,
  defaultBinderSequence,
  insertBlankAt,
  moveEntry,
  positionToSlotIndex,
  removeEntryAt,
  slotIndexToPosition,
} from './binderLayout';
import type { BinderConfig } from '../types';
import type { DexEntry } from '../data/gen1Dex';

describe('defaultBinderSequence', () => {
  it('maps dex entries to pokemon slot entries in the same order', () => {
    const entries: DexEntry[] = [
      { number: 1, name: 'Bulbasaur' },
      { number: 2, name: 'Ivysaur' },
    ];
    expect(defaultBinderSequence(entries)).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });

  it('returns an empty sequence for no entries', () => {
    expect(defaultBinderSequence([])).toEqual([]);
  });
});

describe('computeBinderPages', () => {
  const config = { rows: 2, columns: 2, pageCount: 2, fillDirection: 'horizontal' as const };

  it('fills a page left-to-right, top-to-bottom under horizontal fill', () => {
    const entries = [1, 2, 3].map((n) => ({ type: 'pokemon' as const, dexNumber: n }));
    const pages = computeBinderPages(entries, config);
    expect(pages[0]).toEqual([
      [{ type: 'pokemon', dexNumber: 1 }, { type: 'pokemon', dexNumber: 2 }],
      [{ type: 'pokemon', dexNumber: 3 }, undefined],
    ]);
  });

  it('fills a page top-to-bottom, left-to-right under vertical fill', () => {
    const entries = [1, 2, 3].map((n) => ({ type: 'pokemon' as const, dexNumber: n }));
    const pages = computeBinderPages(entries, { ...config, fillDirection: 'vertical' });
    expect(pages[0]).toEqual([
      [{ type: 'pokemon', dexNumber: 1 }, { type: 'pokemon', dexNumber: 3 }],
      [{ type: 'pokemon', dexNumber: 2 }, undefined],
    ]);
  });

  it('always returns exactly pageCount pages, even with far fewer entries than capacity', () => {
    const entries = [{ type: 'pokemon' as const, dexNumber: 1 }];
    const pages = computeBinderPages(entries, config);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual([[undefined, undefined], [undefined, undefined]]);
  });

  it('truncates entries beyond capacity instead of adding pages', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      type: 'pokemon' as const,
      dexNumber: i + 1,
    }));
    const pages = computeBinderPages(entries, config); // capacity = 2*2*2 = 8
    const flatCount = pages.flat(2).filter((slot) => slot !== undefined).length;
    expect(flatCount).toBe(8);
  });

  it('spreads a page of blanks and pokemon correctly', () => {
    const entries = [
      { type: 'pokemon' as const, dexNumber: 1 },
      { type: 'blank' as const },
      { type: 'pokemon' as const, dexNumber: 2 },
    ];
    const pages = computeBinderPages(entries, config);
    expect(pages[0][0][1]).toEqual({ type: 'blank' });
  });

  // A corrupted/hand-edited localStorage value or a config that somehow
  // bypasses import validation (see exportImport.test.ts) must never reach
  // `new Array(columns)` or index into `grid[r]` with these values -- doing
  // so throws (RangeError for a negative array length, TypeError for
  // indexing an undefined row), and since there is no ErrorBoundary
  // anywhere in this app, that blank-screens the whole app, not just Binder
  // view.
  it('returns an empty array instead of throwing when columns is negative', () => {
    const entries = [{ type: 'pokemon' as const, dexNumber: 1 }];
    expect(computeBinderPages(entries, { ...config, columns: -1 })).toEqual([]);
  });

  it('returns an empty array instead of throwing when rows is negative', () => {
    const entries = [{ type: 'pokemon' as const, dexNumber: 1 }];
    expect(computeBinderPages(entries, { ...config, rows: -1 })).toEqual([]);
  });

  it('returns an empty array when rows, columns, or pageCount is zero', () => {
    const entries = [{ type: 'pokemon' as const, dexNumber: 1 }];
    expect(computeBinderPages(entries, { ...config, rows: 0 })).toEqual([]);
    expect(computeBinderPages(entries, { ...config, columns: 0 })).toEqual([]);
    expect(computeBinderPages(entries, { ...config, pageCount: 0 })).toEqual([]);
  });

  it('returns an empty array when rows or columns is not an integer', () => {
    const entries = [{ type: 'pokemon' as const, dexNumber: 1 }];
    expect(computeBinderPages(entries, { ...config, rows: 2.5 })).toEqual([]);
    expect(computeBinderPages(entries, { ...config, columns: 2.5 })).toEqual([]);
  });
});

describe('computeSpreadPageIndices', () => {
  it('handles 1 page: a single spread with just page 0', () => {
    expect(computeSpreadPageIndices(1)).toEqual([[0]]);
  });

  it('handles 2 pages: page 0 alone, page 1 alone (no page 2 to pair it with)', () => {
    expect(computeSpreadPageIndices(2)).toEqual([[0], [1]]);
  });

  it('handles 3 pages: page 0 alone, then pages 1+2 paired', () => {
    expect(computeSpreadPageIndices(3)).toEqual([[0], [1, 2]]);
  });

  it('handles 4 pages: page 0 alone, 1+2 paired, page 3 alone', () => {
    expect(computeSpreadPageIndices(4)).toEqual([[0], [1, 2], [3]]);
  });

  it('handles 5 pages: page 0 alone, 1+2 paired, 3+4 paired', () => {
    expect(computeSpreadPageIndices(5)).toEqual([[0], [1, 2], [3, 4]]);
  });

  it('returns an empty array for 0 pages', () => {
    expect(computeSpreadPageIndices(0)).toEqual([]);
  });

  it('returns an empty array instead of throwing for a negative pageCount', () => {
    expect(computeSpreadPageIndices(-1)).toEqual([]);
  });

  it('returns an empty array for a non-integer pageCount', () => {
    expect(computeSpreadPageIndices(2.5)).toEqual([]);
  });
});

describe('insertBlankAt', () => {
  it('inserts a blank at the given index, shifting everything after it forward by one', () => {
    const entries = [
      { type: 'pokemon' as const, dexNumber: 1 },
      { type: 'pokemon' as const, dexNumber: 2 },
    ];
    const result = insertBlankAt(entries, 1);
    expect(result).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });

  it('shifts an existing blank forward too, when inserting before it', () => {
    const entries = [
      { type: 'pokemon' as const, dexNumber: 1 },
      { type: 'blank' as const },
      { type: 'pokemon' as const, dexNumber: 2 },
    ];
    const result = insertBlankAt(entries, 1);
    expect(result).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });

  it('does not mutate the input array', () => {
    const entries = [{ type: 'pokemon' as const, dexNumber: 1 }];
    insertBlankAt(entries, 0);
    expect(entries).toEqual([{ type: 'pokemon', dexNumber: 1 }]);
  });
});

describe('removeEntryAt', () => {
  it('removes the entry at the given index, shifting everything after it back by one -- the exact inverse of insertBlankAt', () => {
    const entries = [
      { type: 'pokemon' as const, dexNumber: 1 },
      { type: 'blank' as const },
      { type: 'pokemon' as const, dexNumber: 2 },
    ];
    expect(removeEntryAt(entries, 1)).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });

  it('does not mutate the input array', () => {
    const entries = [
      { type: 'pokemon' as const, dexNumber: 1 },
      { type: 'blank' as const },
    ];
    removeEntryAt(entries, 1);
    expect(entries).toEqual([{ type: 'pokemon', dexNumber: 1 }, { type: 'blank' }]);
  });
});

describe('moveEntry', () => {
  it('moves an entry from one index to another, shifting entries in between', () => {
    const entries = [1, 2, 3, 4].map((n) => ({ type: 'pokemon' as const, dexNumber: n }));
    const result = moveEntry(entries, 0, 2);
    expect(result.map((e) => (e.type === 'pokemon' ? e.dexNumber : 'blank'))).toEqual([2, 3, 1, 4]);
  });

  it('does not mutate the input array', () => {
    const entries = [1, 2].map((n) => ({ type: 'pokemon' as const, dexNumber: n }));
    moveEntry(entries, 0, 1);
    expect(entries.map((e) => (e.type === 'pokemon' ? e.dexNumber : 'blank'))).toEqual([1, 2]);
  });
});

describe('slotIndexToPosition / positionToSlotIndex', () => {
  const horizontalConfig: BinderConfig = {
    rows: 3,
    columns: 3,
    pageCount: 4,
    fillDirection: 'horizontal',
  };
  const verticalConfig: BinderConfig = { ...horizontalConfig, fillDirection: 'vertical' };

  it('resolves horizontal fill exactly like BinderPage\'s own withinPage formula (r*columns+c)', () => {
    // Page 1 (index 1), row 2, col 1 -> withinPage = 2*3+1 = 7 -> slotIndex = 1*9+7 = 16.
    expect(slotIndexToPosition(16, horizontalConfig)).toEqual({ pageIndex: 1, row: 2, col: 1 });
    expect(positionToSlotIndex(1, 2, 1, horizontalConfig)).toBe(16);
  });

  it('resolves vertical fill exactly like BinderPage\'s own withinPage formula (c*rows+r)', () => {
    // Page 2 (index 2), row 1, col 2 -> withinPage = 2*3+1 = 7 -> slotIndex = 2*9+7 = 25.
    expect(slotIndexToPosition(25, verticalConfig)).toEqual({ pageIndex: 2, row: 1, col: 2 });
    expect(positionToSlotIndex(2, 1, 2, verticalConfig)).toBe(25);
  });

  it('round-trips every slot index on a page under both fill directions', () => {
    for (const config of [horizontalConfig, verticalConfig]) {
      for (let slotIndex = 0; slotIndex < config.rows * config.columns * 2; slotIndex++) {
        const position = slotIndexToPosition(slotIndex, config);
        expect(positionToSlotIndex(position.pageIndex, position.row, position.col, config)).toBe(
          slotIndex
        );
      }
    }
  });
});

describe('computeSplitRange', () => {
  // 3 columns, 3 rows so each page has a clear non-spine column to test
  // against too, not just the spine column itself.
  const config: BinderConfig = { rows: 3, columns: 3, pageCount: 6, fillDirection: 'horizontal' };

  function indexAt(pageIndex: number, row: number, col: number): number {
    return positionToSlotIndex(pageIndex, row, col, config);
  }

  it('succeeds for a valid 1x2 horizontal range on a lone page\'s leftmost two columns', () => {
    const range = computeSplitRange(
      indexAt(0, 0, 0),
      indexAt(0, 0, 1),
      config,
      'right',
      false,
      false
    );
    expect(range).toEqual({ pageIndex: 0, rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1, rows: 1, cols: 2 });
  });

  it('fails for the same shape on a LEFT page\'s last two columns, since that includes the spine column', () => {
    const range = computeSplitRange(
      indexAt(1, 0, 1),
      indexAt(1, 0, 2),
      config,
      'left',
      false,
      true
    );
    expect(range).toBeNull();
  });

  it('fails for the mirror case on a RIGHT page\'s first two columns, since that includes the spine column', () => {
    const range = computeSplitRange(
      indexAt(2, 0, 0),
      indexAt(2, 0, 1),
      config,
      'right',
      true,
      false
    );
    expect(range).toBeNull();
  });

  it('succeeds on a LEFT page using its non-spine columns 0-1 (of 3), matching "in left page the first and second column can share a continuous image"', () => {
    const range = computeSplitRange(
      indexAt(1, 0, 0),
      indexAt(1, 0, 1),
      config,
      'left',
      false,
      true
    );
    expect(range).toEqual({ pageIndex: 1, rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1, rows: 1, cols: 2 });
  });

  it('succeeds on a RIGHT page using its non-spine columns 1-2 (of 3), matching "on right pages the second and 3rd column can share a continuous image"', () => {
    const range = computeSplitRange(
      indexAt(2, 0, 1),
      indexAt(2, 0, 2),
      config,
      'right',
      true,
      false
    );
    expect(range).toEqual({ pageIndex: 2, rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2, rows: 1, cols: 2 });
  });

  it('succeeds for a range spanning multiple rows -- rows have no restriction at all', () => {
    const range = computeSplitRange(
      indexAt(0, 0, 0),
      indexAt(0, 2, 0),
      config,
      'right',
      false,
      false
    );
    expect(range).toEqual({ pageIndex: 0, rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0, rows: 3, cols: 1 });
  });

  it('fails when the anchor and target resolve to different pageIndex values', () => {
    const range = computeSplitRange(
      indexAt(0, 0, 0),
      indexAt(1, 0, 0),
      config,
      'right',
      false,
      false
    );
    expect(range).toBeNull();
  });
});
