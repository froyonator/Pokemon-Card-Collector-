import { describe, expect, it } from 'vitest';
import {
  computeBinderPages,
  computeSpreadPageIndices,
  defaultBinderSequence,
  insertBlankAt,
  moveEntry,
} from './binderLayout';
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
