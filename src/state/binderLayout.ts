import type { DexEntry } from '../data/gen1Dex';
import type { BinderConfig, BinderSlotEntry } from '../types';

// Assumes dexEntries is already sorted by dex number ascending, which is
// true of every caller in this app (entriesForGenerations/allDexEntries
// both sort before returning).
export function defaultBinderSequence(dexEntries: DexEntry[]): BinderSlotEntry[] {
  return dexEntries.map((entry) => ({ type: 'pokemon', dexNumber: entry.number }));
}

export type BinderPage = (BinderSlotEntry | undefined)[][]; // rows x columns

// Guards computeBinderPages/computeSpreadPageIndices against a config that
// somehow reaches them with a non-positive or non-integer rows/columns/
// pageCount -- e.g. `new Array(-1)` throws RangeError, and a negative rows
// leaves grid rows undefined so indexing into them throws TypeError. Import
// validation (isValidBinderConfig in exportImport.ts) already rejects such
// values, but this is a second, independent line of defense: there is no
// ErrorBoundary anywhere in this app, so any future path that reaches these
// functions with a bad config (a hand-edited localStorage value, for
// instance) would otherwise blank-screen the entire app, not just Binder
// view.
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function computeBinderPages(
  entries: BinderSlotEntry[],
  config: BinderConfig
): BinderPage[] {
  const { rows, columns, pageCount, fillDirection } = config;
  if (!isPositiveInteger(rows) || !isPositiveInteger(columns) || !isPositiveInteger(pageCount)) {
    return [];
  }
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
  if (!isPositiveInteger(pageCount)) return [];
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

// A no-op for an out-of-range index (`>= entries.length`): such a slot is
// one of the spare, past-capacity positions computeBinderPages pads out with
// `undefined` (see its own `truncated`/`slotsPerPage` math above) rather
// than a real element of `entries` at all -- it's already implicitly blank.
// Without this guard, Array.prototype.splice silently clamps an out-of-range
// index down to entries.length, so calling this on, say, the LAST spare
// slot of a binder with more capacity than entries would insert the new
// blank right after the last real entry instead of doing nothing, corrupting
// every real entry's position.
export function insertBlankAt(entries: BinderSlotEntry[], index: number): BinderSlotEntry[] {
  if (index >= entries.length) return entries;
  const next = entries.slice();
  next.splice(index, 0, { type: 'blank' });
  return next;
}

// The exact inverse of insertBlankAt: removes the entry at `index` outright
// (not replacing it with anything), shifting everything after it back by
// one. Used to undo a single kept-empty slot without resetting the whole
// arrangement -- previously the only way to remove one blank was "Reset
// arrangement", which discards every other manual change too.
export function removeEntryAt(entries: BinderSlotEntry[], index: number): BinderSlotEntry[] {
  const next = entries.slice();
  next.splice(index, 1);
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

// The exact inverse of BinderPage's own withinPage/slotIndex formula in
// BinderView.tsx (`withinPage = fillDirection === 'horizontal' ? r *
// columns + c : c * rows + r; slotIndex = pageIndex * rows * columns +
// withinPage`) -- given a flat slotIndex into `sequence`, resolves which
// page it's on and where within that page's rows x columns grid it falls.
// Needed by the split-image feature (see computeSplitRange below) to turn
// two clicked slot indices back into page-relative row/column coordinates
// it can validate as a rectangle.
export function slotIndexToPosition(
  slotIndex: number,
  config: BinderConfig
): { pageIndex: number; row: number; col: number } {
  const { rows, columns, fillDirection } = config;
  const slotsPerPage = rows * columns;
  const pageIndex = Math.floor(slotIndex / slotsPerPage);
  const withinPage = slotIndex % slotsPerPage;
  if (fillDirection === 'horizontal') {
    return { pageIndex, row: Math.floor(withinPage / columns), col: withinPage % columns };
  }
  return { pageIndex, row: withinPage % rows, col: Math.floor(withinPage / rows) };
}

// The forward direction of slotIndexToPosition above -- given a resolved
// page/row/col, recovers the flat slotIndex `sequence` itself is keyed by.
// Used by the split-image feature to map each (row, col) piece of a
// resolved SplitRange back to the one real slot it belongs to.
export function positionToSlotIndex(
  pageIndex: number,
  row: number,
  col: number,
  config: BinderConfig
): number {
  const { rows, columns, fillDirection } = config;
  const withinPage = fillDirection === 'horizontal' ? row * columns + col : col * rows + row;
  return pageIndex * rows * columns + withinPage;
}

export interface SplitRange {
  pageIndex: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  rows: number;
  cols: number;
}

// Validates and resolves a rectangular block of slots between two clicked
// slot indices (click-then-shift-click) for the split-image feature -- the
// feature that lets one uploaded image be sliced across several adjacent
// blank slots so they show one continuous picture, like a jigsaw. Returns
// null for a physically nonsensical range:
//
// - `anchorIndex`/`targetIndex` resolving to different pages: a single
//   continuous image can never span two separate pages of a spread, even
//   when they're displayed side by side -- confirmed explicitly by the
//   user ("it can never be between 2 pages continuous"). Each page is a
//   physically distinct sheet.
// - a column range that includes the page's own spine-adjacent column: a
//   real binder's rings/spine physically interrupts the page there, so a
//   picture "spanning" it would visibly break in the middle. Which column
//   is spine-adjacent depends on which side of a genuine two-page spread
//   this page is on -- a LEFT page's spine column is its LAST column
//   (`columns - 1`, nearest the spine on its right); a RIGHT page's spine
//   column is its FIRST column (`0`, nearest the spine on its left). A
//   lone/solo page (no partner to be spine-adjacent to at all) has no such
//   restriction, which is why `hasLeftNeighbor`/`hasRightNeighbor` -- not
//   just `side` alone -- gate each check.
//
// Rows have no restriction at all: any row range within the page is fine,
// since a binder's spine only ever runs along a vertical edge between
// pages, never across rows within one page.
export function computeSplitRange(
  anchorIndex: number,
  targetIndex: number,
  config: BinderConfig,
  side: 'left' | 'right' | null,
  hasLeftNeighbor: boolean,
  hasRightNeighbor: boolean
): SplitRange | null {
  const anchor = slotIndexToPosition(anchorIndex, config);
  const target = slotIndexToPosition(targetIndex, config);
  if (anchor.pageIndex !== target.pageIndex) return null;

  const rowStart = Math.min(anchor.row, target.row);
  const rowEnd = Math.max(anchor.row, target.row);
  const colStart = Math.min(anchor.col, target.col);
  const colEnd = Math.max(anchor.col, target.col);

  if (side === 'left' && hasRightNeighbor) {
    const spineCol = config.columns - 1;
    if (colStart <= spineCol && spineCol <= colEnd) return null;
  }
  if (side === 'right' && hasLeftNeighbor) {
    const spineCol = 0;
    if (colStart <= spineCol && spineCol <= colEnd) return null;
  }

  return {
    pageIndex: anchor.pageIndex,
    rowStart,
    rowEnd,
    colStart,
    colEnd,
    rows: rowEnd - rowStart + 1,
    cols: colEnd - colStart + 1,
  };
}
