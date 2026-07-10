import type { DexEntry } from '../data/gen1Dex';
import type { BinderConfig, BinderSlotEntry } from '../types';

// Assumes dexEntries is already sorted by dex number ascending, which is
// true of every caller in this app (entriesForGenerations/allDexEntries
// both sort before returning).
export function defaultBinderSequence(dexEntries: DexEntry[]): BinderSlotEntry[] {
  return dexEntries.map((entry) => ({ type: 'pokemon', dexNumber: entry.number }));
}

export type BinderPage = (BinderSlotEntry | undefined)[][]; // rows x columns

export function computeBinderPages(
  entries: BinderSlotEntry[],
  config: BinderConfig
): BinderPage[] {
  const { rows, columns, pageCount, fillDirection } = config;
  const slotsPerPage = rows * columns;
  const capacity = slotsPerPage * pageCount;
  const truncated = entries.slice(0, capacity);

  const pages: BinderPage[] = [];
  for (let p = 0; p < pageCount; p++) {
    const pageEntries = truncated.slice(p * slotsPerPage, (p + 1) * slotsPerPage);
    const grid: (BinderSlotEntry | undefined)[][] = Array.from({ length: rows }, () =>
      new Array(columns).fill(undefined)
    );
    pageEntries.forEach((entry, i) => {
      if (fillDirection === 'horizontal') {
        const r = Math.floor(i / columns);
        const c = i % columns;
        grid[r][c] = entry;
      } else {
        const c = Math.floor(i / rows);
        const r = i % rows;
        grid[r][c] = entry;
      }
    });
    pages.push(grid);
  }
  return pages;
}

// Page 1 (index 0) always displays alone, like the inside of a front cover.
// From page index 1 onward, pages pair up (1+2, 3+4, ...); a final
// unpaired page (whenever pageCount is even) displays alone too.
export function computeSpreadPageIndices(pageCount: number): number[][] {
  if (pageCount <= 0) return [];
  const spreads: number[][] = [[0]];
  for (let i = 1; i < pageCount; i += 2) {
    if (i + 1 < pageCount) {
      spreads.push([i, i + 1]);
    } else {
      spreads.push([i]);
    }
  }
  return spreads;
}

export function insertBlankAt(entries: BinderSlotEntry[], index: number): BinderSlotEntry[] {
  const next = entries.slice();
  next.splice(index, 0, { type: 'blank' });
  return next;
}

export function moveEntry(
  entries: BinderSlotEntry[],
  fromIndex: number,
  toIndex: number
): BinderSlotEntry[] {
  const next = entries.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
