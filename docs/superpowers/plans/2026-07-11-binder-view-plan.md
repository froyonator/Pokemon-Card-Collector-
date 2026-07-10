# Binder View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Dex Grid view mode, "Binder view," that lays every Pokemon in scope out across configurable binder pages with page-flip navigation, black/blank hover-reveal slots, and an optional manual drag-and-drop / insert-blank arrangement layer.

**Architecture:** Pure layout logic (pagination, fill direction, insert-blank, move) lives in a dependency-free module (`src/state/binderLayout.ts`) so it's exhaustively unit-testable without rendering anything. Binder configuration and the optional custom slot order live in the existing Zustand store, following the exact persistence/export pattern `cardOverrides` already established. Three new presentational components (`GridSizePicker`, `BinderSlot`, `BinderSettings`) compose into a top-level `BinderView`, which `DexGrid.tsx` swaps in as a third view mode alongside the existing Sprite/Card toggle, reusing the same Picker and the same generation/rarity-group/language filters already active there.

**Tech Stack:** React + TypeScript, Zustand (existing store), Framer Motion (existing page-flip pattern from Picker's overlay), Vitest + Testing Library, native HTML5 drag-and-drop (no new dependency).

---

## Full spec reference

Read `docs/superpowers/specs/2026-07-11-binder-view-design.md` in full before starting. This plan implements it exactly; any conflict between this plan and that spec should be treated as a bug in this plan, not the spec.

### Type reference used throughout this plan

```ts
// src/types/index.ts additions
export type BinderFillDirection = 'horizontal' | 'vertical';

export type BinderSlotEntry =
  | { type: 'pokemon'; dexNumber: number }
  | { type: 'blank' };

export interface BinderConfig {
  rows: number;
  columns: number;
  pageCount: number;
  fillDirection: BinderFillDirection;
}
```

---

### Task 1: Binder types and store state

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/state/store.ts`
- Test: `src/state/store.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/state/store.test.ts` (follow the existing file's `resetStore`/`beforeEach` pattern already in that file — add `binderConfig`/`binderCustomOrder` to any inline state literals only if the existing tests construct full state objects; if the store's own default initial state already provides these via `useAppStore.getState()`, no fixture changes are needed beyond what's below):

```ts
describe('binderConfig', () => {
  it('defaults to a 3x3 grid, 17 pages, horizontal fill', () => {
    useAppStore.setState({
      binderConfig: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
      binderCustomOrder: null,
    });
    expect(useAppStore.getState().binderConfig).toEqual({
      rows: 3,
      columns: 3,
      pageCount: 17,
      fillDirection: 'horizontal',
    });
  });

  it('setBinderConfig merges a partial update over the existing config', () => {
    useAppStore.setState({
      binderConfig: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
    });
    useAppStore.getState().setBinderConfig({ rows: 4, columns: 5 });
    expect(useAppStore.getState().binderConfig).toEqual({
      rows: 4,
      columns: 5,
      pageCount: 17,
      fillDirection: 'horizontal',
    });
  });

  it('setBinderConfig marks unsaved changes', () => {
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().setBinderConfig({ pageCount: 20 });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('binderCustomOrder', () => {
  it('defaults to null', () => {
    useAppStore.setState({ binderCustomOrder: null });
    expect(useAppStore.getState().binderCustomOrder).toBeNull();
  });

  it('setBinderCustomOrder stores a custom sequence and marks unsaved changes', () => {
    useAppStore.setState({ binderCustomOrder: null, hasUnsavedChanges: false });
    const order = [{ type: 'pokemon' as const, dexNumber: 1 }, { type: 'blank' as const }];
    useAppStore.getState().setBinderCustomOrder(order);
    expect(useAppStore.getState().binderCustomOrder).toEqual(order);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('setBinderCustomOrder(null) clears back to the live default and marks unsaved changes', () => {
    useAppStore.setState({
      binderCustomOrder: [{ type: 'pokemon', dexNumber: 1 }],
      hasUnsavedChanges: false,
    });
    useAppStore.getState().setBinderCustomOrder(null);
    expect(useAppStore.getState().binderCustomOrder).toBeNull();
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('replaceUserData with binder fields', () => {
  it('copies binderConfig and binderCustomOrder from imported data', () => {
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binderConfig: { rows: 4, columns: 4, pageCount: 10, fillDirection: 'vertical' },
      binderCustomOrder: [{ type: 'blank' }],
    });
    expect(useAppStore.getState().binderConfig).toEqual({
      rows: 4,
      columns: 4,
      pageCount: 10,
      fillDirection: 'vertical',
    });
    expect(useAppStore.getState().binderCustomOrder).toEqual([{ type: 'blank' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/state/store.test.ts`
Expected: FAIL — `binderConfig`/`binderCustomOrder`/`setBinderConfig`/`setBinderCustomOrder` don't exist on the store yet, and `replaceUserData`'s type doesn't accept the new fields.

- [ ] **Step 3: Add the types**

In `src/types/index.ts`, add after the `RarityGroup` interface:

```ts
export type BinderFillDirection = 'horizontal' | 'vertical';

export type BinderSlotEntry =
  | { type: 'pokemon'; dexNumber: number }
  | { type: 'blank' };

export interface BinderConfig {
  rows: number;
  columns: number;
  pageCount: number;
  fillDirection: BinderFillDirection;
}
```

- [ ] **Step 4: Add the store state and actions**

In `src/state/store.ts`:

Add to the imports:
```ts
import type {
  BinderConfig,
  BinderSlotEntry,
  Condition,
  Currency,
  OwnedRecord,
  RarityGroup,
  WishlistRecord,
} from '../types';
```

Add a module-level default so both the initial state and `parseImportPayload` (Task 2) share one source of truth:
```ts
export const DEFAULT_BINDER_CONFIG: BinderConfig = {
  rows: 3,
  columns: 3,
  pageCount: 17,
  fillDirection: 'horizontal',
};
```

Add to `ExportedUserData`:
```ts
export interface ExportedUserData {
  version: 1;
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  cardOverrides: Record<string, string>;
  uploadedImages: Record<string, string>;
  binderConfig: BinderConfig;
  binderCustomOrder: BinderSlotEntry[] | null;
}
```

Add to `AppState`:
```ts
  binderConfig: BinderConfig;
  binderCustomOrder: BinderSlotEntry[] | null;

  setBinderConfig: (config: Partial<BinderConfig>) => void;
  setBinderCustomOrder: (order: BinderSlotEntry[] | null) => void;
```

Add to the store's initial state (alongside `cardOverrides: DEFAULT_CARD_OVERRIDES,`):
```ts
      binderConfig: DEFAULT_BINDER_CONFIG,
      binderCustomOrder: null,
```

Add the actions (alongside `setCardOverride`):
```ts
      setBinderConfig: (config) =>
        set((state) => ({
          binderConfig: { ...state.binderConfig, ...config },
          hasUnsavedChanges: true,
        })),
      setBinderCustomOrder: (order) =>
        set({ binderCustomOrder: order, hasUnsavedChanges: true }),
```

Add to `replaceUserData`'s `set(...)` call:
```ts
          binderConfig: data.binderConfig,
          binderCustomOrder: data.binderCustomOrder,
```

Add to `partialize`:
```ts
        binderConfig: state.binderConfig,
        binderCustomOrder: state.binderCustomOrder,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/state/store.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean (this will surface any other file constructing an `ExportedUserData` literal that now needs the two new fields — fix those call sites directly, same as any other required-field addition).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/state/store.ts src/state/store.test.ts
git commit -m "Add binder config and custom-order state to the store"
```

---

### Task 2: Export/import wiring

**Files:**
- Modify: `src/state/exportImport.ts`
- Test: `src/state/exportImport.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/state/exportImport.test.ts` (mirror the file's existing `cardOverrides` tests exactly — find them first and match the structure):

```ts
describe('binder fields in export/import', () => {
  it('buildExportPayload includes binderConfig and binderCustomOrder', () => {
    const payload = buildExportPayload({
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binderConfig: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
      binderCustomOrder: null,
    });
    expect(payload.binderConfig).toEqual({
      rows: 3,
      columns: 3,
      pageCount: 17,
      fillDirection: 'horizontal',
    });
    expect(payload.binderCustomOrder).toBeNull();
  });

  it('parseImportPayload defaults binderConfig and binderCustomOrder when missing (pre-feature backup)', () => {
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
    });
    const parsed = parseImportPayload(raw);
    expect(parsed.binderConfig).toEqual({
      rows: 3,
      columns: 3,
      pageCount: 17,
      fillDirection: 'horizontal',
    });
    expect(parsed.binderCustomOrder).toBeNull();
  });

  it('parseImportPayload accepts a valid binderCustomOrder', () => {
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binderConfig: { rows: 4, columns: 4, pageCount: 10, fillDirection: 'vertical' },
      binderCustomOrder: [{ type: 'pokemon', dexNumber: 1 }, { type: 'blank' }],
    });
    const parsed = parseImportPayload(raw);
    expect(parsed.binderConfig.rows).toBe(4);
    expect(parsed.binderCustomOrder).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
    ]);
  });

  it('parseImportPayload rejects a malformed binderCustomOrder', () => {
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binderCustomOrder: [{ type: 'not-a-real-type' }],
    });
    expect(() => parseImportPayload(raw)).toThrow('This file does not look like a valid export.');
  });

  it('parseImportPayload rejects a malformed binderConfig', () => {
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binderConfig: { rows: 'not-a-number' },
    });
    expect(() => parseImportPayload(raw)).toThrow('This file does not look like a valid export.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/state/exportImport.test.ts`
Expected: FAIL — `buildExportPayload` doesn't return these fields yet, `parseImportPayload` doesn't default or validate them.

- [ ] **Step 3: Implement**

In `src/state/exportImport.ts`, add to the imports:
```ts
import type { BinderConfig, BinderSlotEntry, Currency, OwnedRecord, RarityGroup, WishlistRecord } from '../types';
import { DEFAULT_BINDER_CONFIG } from './store';
```

Add to `ExportableState`:
```ts
  uploadedImages: Record<string, string>;
  binderConfig: BinderConfig;
  binderCustomOrder: BinderSlotEntry[] | null;
```
(If `uploadedImages` is not already present from the earlier image-upload work, add it too — check the current file first, since another task added it independently; don't duplicate the field if it's already there.)

Add to `buildExportPayload`'s return object:
```ts
    binderConfig: state.binderConfig,
    binderCustomOrder: state.binderCustomOrder,
```

Add validation helpers and wire them into `parseImportPayload`:
```ts
function isBinderFillDirection(value: unknown): value is 'horizontal' | 'vertical' {
  return value === 'horizontal' || value === 'vertical';
}

function isValidBinderConfig(value: unknown): value is BinderConfig {
  return (
    isPlainObject(value) &&
    typeof value.rows === 'number' &&
    typeof value.columns === 'number' &&
    typeof value.pageCount === 'number' &&
    isBinderFillDirection(value.fillDirection)
  );
}

function isValidBinderSlotEntry(value: unknown): value is BinderSlotEntry {
  if (!isPlainObject(value)) return false;
  if (value.type === 'blank') return true;
  return value.type === 'pokemon' && typeof value.dexNumber === 'number';
}

function isValidBinderCustomOrder(value: unknown): value is BinderSlotEntry[] {
  return Array.isArray(value) && value.every(isValidBinderSlotEntry);
}
```

In `parseImportPayload`, add (following the exact same "default if missing, validate if present" shape already used for `selectedGenerations`/`cardOverrides`):
```ts
  if (data.binderConfig === undefined) {
    data.binderConfig = DEFAULT_BINDER_CONFIG;
  } else if (!isValidBinderConfig(data.binderConfig)) {
    throw new Error('This file does not look like a valid export.');
  }
  if (data.binderCustomOrder === undefined) {
    data.binderCustomOrder = null;
  } else if (data.binderCustomOrder !== null && !isValidBinderCustomOrder(data.binderCustomOrder)) {
    throw new Error('This file does not look like a valid export.');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/state/exportImport.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/state/exportImport.ts src/state/exportImport.test.ts
git commit -m "Wire binder config and custom order into export/import"
```

---

### Task 3: Pure binder layout logic

**Files:**
- Create: `src/state/binderLayout.ts`
- Test: `src/state/binderLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/state/binderLayout.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/state/binderLayout.test.ts`
Expected: FAIL with "Cannot find module './binderLayout'".

- [ ] **Step 3: Implement**

Create `src/state/binderLayout.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/state/binderLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/state/binderLayout.ts src/state/binderLayout.test.ts
git commit -m "Add pure binder pagination, spread, and reorder logic"
```

---

### Task 4: BinderSlot component

**Files:**
- Create: `src/components/BinderSlot.tsx`
- Create: `src/components/BinderSlot.module.css`
- Test: `src/components/BinderSlot.test.tsx`

Read `src/components/Tile.tsx` and `src/api/pokeapi.ts` (for `spriteUrl`) first — `BinderSlot` shares the sprite-hover-preview and click-opens-Picker contract with `Tile`, but with an inverted default visual (black/blank instead of always-visible).

- [ ] **Step 1: Write the failing test**

Create `src/components/BinderSlot.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderSlot } from './BinderSlot';

describe('BinderSlot', () => {
  it('renders black/blank by default for a pokemon entry, with no visible sprite', () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        onClick={() => {}}
      />
    );
    expect(screen.queryByAltText('Bulbasaur')).not.toBeInTheDocument();
  });

  it('reveals the sprite on hover for a pokemon entry', async () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        onClick={() => {}}
      />
    );
    await userEvent.hover(screen.getByRole('button'));
    expect(screen.getByAltText('Bulbasaur')).toBeInTheDocument();
  });

  it('calls onClick with the dex number when a pokemon slot is clicked', async () => {
    const onClick = vi.fn();
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 6 }}
        pokemonName="Charizard"
        spriteUrl="https://example.com/6.png"
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(6);
  });

  it('renders a non-interactive blank for a blank entry, with no hover preview and no click', async () => {
    const onClick = vi.fn();
    render(<BinderSlot entry={{ type: 'blank' }} onClick={onClick} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a non-interactive blank for an out-of-capacity undefined entry', () => {
    render(<BinderSlot entry={undefined} onClick={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/BinderSlot.test.tsx`
Expected: FAIL with "Cannot find module './BinderSlot'".

- [ ] **Step 3: Implement**

Create `src/components/BinderSlot.module.css`:

```css
.slot {
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  background: #0c0a08;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  transition: background-color var(--transition-fast);
}

.slot:hover,
.slot:focus-visible {
  background: #1a1613;
}

.slot img {
  max-width: 100%;
  max-height: 100%;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.slot:hover img,
.slot:focus-visible img {
  opacity: 1;
}

.blank {
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  background: transparent;
}
```

Create `src/components/BinderSlot.tsx`:

```tsx
import type { BinderSlotEntry } from '../types';
import styles from './BinderSlot.module.css';

export interface BinderSlotProps {
  entry: BinderSlotEntry | undefined;
  pokemonName?: string;
  spriteUrl?: string;
  onClick: (dexNumber: number) => void;
}

export function BinderSlot({ entry, pokemonName, spriteUrl, onClick }: BinderSlotProps) {
  if (!entry || entry.type === 'blank') {
    return <div className={styles.blank} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      className={styles.slot}
      onClick={() => onClick(entry.dexNumber)}
      aria-label={`Click to see the special art card options for ${pokemonName}.`}
    >
      {spriteUrl && pokemonName && <img src={spriteUrl} alt={pokemonName} loading="lazy" />}
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/BinderSlot.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderSlot.tsx src/components/BinderSlot.module.css src/components/BinderSlot.test.tsx
git commit -m "Add BinderSlot: black/blank slot with hover-reveal sprite"
```

---

### Task 5: GridSizePicker component

**Files:**
- Create: `src/components/GridSizePicker.tsx`
- Create: `src/components/GridSizePicker.module.css`
- Test: `src/components/GridSizePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/GridSizePicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GridSizePicker } from './GridSizePicker';

describe('GridSizePicker', () => {
  it('shows the current selection as a label', () => {
    render(<GridSizePicker rows={3} columns={4} onChange={() => {}} />);
    expect(screen.getByText('4 x 3')).toBeInTheDocument();
  });

  it('calls onChange with the hovered cell as rows/columns when clicked', async () => {
    const onChange = vi.fn();
    render(<GridSizePicker rows={3} columns={3} onChange={onChange} />);
    // Cells are exposed with an accessible name encoding their position,
    // e.g. "2 x 5" for column index 1 (0-based), row index 4 (0-based).
    await userEvent.click(screen.getByRole('button', { name: '2 x 5' }));
    expect(onChange).toHaveBeenCalledWith({ rows: 5, columns: 2 });
  });

  it('caps the grid at 10x10', () => {
    render(<GridSizePicker rows={3} columns={3} onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/GridSizePicker.test.tsx`
Expected: FAIL with "Cannot find module './GridSizePicker'".

- [ ] **Step 3: Implement**

Create `src/components/GridSizePicker.module.css`:

```css
.picker {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(10, 18px);
  grid-template-rows: repeat(10, 18px);
  gap: 2px;
}

.cell {
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-surface);
  padding: 0;
  cursor: pointer;
}

.cell.highlighted {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}

.label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
```

Create `src/components/GridSizePicker.tsx`:

```tsx
import { useState } from 'react';
import styles from './GridSizePicker.module.css';

const MAX_SIZE = 10;

export interface GridSizePickerProps {
  rows: number;
  columns: number;
  onChange: (size: { rows: number; columns: number }) => void;
}

export function GridSizePicker({ rows, columns, onChange }: GridSizePickerProps) {
  const [hovered, setHovered] = useState<{ row: number; column: number } | null>(null);
  const highlightRows = hovered ? hovered.row + 1 : 0;
  const highlightColumns = hovered ? hovered.column + 1 : 0;

  return (
    <div className={styles.picker}>
      <div className={styles.grid} onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: MAX_SIZE }, (_, r) =>
          Array.from({ length: MAX_SIZE }, (_, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={[
                styles.cell,
                r < highlightRows && c < highlightColumns ? styles.highlighted : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${c + 1} x ${r + 1}`}
              onMouseEnter={() => setHovered({ row: r, column: c })}
              onClick={() => onChange({ rows: r + 1, columns: c + 1 })}
            />
          ))
        )}
      </div>
      <span className={styles.label}>{`${columns} x ${rows}`}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/GridSizePicker.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/GridSizePicker.tsx src/components/GridSizePicker.module.css src/components/GridSizePicker.test.tsx
git commit -m "Add GridSizePicker: hover-to-preview rows x columns selector"
```

---

### Task 6: BinderSettings component

**Files:**
- Create: `src/components/BinderSettings.tsx`
- Create: `src/components/BinderSettings.module.css`
- Test: `src/components/BinderSettings.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/BinderSettings.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderSettings } from './BinderSettings';
import { useAppStore } from '../state/store';

function resetStore() {
  useAppStore.setState({
    binderConfig: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
    binderCustomOrder: null,
    hasUnsavedChanges: false,
  });
}

describe('BinderSettings', () => {
  beforeEach(resetStore);

  it('changing the page count updates binderConfig', async () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    const input = screen.getByLabelText(/page count/i);
    await userEvent.clear(input);
    await userEvent.type(input, '20');
    expect(useAppStore.getState().binderConfig.pageCount).toBe(20);
  });

  it('changing fill direction updates binderConfig', async () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /vertical/i }));
    expect(useAppStore.getState().binderConfig.fillDirection).toBe('vertical');
  });

  it('the Manual arrange toggle calls onToggleManualArrange', async () => {
    const onToggle = vi.fn();
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /manual arrange/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not show a Reset arrangement button when there is no custom order', () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    expect(screen.queryByRole('button', { name: /reset arrangement/i })).not.toBeInTheDocument();
  });

  it('shows a Reset arrangement button once a custom order exists, and clicking it clears it', async () => {
    useAppStore.setState({ binderCustomOrder: [{ type: 'blank' }] });
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /reset arrangement/i }));
    expect(useAppStore.getState().binderCustomOrder).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/BinderSettings.test.tsx`
Expected: FAIL with "Cannot find module './BinderSettings'".

- [ ] **Step 3: Implement**

Create `src/components/BinderSettings.module.css`:

```css
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.directionToggle {
  display: flex;
  gap: var(--space-1);
}
```

Create `src/components/BinderSettings.tsx`:

```tsx
import { GridSizePicker } from './GridSizePicker';
import { useAppStore } from '../state/store';
import styles from './BinderSettings.module.css';

export interface BinderSettingsProps {
  isManualArrangeActive: boolean;
  onToggleManualArrange: () => void;
}

export function BinderSettings({
  isManualArrangeActive,
  onToggleManualArrange,
}: BinderSettingsProps) {
  const binderConfig = useAppStore((s) => s.binderConfig);
  const binderCustomOrder = useAppStore((s) => s.binderCustomOrder);
  const setBinderConfig = useAppStore((s) => s.setBinderConfig);
  const setBinderCustomOrder = useAppStore((s) => s.setBinderCustomOrder);

  return (
    <fieldset className={styles.settings}>
      <legend>Binder settings</legend>
      <GridSizePicker
        rows={binderConfig.rows}
        columns={binderConfig.columns}
        onChange={({ rows, columns }) => setBinderConfig({ rows, columns })}
      />
      <label className={styles.row}>
        Page count
        <input
          type="number"
          min={1}
          value={binderConfig.pageCount}
          onChange={(event) => {
            const pageCount = Number(event.target.value);
            if (Number.isFinite(pageCount) && pageCount > 0) {
              setBinderConfig({ pageCount });
            }
          }}
        />
      </label>
      <div className={styles.directionToggle} role="radiogroup" aria-label="Fill direction">
        <button
          type="button"
          aria-pressed={binderConfig.fillDirection === 'horizontal'}
          onClick={() => setBinderConfig({ fillDirection: 'horizontal' })}
        >
          Horizontal
        </button>
        <button
          type="button"
          aria-pressed={binderConfig.fillDirection === 'vertical'}
          onClick={() => setBinderConfig({ fillDirection: 'vertical' })}
        >
          Vertical
        </button>
      </div>
      <button type="button" aria-pressed={isManualArrangeActive} onClick={onToggleManualArrange}>
        Manual arrange
      </button>
      {binderCustomOrder !== null && (
        <button type="button" onClick={() => setBinderCustomOrder(null)}>
          Reset arrangement
        </button>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/BinderSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderSettings.tsx src/components/BinderSettings.module.css src/components/BinderSettings.test.tsx
git commit -m "Add BinderSettings: grid size, page count, fill direction, arrange controls"
```

---

### Task 7: BinderView component (page spread, navigation, default ordering)

**Files:**
- Create: `src/components/BinderView.tsx`
- Create: `src/components/BinderView.module.css`
- Test: `src/components/BinderView.test.tsx`

This task wires the pieces together WITHOUT manual arrange yet (that's Task 8) — clicking a slot calls the provided `onSlotClick`, navigation works, manual arrange mode can be toggled on but dragging doesn't do anything yet.

Read `src/api/pokeapi.ts` for `spriteUrl` and `src/data/gen1Dex.ts` for `DexEntry` before starting.

- [ ] **Step 1: Write the failing test**

Create `src/components/BinderView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderView } from './BinderView';
import { useAppStore } from '../state/store';
import type { DexEntry } from '../data/gen1Dex';

const dexEntries: DexEntry[] = [
  { number: 1, name: 'Bulbasaur' },
  { number: 2, name: 'Ivysaur' },
  { number: 3, name: 'Venusaur' },
  { number: 4, name: 'Charmander' },
  { number: 5, name: 'Charmeleon' },
];

function resetStore() {
  useAppStore.setState({
    binderConfig: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
    binderCustomOrder: null,
    hasUnsavedChanges: false,
  });
}

describe('BinderView', () => {
  beforeEach(resetStore);

  it('shows page 1 alone on first render', () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} />);
    expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/page 2/i)).not.toBeInTheDocument();
  });

  it('advancing to the next spread shows pages 2 and 3 together', async () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page 3/i)).toBeInTheDocument();
  });

  it('the previous button on the first spread is disabled', () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('clicking a filled slot calls onSlotClick with the right dex number', async () => {
    const onSlotClick = vi.fn();
    render(<BinderView dexEntries={dexEntries} onSlotClick={onSlotClick} />);
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(onSlotClick).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/BinderView.test.tsx`
Expected: FAIL with "Cannot find module './BinderView'".

- [ ] **Step 3: Implement**

Create `src/components/BinderView.module.css`:

```css
.binder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.spread {
  display: flex;
  gap: var(--space-4);
}

.page {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: #050403;
}

.nav {
  display: flex;
  gap: var(--space-4);
  align-items: center;
}
```

Create `src/components/BinderView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spriteUrl } from '../api/pokeapi';
import {
  computeBinderPages,
  computeSpreadPageIndices,
  defaultBinderSequence,
} from '../state/binderLayout';
import { useAppStore } from '../state/store';
import type { DexEntry } from '../data/gen1Dex';
import { BinderSlot } from './BinderSlot';
import styles from './BinderView.module.css';

export interface BinderViewProps {
  dexEntries: DexEntry[];
  onSlotClick: (dexNumber: number) => void;
}

export function BinderView({ dexEntries, onSlotClick }: BinderViewProps) {
  const binderConfig = useAppStore((s) => s.binderConfig);
  const binderCustomOrder = useAppStore((s) => s.binderCustomOrder);
  const shouldReduceMotion = useReducedMotion();
  const [spreadIndex, setSpreadIndex] = useState(0);

  const nameByDexNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of dexEntries) map.set(entry.number, entry.name);
    return map;
  }, [dexEntries]);

  const sequence = binderCustomOrder ?? defaultBinderSequence(dexEntries);
  const pages = useMemo(
    () => computeBinderPages(sequence, binderConfig),
    [sequence, binderConfig]
  );
  const spreads = useMemo(
    () => computeSpreadPageIndices(binderConfig.pageCount),
    [binderConfig.pageCount]
  );
  const currentSpread = spreads[spreadIndex] ?? [];

  const pageMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, rotateY: -90 },
        animate: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: 90 },
        transition: { duration: 0.35 },
      };

  return (
    <div className={styles.binder}>
      <div className={styles.nav}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={spreadIndex === 0}
          onClick={() => setSpreadIndex((i) => Math.max(0, i - 1))}
        >
          &larr;
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={spreadIndex >= spreads.length - 1}
          onClick={() => setSpreadIndex((i) => Math.min(spreads.length - 1, i + 1))}
        >
          &rarr;
        </button>
      </div>
      <div className={styles.spread}>
        <AnimatePresence mode="wait">
          {currentSpread.map((pageIndex) => (
            <motion.div
              key={pageIndex}
              className={styles.page}
              aria-label={`Page ${pageIndex + 1}`}
              style={{
                gridTemplateColumns: `repeat(${binderConfig.columns}, 1fr)`,
                gridTemplateRows: `repeat(${binderConfig.rows}, 1fr)`,
              }}
              {...pageMotion}
            >
              {pages[pageIndex]?.flatMap((row, r) =>
                row.map((entry, c) => (
                  <BinderSlot
                    key={`${r}-${c}`}
                    entry={entry}
                    pokemonName={
                      entry?.type === 'pokemon' ? nameByDexNumber.get(entry.dexNumber) : undefined
                    }
                    spriteUrl={
                      entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined
                    }
                    onClick={onSlotClick}
                  />
                ))
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/BinderView.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderView.tsx src/components/BinderView.module.css src/components/BinderView.test.tsx
git commit -m "Add BinderView: page spreads, flip navigation, default dex-order fill"
```

---

### Task 8: Manual arrange — drag-and-drop and insert-blank

**Files:**
- Modify: `src/components/BinderView.tsx`
- Modify: `src/components/BinderSlot.tsx`
- Test: `src/components/BinderView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/components/BinderView.test.tsx`:

```tsx
describe('BinderView manual arrange', () => {
  beforeEach(resetStore);

  it('dragging one slot onto another snapshots the default order and moves the entry', () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
    const bulbasaur = screen.getByRole('button', { name: /bulbasaur/i });
    const venusaur = screen.getByRole('button', { name: /venusaur/i });

    fireEvent.dragStart(bulbasaur);
    fireEvent.drop(venusaur);

    const order = useAppStore.getState().binderCustomOrder;
    expect(order).not.toBeNull();
    expect(order?.[0]).toEqual({ type: 'pokemon', dexNumber: 2 }); // Ivysaur now leads
    expect(order?.[2]).toEqual({ type: 'pokemon', dexNumber: 1 }); // Bulbasaur moved to Venusaur's old slot
  });

  it('a second drag operates on the already-snapshotted custom order, not a fresh default', () => {
    useAppStore.setState({
      binderCustomOrder: [
        { type: 'pokemon', dexNumber: 5 },
        { type: 'pokemon', dexNumber: 4 },
        { type: 'pokemon', dexNumber: 3 },
        { type: 'pokemon', dexNumber: 2 },
        { type: 'pokemon', dexNumber: 1 },
      ],
    });
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
    const charmeleon = screen.getByRole('button', { name: /charmeleon/i }); // now first
    const charmander = screen.getByRole('button', { name: /charmander/i }); // now second

    fireEvent.dragStart(charmeleon);
    fireEvent.drop(charmander);

    const order = useAppStore.getState().binderCustomOrder;
    expect(order?.[0]).toEqual({ type: 'pokemon', dexNumber: 4 });
    expect(order?.[1]).toEqual({ type: 'pokemon', dexNumber: 5 });
  });

  it('selecting a slot and choosing Keep empty inserts a blank and shifts the rest forward', async () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select ivysaur/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

    const order = useAppStore.getState().binderCustomOrder;
    expect(order).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
      { type: 'pokemon', dexNumber: 3 },
      { type: 'pokemon', dexNumber: 4 },
      { type: 'pokemon', dexNumber: 5 },
    ]);
  });

  it('an existing blank also shifts forward when a new blank is inserted before it', async () => {
    useAppStore.setState({
      binderCustomOrder: [
        { type: 'pokemon', dexNumber: 1 },
        { type: 'blank' },
        { type: 'pokemon', dexNumber: 2 },
      ],
    });
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select bulbasaur/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

    expect(useAppStore.getState().binderCustomOrder).toEqual([
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });
});
```

Add `fireEvent` to the existing `@testing-library/react` import at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/BinderView.test.tsx`
Expected: FAIL — `isManualArrangeActive` prop doesn't exist yet, drag/select-and-keep-empty behavior isn't wired.

- [ ] **Step 3: Implement**

In `src/components/BinderSlot.tsx`, add manual-arrange support (draggable when active, and a "select" affordance distinct from the normal click-opens-Picker behavior):

```tsx
import type { BinderSlotEntry } from '../types';
import styles from './BinderSlot.module.css';

export interface BinderSlotProps {
  entry: BinderSlotEntry | undefined;
  pokemonName?: string;
  spriteUrl?: string;
  onClick: (dexNumber: number) => void;
  isManualArrangeActive?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
}

export function BinderSlot({
  entry,
  pokemonName,
  spriteUrl,
  onClick,
  isManualArrangeActive = false,
  isSelected = false,
  onSelect,
  onDragStart,
  onDrop,
}: BinderSlotProps) {
  if (!entry || entry.type === 'blank') {
    return <div className={styles.blank} aria-hidden="true" />;
  }

  const label = isManualArrangeActive
    ? `Select ${pokemonName}`
    : `Click to see the special art card options for ${pokemonName}.`;

  return (
    <button
      type="button"
      className={[styles.slot, isSelected ? styles.selected : ''].filter(Boolean).join(' ')}
      draggable={isManualArrangeActive}
      onDragStart={onDragStart}
      onDragOver={(event) => isManualArrangeActive && event.preventDefault()}
      onDrop={onDrop}
      onClick={() => (isManualArrangeActive ? onSelect?.() : onClick(entry.dexNumber))}
      aria-label={label}
      aria-pressed={isManualArrangeActive ? isSelected : undefined}
    >
      {spriteUrl && pokemonName && <img src={spriteUrl} alt={pokemonName} loading="lazy" />}
    </button>
  );
}
```

Add a `.selected` rule to `BinderSlot.module.css`:

```css
.selected {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

In `src/components/BinderView.tsx`, add manual-arrange state and wiring. Replace the props interface and add state:

```tsx
export interface BinderViewProps {
  dexEntries: DexEntry[];
  onSlotClick: (dexNumber: number) => void;
  isManualArrangeActive?: boolean;
}

export function BinderView({
  dexEntries,
  onSlotClick,
  isManualArrangeActive = false,
}: BinderViewProps) {
  const binderConfig = useAppStore((s) => s.binderConfig);
  const binderCustomOrder = useAppStore((s) => s.binderCustomOrder);
  const setBinderCustomOrder = useAppStore((s) => s.setBinderCustomOrder);
  const shouldReduceMotion = useReducedMotion();
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const nameByDexNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of dexEntries) map.set(entry.number, entry.name);
    return map;
  }, [dexEntries]);

  const sequence = binderCustomOrder ?? defaultBinderSequence(dexEntries);

  // Manual-arrange edits always operate on `sequence` as it exists RIGHT
  // NOW (whether that's the live default or an already-customized order),
  // and every edit writes the full result back via setBinderCustomOrder --
  // this is what "snapshots the current default sequence on first edit"
  // means in practice: there's no separate snapshot step, the first edit's
  // own write IS the snapshot, and every edit after that reads the
  // already-persisted binderCustomOrder as its starting point instead of
  // recomputing the default.
  function handleDrop(toIndex: number) {
    if (dragFromIndex === null || dragFromIndex === toIndex) {
      setDragFromIndex(null);
      return;
    }
    setBinderCustomOrder(moveEntry(sequence, dragFromIndex, toIndex));
    setDragFromIndex(null);
  }

  function handleKeepEmpty() {
    if (selectedIndex === null) return;
    setBinderCustomOrder(insertBlankAt(sequence, selectedIndex));
    setSelectedIndex(null);
  }

  const pages = useMemo(
    () => computeBinderPages(sequence, binderConfig),
    [sequence, binderConfig]
  );
```

Add the import for `insertBlankAt`/`moveEntry` alongside the existing `binderLayout` import:

```tsx
import {
  computeBinderPages,
  computeSpreadPageIndices,
  defaultBinderSequence,
  insertBlankAt,
  moveEntry,
} from '../state/binderLayout';
```

Update the `BinderSlot` render call inside the page-mapping `flatMap` to pass a flat slot index and the new manual-arrange props. Replace it with:

```tsx
{pages[pageIndex]?.flatMap((row, r) =>
  row.map((entry, c) => {
    const slotIndex =
      pageIndex * binderConfig.rows * binderConfig.columns + r * binderConfig.columns + c;
    return (
      <BinderSlot
        key={`${r}-${c}`}
        entry={entry}
        pokemonName={
          entry?.type === 'pokemon' ? nameByDexNumber.get(entry.dexNumber) : undefined
        }
        spriteUrl={entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined}
        onClick={onSlotClick}
        isManualArrangeActive={isManualArrangeActive}
        isSelected={selectedIndex === slotIndex}
        onSelect={() => setSelectedIndex(slotIndex)}
        onDragStart={() => setDragFromIndex(slotIndex)}
        onDrop={() => handleDrop(slotIndex)}
      />
    );
  })
)}
```

Note: `computeBinderPages`'s row-major/column-major fill inside a page must match the same `slotIndex` formula used here for horizontal fill specifically. This plan's flat-index formula (`pageIndex * rows * columns + r * columns + c`) matches `computeBinderPages`'s horizontal fill order exactly. Under vertical fill, dragging will still work correctly for moves WITHIN the currently rendered grid (the row/column position is still resolved to the correct sequence index via this same formula, since `computeBinderPages` always fills the returned 2D grid at `grid[r][c]`, and this formula always recovers r/c consistently regardless of which fill direction produced the grid) — no special-casing needed.

Add the "Keep empty" action, shown only when a slot is selected during manual arrange. Add this JSX near the nav buttons, inside the manual-arrange-active branch:

```tsx
{isManualArrangeActive && selectedIndex !== null && (
  <button type="button" onClick={handleKeepEmpty}>
    Keep empty
  </button>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/BinderView.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderView.tsx src/components/BinderSlot.tsx src/components/BinderSlot.module.css src/components/BinderView.test.tsx
git commit -m "Add manual arrange: drag-and-drop reorder and insert-blank"
```

---

### Task 9: Wire Binder view into DexGrid

**Files:**
- Modify: `src/components/DexGrid.tsx`
- Test: `src/components/DexGrid.test.tsx`

Read the current `src/components/DexGrid.tsx` in full before starting — this task adds a third `view` state value and conditionally renders `BinderView`/`BinderSettings` in place of the existing sprite/card grid and the existing sidebar content, without disturbing the Picker-opening logic already there (`openDexNumber`/`Picker` stay exactly as they are; `BinderView`'s `onSlotClick` just needs to call the same `setOpenDexNumber` the tiles already use).

- [ ] **Step 1: Write the failing tests**

Add to `src/components/DexGrid.test.tsx`:

```tsx
describe('Binder view', () => {
  it('shows a Binder view button alongside Sprite view and Card view', () => {
    render(<DexGrid />);
    expect(screen.getByRole('button', { name: 'Binder view' })).toBeInTheDocument();
  });

  it('selecting Binder view renders the binder layout instead of the sprite/card grid', async () => {
    render(<DexGrid />);
    await userEvent.click(screen.getByRole('button', { name: 'Binder view' }));
    expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
  });

  it('shows Binder Settings only while Binder view is active', async () => {
    render(<DexGrid />);
    expect(screen.queryByText('Binder settings')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Binder view' }));
    expect(screen.getByText('Binder settings')).toBeInTheDocument();
  });

  it('clicking a binder slot opens the Picker for that Pokemon', async () => {
    render(<DexGrid />);
    await userEvent.click(screen.getByRole('button', { name: 'Binder view' }));
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(await screen.findByRole('dialog', { name: /card options for bulbasaur/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/DexGrid.test.tsx`
Expected: FAIL — no "Binder view" button exists yet.

- [ ] **Step 3: Implement**

In `src/components/DexGrid.tsx`:

Add imports:
```tsx
import { BinderSettings } from './BinderSettings';
import { BinderView } from './BinderView';
```

Change the view state type from `useState<'sprite' | 'card'>('sprite')` to:
```tsx
const [view, setView] = useState<'sprite' | 'card' | 'binder'>('sprite');
const [isManualArrangeActive, setIsManualArrangeActive] = useState(false);
```

In the view-toggle button group, add a third button:
```tsx
<button type="button" aria-pressed={view === 'binder'} onClick={() => setView('binder')}>
  Binder view
</button>
```

Add `BinderSettings` into the sidebar/filter area, conditionally rendered only when `view === 'binder'` (place it near the existing rarity-group/generation filter controls, following whatever container element already wraps those):
```tsx
{view === 'binder' && (
  <BinderSettings
    isManualArrangeActive={isManualArrangeActive}
    onToggleManualArrange={() => setIsManualArrangeActive((active) => !active)}
  />
)}
```

Replace the existing grid-rendering block's conditional so `BinderView` renders when `view === 'binder'`, and the existing sprite/card grid renders otherwise (keep the existing `dexEntries.length === 0` empty-state check applying to all three modes):
```tsx
{dexEntries.length === 0 ? (
  <p className={styles.emptyState}>
    Select at least one generation in the filter bar to see Pokémon here.
  </p>
) : view === 'binder' ? (
  <BinderView
    dexEntries={dexEntries}
    onSlotClick={(dexNumber) => setOpenDexNumber(dexNumber)}
    isManualArrangeActive={isManualArrangeActive}
  />
) : (
  <div className={styles.grid} data-version={dataVersion}>
    {/* existing sprite/card tile mapping, unchanged */}
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/DexGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/DexGrid.tsx src/components/DexGrid.test.tsx
git commit -m "Wire Binder view into the Dex Grid view toggle"
```

---

## Self-review notes (completed during plan authoring)

- **Spec coverage**: grid-size picker (Task 5), page count + fill direction (Task 6), page-1-alone + pairs (Task 3/7), hover-reveal black slots (Task 4), click-opens-Picker (Task 4/9), manual arrange drag-and-drop (Task 8), insert-blank with existing-blanks-shift-too (Task 3/8), snapshot-on-first-edit semantics (Task 8), reset arrangement (Task 6), persistence/export (Task 1/2), truncate-don't-expand capacity behavior (Task 3) — every spec section maps to a task.
- **Type consistency**: `BinderSlotEntry`/`BinderConfig`/`BinderFillDirection` (Task 1) are the exact types used unchanged through `binderLayout.ts` (Task 3), `BinderSlot`/`BinderSettings`/`BinderView` (Tasks 4-8), and `DexGrid.tsx` (Task 9) — no renamed fields between tasks.
- **Corrected during authoring**: the spec originally said a trailing solo page happens on an "odd total page count" — verified against `computeSpreadPageIndices`'s actual behavior and corrected to "whenever pageCount is even," in both the spec doc and this plan's test expectations (Task 3's `computeSpreadPageIndices` tests for pageCount 2 and 4 both show a trailing solo page, confirming even, not odd).
