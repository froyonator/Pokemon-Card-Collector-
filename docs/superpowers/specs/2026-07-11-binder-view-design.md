# Binder View: Design

**Status:** Approved
**Date:** 2026-07-11

## Problem

The Dex Grid currently has two view modes, Sprite view and Card view, both of which show every Pokemon in scope as a single continuous grid. Neither resembles how a physical card collector actually organizes a binder: fixed-size pages with a configurable slot grid, pages you flip through, and the ability to leave deliberate gaps or rearrange where a card sits independent of dex order. The user wants a third view mode that mimics this directly.

## Scope

This is a new view mode for the existing Dex Grid tab, not a new tab and not a new data model for ownership. It reuses:
- The same Pokemon dataset and the same generation/rarity-group/language filters already active in the Dex Grid.
- The same Picker component and click-to-open behavior already used by every tile.
- The same one-owned-card-per-Pokemon ownership model. Binder view does not track multiple cards per Pokemon or introduce a second ownership dimension.

It adds:
- A binder layout configuration (rows, columns, page count, fill direction).
- A page-spread display with flip navigation and animation.
- A black/blank default slot appearance with a hover-to-reveal sprite preview.
- An optional manual arrangement layer (drag-and-drop reordering, insert-blank) that overrides the default dex-order sequence once the user first uses it.

## Design

### View mode integration

The Dex Grid's view toggle grows a third option: "Sprite view | Card view | Binder view". Selecting Binder view swaps the grid rendering for the binder layout described below. A new "Binder Settings" section appears in the sidebar/filter bar, visible only while Binder view is active, containing the grid-size picker, page count input, fill direction toggle, and the "Manual arrange" toggle button.

### Binder configuration

- **Grid size**: a hover-to-preview picker matching Google Docs' table-insert widget (a grid of cells capped at 10 rows x 10 columns; hovering highlights the rows x columns that would be selected, clicking locks it in). Stored as `{ rows: number; columns: number }`.
- **Page count**: a plain number input. Stored as `pageCount: number`.
- **Fill direction**: a two-option toggle, `'horizontal'` (row-major: left-to-right, then down) or `'vertical'` (column-major: top-to-bottom, then across). This only affects how the ordered sequence of Pokemon fills each page's grid, not the sequence's sort key (which is always dex number by default, see below).

Capacity is `rows * columns * pageCount`. If the number of Pokemon currently in scope (post-filter) exceeds capacity, the binder fills every slot it has and stops — the excess Pokemon do not appear anywhere in the binder until the user increases capacity. This is a deliberate, confirmed decision: no auto-expansion, no warning banner, just a hard cutoff at whatever the user configured.

These four settings persist in the store (survive reload) and are included in the export/import backup, following the same pattern as `activeGroupIds`/`selectedGenerations`.

### Slot sequence and default ordering

The binder is fundamentally an ordered sequence of "slot entries," each either:
- `{ type: 'pokemon', dexNumber: number }` — a specific Pokemon's position, or
- `{ type: 'blank' }` — a deliberately empty spacer.

**Default state** (before any manual arrangement): the sequence is derived live, not stored, as every Pokemon currently in scope (post generation/rarity-group/language filter) sorted by dex number ascending, with no blanks. Because this is computed on the fly from current filter state, a newly-available card or a newly-selected generation is reflected in the binder immediately, with no stale/cached ordering to invalidate.

**Custom state**: the first time the user performs any manual-arrange action (a drag-and-drop move, or an insert-blank), the current default sequence is snapshotted into a real, persisted array (`binderCustomOrder: BinderSlotEntry[]`), which becomes the source of truth from that point forward. All further manual-arrange edits operate on this array directly. This array persists in the store and is included in the export/import backup. There is no automatic reconciliation between a custom order and newly-available Pokemon after this point — a Pokemon that becomes newly available after the user has customized their binder will not automatically appear; see Non-goals.

A "Reset arrangement" action (in Binder Settings, only visible once `binderCustomOrder` is non-null) clears the custom order and reverts to the live default sequence.

### Manual arrange mode

Toggled by the "Manual arrange" button. While active:
- **Drag-and-drop**: dragging a slot to a different position moves that entry within the sequence. This operates on whatever page(s) are currently visible (the two-page spread on screen); moving a card to a page not currently visible requires navigating there first, consistent with how a physical binder works (you can only physically move a card to a page you have open).
- **Insert blank**: selecting a slot and choosing "Keep empty" inserts a new `{ type: 'blank' }` entry at that position. Every entry from that position onward, including any existing blanks, shifts forward by one index. This is a plain list-insert operation over the full binder-wide sequence, not scoped to the visible page.

Manual arrange mode is off by default; toggling it on does not by itself create a custom order (only an actual edit does, per the snapshot-on-first-edit rule above).

### Page display and navigation

Pages display as a two-page spread, mimicking a physical opened binder:
- Page 1 opens alone (nothing to its left — like the first inside page after a front cover).
- From page 2 onward, pages display in pairs: (2, 3), (4, 5), (6, 7), and so on.
- Left and right arrow buttons turn the page (or page-pair) with a page-flip animation. Reduced-motion users get the animation collapsed the same way the rest of the app already handles `prefers-reduced-motion` (see `global.css`'s existing reduced-motion block and Tile/Picker's Framer Motion `useReducedMotion` usage) — no slide/flip transform, an instant or near-instant cut instead.
- If the final page has no partner to pair with (this happens whenever the total page count is even, since pairing starts at page 2: pages 2+3, 4+5, and so on), it displays alone on its own spread, mirroring how page 1 does.

### Slot appearance

Every slot defaults to a plain black/blank appearance — no sprite, no card art, regardless of whether the Pokemon in that position is owned, available-but-unowned, or has no cards released at all. Hovering a slot reveals the sprite of the Pokemon assigned to that position (the same sprite Sprite view already uses), replacing the black slot for the duration of the hover. This preview shows even for Pokemon the user doesn't own a card for, so a blank binder slot still communicates "this is where Squirtle goes," matching how a physical binder collector leaves visibly-labeled empty pockets for cards they're still hunting.

A blank slot (`{ type: 'blank' }`) shows no hover preview (there's no Pokemon assigned to it) and is not clickable to open a Picker, since it isn't tied to any specific Pokemon.

Clicking a Pokemon slot (owned, available-unowned, or unavailable) opens the Picker for that dex number, identically to how DexGrid tiles behave today.

### Data model changes

New types in `src/types/index.ts`:

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

New store state (`src/state/store.ts`), following the existing `cardOverrides`/`selectedGenerations` pattern for persistence and export inclusion:

```ts
binderConfig: BinderConfig; // default: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' }
binderCustomOrder: BinderSlotEntry[] | null; // default: null (use live default sequence)
```

Default `pageCount: 17` is chosen so a default 3x3 grid (9 slots/page) comfortably covers all 151 Gen 1 Pokemon (153 slots) without the user having to configure anything before first use; this is just a sensible starting default, not a hard constraint.

New store actions:
- `setBinderConfig(config: Partial<BinderConfig>)`
- `setBinderCustomOrder(order: BinderSlotEntry[] | null)` — used both for arrange-mode edits (drag-move, insert-blank) and for the "Reset arrangement" action (passing `null`).

Both fields are added to `ExportedUserData`/`ExportableState` and `partialize`, exactly like `selectedGenerations` was. A backup file from before this feature predates both fields entirely; `parseImportPayload` defaults a missing `binderConfig` to the same default shown above and a missing `binderCustomOrder` to `null`, consistent with how every other backward-compatibility default in that function already works.

### New components

- `BinderView.tsx` (or similar): the top-level binder layout, replacing the grid rendering when `view === 'binder'`. Computes the effective slot sequence (live default or `binderCustomOrder`), chunks it into pages per `binderConfig`, and renders the current two-page spread.
- `BinderSlot.tsx`: a single slot, given its `BinderSlotEntry` (or undefined for a genuinely empty/uncapacitated position, if any), owned/available state, and hover/click handlers. Visually distinct from `Tile.tsx` (black default, hover-reveal), but shares the same click-opens-Picker contract.
- `BinderSettings.tsx`: the sidebar section with the grid-size picker, page count input, fill direction toggle, and manual-arrange toggle/controls.
- A pure layout function, e.g. `computeBinderPages(entries: BinderSlotEntry[], config: BinderConfig): BinderSlotEntry[][]`, independently unit-testable without rendering anything — given a sequence and a config, returns the array of per-page slot arrays (already truncated to capacity, already accounting for fill direction).

### Testing

Same TDD expectations as the rest of this codebase. In particular: `computeBinderPages` (pagination, truncation at capacity, both fill directions) and the insert-blank list operation (including the "an existing blank also shifts" case) are pure-function logic, straightforward to test exhaustively without any DOM rendering. Drag-and-drop and hover-preview behavior get component-level tests using Testing Library, following the patterns already established in `Picker.test.tsx`/`DexGrid.test.tsx`.

## Non-goals

- Per-language or per-card-variant binder positions. A binder slot is tied to a dex number, not a specific `CardRecord` id — same granularity as the rest of the app's ownership model.
- Automatic reconciliation of a custom order against newly-available Pokemon. Once customized, new Pokemon becoming available (e.g. a new set releasing, or the user selecting a new generation) do not automatically insert themselves into the custom sequence. The user can always hit "Reset arrangement" to fall back to the live default, or manually place the new entries themselves. Silently auto-inserting into a hand-arranged sequence risks moving cards the user deliberately placed, which is worse than requiring an explicit reset.
- Multiple independent binders, or per-binder-page metadata (labels, notes). One binder configuration per user/project, matching how every other view-level setting in this app works today.
- A print/export-to-PDF view of the binder. Out of scope; the binder is an on-screen browsing layout only.
