# Show All Cards and Promo Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see every printed card for a Pokemon (not just curated full/special-art rarities) from inside that Pokemon's picker, and let them permanently classify any specific card (most usefully a promo, since TCGdex tags every promo with the same generic `"Promo"` rarity string regardless of how it looks) into one of their rarity groups.

**Architecture:** Two independent but complementary additions on top of the already-shipped app. (1) A new on-demand fetch path (`fetchAllCardsForDex` in the API client, `loadAllPrintingsForDex` in the data-loading layer) that pulls a Pokemon's complete, unfiltered print history and caches it the same way curated data already is, triggered lazily the first time a picker's "Show all cards" toggle is switched on. (2) A new piece of user data, `cardOverrides` (a card id to group id map), that lets `availableCardsForDex` treat a specific card as belonging to a group regardless of its raw rarity string, wired through every place that already computes availability (the grid, the picker, the Summary tab), plus a small UI control in the picker to set it.

**Tech Stack:** Same as the rest of the app: React + TypeScript + Vite, Zustand + persist, Vitest + Testing Library, the existing TCGdex API client conventions.

---

## Task 1: Store, export/import, and seed data for card overrides

**Files:**
- Create: `src/data/defaultCardOverrides.ts`
- Create: `src/data/defaultCardOverrides.test.ts`
- Modify: `src/state/store.ts`
- Modify: `src/state/store.test.ts`
- Modify: `src/state/exportImport.ts`
- Modify: `src/state/exportImport.test.ts`

- [ ] **Step 1: Write the failing test `src/data/defaultCardOverrides.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CARD_OVERRIDES } from './defaultCardOverrides';
import { DEFAULT_RARITY_GROUPS } from './defaultRarityGroups';

describe('DEFAULT_CARD_OVERRIDES', () => {
  it('only points at group ids that actually exist in the default rarity groups', () => {
    const validIds = new Set(DEFAULT_RARITY_GROUPS.map((g) => g.id));
    for (const groupId of Object.values(DEFAULT_CARD_OVERRIDES)) {
      expect(validIds.has(groupId)).toBe(true);
    }
  });

  it('classifies the Charmander Obsidian Flames ETB promo as full art', () => {
    expect(DEFAULT_CARD_OVERRIDES['svp-044']).toBe('full-art');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- defaultCardOverrides
```
Expected: FAIL, `Cannot find module './defaultCardOverrides'`.

- [ ] **Step 3: Write `src/data/defaultCardOverrides.ts`**

```ts
// TCGdex tags every promo card with the single generic rarity string
// "Promo", regardless of whether it's a plain reprint or a genuine
// full-bleed illustration card. There is no reliable, machine-checkable
// signal (rarity string, card stage, name pattern) that predicts which is
// which, confirmed by directly comparing a rule-box VMAX promo against
// svp-044 (an ordinary Basic-stage Charmander promo that turned out, on
// visual inspection, to be genuinely full art) during the investigation
// that added this file. Card stage and name pattern both failed to predict
// it. So this list is a hand-verified, growing set of specific card ids
// mapped directly to a rarity group id, checked by actually looking at the
// artwork, not derived from any field TCGdex exposes.
//
// This is a starting point, not an attempt at completeness: the promo
// catalog spans decades and hundreds of cards across just Gen 1, let alone
// every generation this app may eventually cover. Add to this list as more
// cards are verified, or classify a card per-user from the picker's own
// "Classify as" control (Task 6 in this plan), which writes to the same
// kind of card id -> group id mapping in the user's own persisted state and
// takes precedence over this file's defaults.
export const DEFAULT_CARD_OVERRIDES: Record<string, string> = {
  // Charmander, SVP Black Star Promos #044 (Obsidian Flames ETB promo).
  // Verified full-bleed illustration: Charmander in a window scene with
  // flowers and a bird, artwork extending to the card's edges, not confined
  // to a framed artwork window. Ordinary Basic-stage Pokemon, no V/VMAX/
  // VSTAR/ex/GX suffix, which is exactly why a stage- or name-based
  // heuristic would have missed it.
  'svp-044': 'full-art',
};
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- defaultCardOverrides
```
Expected: 2 passed.

- [ ] **Step 5: Write the new/changed tests in `src/state/store.test.ts`**

Add this import alongside the existing ones at the top of the file:

```ts
import { DEFAULT_CARD_OVERRIDES } from '../data/defaultCardOverrides';
```

Add `cardOverrides: {}` to the `resetStore()` fixture's `useAppStore.setState({...})` call (so every existing test starts from a clean, empty override map rather than the real seeded defaults, keeping existing tests' behavior unchanged):

```ts
function resetStore() {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    cardOverrides: {},
    hasUnsavedChanges: false,
  });
}
```

Add these new `describe` blocks anywhere after `resetStore` (e.g. right after the `bumpPriceVersion` block):

```ts
describe('setCardOverride', () => {
  it('assigns a card to a group, overriding its raw rarity', () => {
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    expect(useAppStore.getState().cardOverrides['svp-044']).toBe('full-art');
  });

  it('clears an override when passed null', () => {
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    useAppStore.getState().setCardOverride('svp-044', null);
    expect(useAppStore.getState().cardOverrides['svp-044']).toBeUndefined();
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});
```

Extend the existing `replaceUserData` describe block's first test (`'overwrites the full user data slice, including selectedGenerations'`) to also cover `cardOverrides`, by changing it to:

```ts
describe('replaceUserData', () => {
  it('overwrites the full user data slice, including selectedGenerations and cardOverrides', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: { 'other-card': 'rainbow-gold' },
    });
    const state = useAppStore.getState();
    expect(state.language).toBe('ja');
    expect(state.currency).toBe('EUR');
    expect(state.owned[6]).toBeUndefined();
    expect(state.cardOverrides).toEqual({ 'other-card': 'rainbow-gold' });
  });

  it('resets hasUnsavedChanges to false, regardless of what was pending before', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
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
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });

  it('running a mutator right after replaceUserData correctly flips hasUnsavedChanges back on', () => {
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
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});
```

(This replaces the existing `describe('replaceUserData', ...)` block wholesale, the first test's name changes and body changes, the second and third tests just gain `cardOverrides: {}` on their `replaceUserData` payloads.)

- [ ] **Step 6: Run the test to see it fail**

Run:
```bash
npm run test -- store.test
```
Expected: FAIL, `setCardOverride` is not a function, and the `replaceUserData` calls are missing a required `cardOverrides` field once the type changes in the next step (TypeScript will also flag this at typecheck time once Step 7 lands; for now, at this point in the TDD cycle, the test fails at runtime with "setCardOverride is not a function").

- [ ] **Step 7: Modify `src/state/store.ts`**

Add the import at the top:

```ts
import { DEFAULT_CARD_OVERRIDES } from '../data/defaultCardOverrides';
```

Add `cardOverrides: Record<string, string>;` to the `ExportedUserData` interface, right after `selectedGenerations: number[];`:

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
}
```

Add `cardOverrides: Record<string, string>;` and `setCardOverride: (cardId: string, groupId: string | null) => void;` to the `AppState` interface, right after `selectedGenerations: number[];` and right after `toggleGeneration: (id: number) => void;` respectively:

```ts
export interface AppState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  cardOverrides: Record<string, string>;
  hasUnsavedChanges: boolean;

  setLanguage: (language: string) => void;
  setCurrency: (currency: Currency) => void;
  toggleActiveGroup: (groupId: string) => void;
  setGroups: (groups: RarityGroup[]) => void;
  toggleGeneration: (id: number) => void;
  setCardOverride: (cardId: string, groupId: string | null) => void;

  markOwned: (dexNumber: number, cardId: string, condition: Condition) => void;
  unmarkOwned: (dexNumber: number) => void;

  toggleWishlist: (dexNumber: number, cardId: string) => ToggleWishlistResult;
  removeWishlist: (dexNumber: number) => void;

  priceVersion: number;
  bumpPriceVersion: () => void;

  markChangesSaved: () => void;
  replaceUserData: (data: ExportedUserData) => void;
}
```

In the store creator, add `cardOverrides: DEFAULT_CARD_OVERRIDES,` right after `selectedGenerations: [1],`:

```ts
      selectedGenerations: [1],
      cardOverrides: DEFAULT_CARD_OVERRIDES,
      priceVersion: 0,
      hasUnsavedChanges: false,
```

Add the `setCardOverride` action, right after `toggleGeneration`:

```ts
      setCardOverride: (cardId, groupId) =>
        set((state) => {
          const cardOverrides = { ...state.cardOverrides };
          if (groupId === null) {
            delete cardOverrides[cardId];
          } else {
            cardOverrides[cardId] = groupId;
          }
          return { cardOverrides, hasUnsavedChanges: true };
        }),
```

Add `cardOverrides: data.cardOverrides,` to `replaceUserData`'s `set({...})` call, right after `selectedGenerations: data.selectedGenerations,`:

```ts
      replaceUserData: (data) =>
        set({
          language: data.language,
          currency: data.currency,
          activeGroupIds: data.activeGroupIds,
          groups: data.groups,
          owned: data.owned,
          wishlist: data.wishlist,
          selectedGenerations: data.selectedGenerations,
          cardOverrides: data.cardOverrides,
          hasUnsavedChanges: false,
        }),
```

Add `cardOverrides: state.cardOverrides,` to `partialize`'s returned object, right after `selectedGenerations: state.selectedGenerations,`:

```ts
      partialize: (state) => ({
        language: state.language,
        currency: state.currency,
        activeGroupIds: state.activeGroupIds,
        groups: state.groups,
        owned: state.owned,
        wishlist: state.wishlist,
        selectedGenerations: state.selectedGenerations,
        cardOverrides: state.cardOverrides,
        hasUnsavedChanges: state.hasUnsavedChanges,
      }),
```

- [ ] **Step 8: Run the test to see it pass**

Run:
```bash
npm run test -- store.test
```
Expected: all tests in this file passed (the pre-existing ones plus the 3 new `setCardOverride` tests).

- [ ] **Step 9: Write the new/changed tests in `src/state/exportImport.test.ts`**

Read the current file first. Add `cardOverrides: {}` to the `baseState` object (it's used to build `buildExportPayload`'s input across several tests):

```ts
const baseState = {
  language: 'en',
  currency: 'USD' as const,
  activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
  groups: DEFAULT_RARITY_GROUPS,
  owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint' as const, addedAt: '' } },
  wishlist: {},
  selectedGenerations: [1],
  cardOverrides: { 'svp-044': 'full-art' },
};
```

Add an assertion to the existing `buildExportPayload` test:

```ts
describe('buildExportPayload', () => {
  it('includes only user-generated data with a version number', () => {
    const payload = buildExportPayload(baseState);
    expect(payload.version).toBe(1);
    expect(payload.owned).toEqual(baseState.owned);
    expect(payload.groups).toEqual(DEFAULT_RARITY_GROUPS);
    expect(payload.selectedGenerations).toEqual([1]);
    expect(payload.cardOverrides).toEqual({ 'svp-044': 'full-art' });
  });
});
```

Add two new tests to the `describe('parseImportPayload', ...)` block, alongside the existing ones:

```ts
  it('defaults cardOverrides to an empty object for a backup exported before this feature existed', () => {
    const preFeaturePayload = {
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      // no cardOverrides key at all, matching a real pre-feature export file
    };
    const parsed = parseImportPayload(JSON.stringify(preFeaturePayload));
    expect(parsed.cardOverrides).toEqual({});
  });

  it('throws when cardOverrides is present but not a plain object of strings', () => {
    const badPayload = { ...baseState, version: 1, cardOverrides: { 'svp-044': 42 } };
    expect(() => parseImportPayload(JSON.stringify(badPayload))).toThrow(
      'This file does not look like a valid export.'
    );
  });
```

- [ ] **Step 10: Run the test to see it fail**

Run:
```bash
npm run test -- exportImport.test
```
Expected: FAIL, `buildExportPayload`'s result has no `cardOverrides` key yet, and `parseImportPayload` doesn't default or validate it yet.

- [ ] **Step 11: Modify `src/state/exportImport.ts`**

Add `cardOverrides: Record<string, string>;` to `ExportableState`, right after `selectedGenerations: number[];`:

```ts
export interface ExportableState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  cardOverrides: Record<string, string>;
}
```

Add `cardOverrides: state.cardOverrides,` to `buildExportPayload`'s returned object, right after `selectedGenerations: state.selectedGenerations,`:

```ts
export function buildExportPayload(state: ExportableState): ExportedUserData {
  return {
    version: 1,
    language: state.language,
    currency: state.currency,
    activeGroupIds: state.activeGroupIds,
    groups: state.groups,
    owned: state.owned,
    wishlist: state.wishlist,
    selectedGenerations: state.selectedGenerations,
    cardOverrides: state.cardOverrides,
  };
}
```

Add a new helper function, right after `isValidGroups`:

```ts
function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'string');
}
```

In `parseImportPayload`, add a validation branch for `cardOverrides` right after the `selectedGenerations` backward-compatibility block, and before the final `return data as ExportedUserData;`:

```ts
  // Backups exported before this feature existed predate this field
  // entirely. Default to an empty map rather than reject an otherwise-valid
  // older backup, same precedent as selectedGenerations above. If the field
  // IS present, it must actually be a card id -> group id string map, not
  // some other shape, this is a plain user-data mapping with no further
  // downstream guard, same reasoning as the other shape checks above.
  if (data.cardOverrides === undefined) {
    data.cardOverrides = {};
  } else if (!isStringRecord(data.cardOverrides)) {
    throw new Error('This file does not look like a valid export.');
  }
```

- [ ] **Step 12: Run the test to see it pass**

Run:
```bash
npm run test -- exportImport.test
```
Expected: all tests passed.

- [ ] **Step 13: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass. Some other test files that seed the store directly with `useAppStore.setState({...})` (e.g. `DexGrid.test.tsx`, `FilterBar.test.tsx`, `ManageGroupsPanel.test.tsx`, `CollectionTable.test.tsx`, `WishlistTable.test.tsx`, `Summary.test.tsx`, `ExportImportControls.test.tsx`, `StartScreen.test.tsx`, `App.test.tsx`) do NOT set `cardOverrides` in their fixtures, since it's a new field with a real default value (`DEFAULT_CARD_OVERRIDES`, not `{}`) baked into the store's initial state, and `useAppStore.setState({...})` in each of those tests only overwrites the keys it explicitly lists, `cardOverrides` will keep whatever value it already had (either the real seeded default, or whatever a previous test in the same file left behind, since Zustand state persists across `setState` calls within a test file unless a test explicitly resets it). This is very unlikely to break any of those tests' assertions, since none of them currently reference `cardOverrides`, `svp-044`, or dex number 4 (Charmander) in a way the seeded default could interfere with, but run the full suite and confirm this empirically rather than assuming it. If any test unexpectedly fails, investigate the actual interference rather than blindly adding `cardOverrides: {}` everywhere.

- [ ] **Step 14: Commit**

```bash
git add src/data/defaultCardOverrides.ts src/data/defaultCardOverrides.test.ts src/state/store.ts src/state/store.test.ts src/state/exportImport.ts src/state/exportImport.test.ts
git commit -m "Add per-card rarity group overrides to user data, export/import, and a seed example"
```

---

## Task 2: Extend availableCardsForDex to honor card overrides

**Files:**
- Modify: `src/state/selectors.ts`
- Modify: `src/state/selectors.test.ts`

- [ ] **Step 1: Write the new/changed tests in `src/state/selectors.test.ts`**

Add these tests to the existing `describe('availableCardsForDex', ...)` block, alongside the existing one:

```ts
describe('availableCardsForDex', () => {
  it('filters cards to only those in the active rarity set', () => {
    const set = activeRarities(groups, ['a']);
    const result = availableCardsForDex(cards, set);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('includes a card via a manual override into an active group, even when its raw rarity would not match', () => {
    const set = activeRarities(groups, ['a']);
    const promoCard: CardRecord = { ...cards[1], id: '3', rarity: 'Promo' };
    const result = availableCardsForDex([...cards, promoCard], set, { '3': 'a' }, ['a']);
    expect(result.map((c) => c.id).sort()).toEqual(['1', '3']);
  });

  it('excludes a card via a manual override into a group that is not active, even when its raw rarity would match', () => {
    const set = activeRarities(groups, ['a']);
    // cards[0] has rarity 'Ultra Rare', which matches group 'a' (active).
    // The override reassigns it to group 'b', which is NOT active here.
    const result = availableCardsForDex(cards, set, { [cards[0].id]: 'b' }, ['a']);
    expect(result).toHaveLength(0);
  });

  it('falls back to raw rarity matching when no override is given', () => {
    const set = activeRarities(groups, ['a']);
    const result = availableCardsForDex(cards, set, {}, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- selectors.test
```
Expected: FAIL, `Expected 2 arguments, but got 4` (a TypeScript error at the call sites using the new 4-argument form) or, if TypeScript doesn't block the test run, a runtime assertion failure since the override cases aren't honored yet.

- [ ] **Step 3: Modify `src/state/selectors.ts`**

Replace `availableCardsForDex` with:

```ts
export function availableCardsForDex(
  allCards: CardRecord[],
  activeSet: Set<string>,
  overrides: Record<string, string> = {},
  activeGroupIds: string[] = []
): CardRecord[] {
  return allCards.filter((card) => {
    const overrideGroupId = overrides[card.id];
    if (overrideGroupId !== undefined) {
      return activeGroupIds.includes(overrideGroupId);
    }
    return activeSet.has(card.rarity);
  });
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- selectors.test
```
Expected: all tests passed (5 total: the 1 pre-existing `availableCardsForDex` test plus the 4 above, plus `activeRarities`'s and `computeTileState`'s pre-existing tests untouched).

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass. The new parameters have defaults, so every existing 2-argument call site (`DexGrid.tsx`, `Summary.tsx`, as they currently stand before Task 5 of this plan updates them) continues to compile and behave exactly as before.

- [ ] **Step 6: Commit**

```bash
git add src/state/selectors.ts src/state/selectors.test.ts
git commit -m "Let availableCardsForDex honor per-card group overrides"
```

---

## Task 3: TCGdex client: fetch a Pokemon's complete, unfiltered card list

**Files:**
- Modify: `src/api/tcgdex.ts`
- Modify: `src/api/tcgdex.test.ts`

- [ ] **Step 1: Write the new tests in `src/api/tcgdex.test.ts`**

Add `fetchAllCardsForDex` to the existing import list at the top of the file:

```ts
import {
  cardImageUrl,
  deriveSetId,
  extractCardmarketAvgPrice,
  extractTcgplayerMarketPrice,
  fetchAllCardsForDex,
  fetchCardDetail,
  fetchCardsForDexAndRarity,
  fetchSets,
} from './tcgdex';
```

Add a new `describe` block, e.g. right after the existing `describe('fetchCardsForDexAndRarity', ...)` block:

```ts
describe('fetchAllCardsForDex', () => {
  it('queries dexId with no rarity filter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await fetchAllCardsForDex(4, 'en', fetchImpl);
    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/v2/en/cards');
    expect(calledUrl.searchParams.get('dexId')).toBe('eq:4');
    expect(calledUrl.searchParams.has('rarity')).toBe(false);
  });

  it('filters out Pokemon TCG Pocket cards by image path, same as the per-rarity fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'svp-044', localId: '044', name: 'Charmander', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
        { id: 'A1a-086', localId: '086', name: 'Mew ex', image: 'https://assets.tcgdex.net/en/tcgp/A1a/086' },
      ])
    );
    const cards = await fetchAllCardsForDex(4, 'en', fetchImpl);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('svp-044');
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchAllCardsForDex(4, 'en', fetchImpl)).rejects.toThrow(
      'TCGdex request failed with status 500'
    );
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- tcgdex.test
```
Expected: FAIL, `fetchAllCardsForDex is not a function` (or a module-export error).

- [ ] **Step 3: Modify `src/api/tcgdex.ts`**

Add this function right after `fetchCardsForDexAndRarity`:

```ts
export async function fetchAllCardsForDex(
  dexNumber: number,
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexCardBrief[]> {
  const url = new URL(`${TCGDEX_BASE}/${language}/cards`);
  url.searchParams.set('dexId', `eq:${dexNumber}`);
  const res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  const cards: TcgdexCardBrief[] = await res.json();
  return cards.filter((card) => !isPocketCard(card));
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- tcgdex.test
```
Expected: all tests passed.

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/tcgdex.ts src/api/tcgdex.test.ts
git commit -m "Add fetchAllCardsForDex for an unfiltered per-Pokemon card list"
```

---

## Task 4: Load and cache a Pokemon's complete print history on demand

**Files:**
- Modify: `src/state/loadCardData.ts`
- Modify: `src/state/loadCardData.test.ts`

- [ ] **Step 1: Write the new test in `src/state/loadCardData.test.ts`**

Add `loadAllPrintingsForDex` to the existing import:

```ts
import { getAllCachedCardsForDex, loadAllCardData, loadAllPrintingsForDex } from './loadCardData';
```

Add a new `describe` block, e.g. after the existing `describe('loadAllCardData', ...)` block:

```ts
describe('loadAllPrintingsForDex', () => {
  it('fetches the full unfiltered card list, backfills rarity and set name per card via a detail lookup, and caches the result', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      if (url.includes('dexId=eq%3A4') || url.includes('dexId=eq:4')) {
        return jsonResponse([
          {
            id: 'svp-044',
            localId: '044',
            name: 'Charmander',
            image: 'https://assets.tcgdex.net/en/sv/svp/044',
          },
        ]);
      }
      return jsonResponse([]);
    });

    const result = await loadAllPrintingsForDex('en', 4, fetchImpl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'svp-044',
      dexNumber: 4,
      setId: 'svp',
      setName: 'SVP Black Star Promos',
      rarity: 'Promo',
      language: 'en',
    });
    expect(getAllCachedCardsForDex('en', 4)).toEqual(result);
  });

  it('caches an empty array when a Pokemon has no cards at all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const result = await loadAllPrintingsForDex('en', 999, fetchImpl);
    expect(result).toEqual([]);
    expect(getAllCachedCardsForDex('en', 999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- loadCardData.test
```
Expected: FAIL, `loadAllPrintingsForDex is not a function`.

- [ ] **Step 3: Modify `src/state/loadCardData.ts`**

Change the import line at the top from:

```ts
import { deriveSetId, fetchCardsForDexAndRarity, fetchSets } from '../api/tcgdex';
```

to:

```ts
import { deriveSetId, fetchAllCardsForDex, fetchCardDetail, fetchCardsForDexAndRarity, fetchSets } from '../api/tcgdex';
```

Add this function at the end of the file, after `getAllCachedCardsForDex`:

```ts
export async function loadAllPrintingsForDex(
  language: string,
  dexNumber: number,
  fetchImpl: typeof fetch = fetch
): Promise<CardRecord[]> {
  const briefs = await fetchAllCardsForDex(dexNumber, language, fetchImpl);
  const cards: CardRecord[] = [];
  for (const brief of briefs) {
    // Unlike loadAllCardData above, this doesn't need a separate fetchSets
    // call for a name lookup: the per-card detail response already carries
    // the correct set name directly (detail.set.name), since a full detail
    // fetch is already required here to get each card's rarity (the list
    // endpoint queried by fetchAllCardsForDex omits rarity entirely).
    const detail = await fetchCardDetail(brief.id, language, fetchImpl);
    const setId = deriveSetId(brief.id, brief.localId);
    cards.push({
      id: brief.id,
      name: brief.name,
      dexNumber,
      setId,
      setName: detail.set.name,
      localId: brief.localId,
      rarity: detail.rarity ?? 'Unknown',
      imageBase: brief.image ?? '',
      language,
    });
  }
  setCachedCards(language, dexNumber, cards);
  return cards;
}
```

Note: `setCachedCards` overwrites whatever was previously cached for `(language, dexNumber)`. This is safe and intentional here. The unfiltered fetch this function performs is always a superset of whatever a prior curated (per-rarity) fetch would have cached for the same dex number and language, so nothing is lost by replacing rather than merging.

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- loadCardData.test
```
Expected: all tests passed (the pre-existing `loadAllCardData` tests plus the 2 new `loadAllPrintingsForDex` tests).

- [ ] **Step 5: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/state/loadCardData.ts src/state/loadCardData.test.ts
git commit -m "Add loadAllPrintingsForDex to fetch and cache a Pokemon's complete print history"
```

---

## Task 5: Wire card overrides into DexGrid and Summary availability

**Files:**
- Modify: `src/components/DexGrid.tsx`
- Modify: `src/components/DexGrid.test.tsx`
- Modify: `src/components/Summary.tsx`
- Modify: `src/components/Summary.test.tsx`

- [ ] **Step 1: Write the new test in `src/components/DexGrid.test.tsx`**

Read the current file first (it has evolved through several review cycles; the exact current shape of its `beforeEach`/mocked `fetch` matters for writing a test that fits in cleanly). Add a new test to the `describe('DexGrid', ...)` block that exercises a card-override end to end:

```ts
  it('colors a tile as available when its only matching card comes from a manual override, not its raw rarity', async () => {
    useAppStore.setState({
      cardOverrides: { 'sv03.5-199': 'full-art' },
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/sets')) {
          return jsonResponse([{ id: 'sv03.5', name: '151' }]);
        }
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          // Deliberately a rarity that would NOT match 'full-art' on its own
          // (e.g. it's really 'Promo'), so this tile is only available
          // because of the override set above, not because of its raw
          // rarity string.
          return jsonResponse([
            {
              id: 'sv03.5-199',
              localId: '199',
              name: 'Charizard ex',
              image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
            },
          ]);
        }
        return jsonResponse([]);
      })
    );
    render(<DexGrid />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
  });
```

Note: this test's `fetch` mock returns the card unconditionally for `dexId=eq:6` regardless of rarity, exactly like the existing top-of-file mock already does (that mock doesn't actually vary its response by the `rarity` query param either, it just returns the Charizard card brief for any `dexId=eq:6` request, which the real per-rarity fetch loop calls once per curated rarity). The point of this test is that the tile is available even though `cardOverrides` is the ONLY thing that could make it so, since the fixture's rarity value assigned by `loadAllCardData` here is whatever curated rarity happened to trigger the fetch, not `'full-art'` itself directly, reason through the existing top-of-file mock and `DEFAULT_RARITY_GROUPS` to confirm this card's resulting cached `rarity` is not itself `'Ultra Rare'` (the actual `'full-art'` group's own seeded rarity), and adjust the fixture if needed so the test is a genuine proof that the override, not a rarity-string coincidence, is what makes the tile available. If the existing mock's simplicity makes this hard to prove cleanly, it's acceptable to mock a URL that only responds to a rarity OTHER than any of `DEFAULT_RARITY_GROUPS`' seeded strings (e.g. `Secret Rare`, which does exist in `rainbow-gold`, so instead use something that matches no default group at all, such as never returning this card for any of the curated per-rarity URLs, and only include it via a distinct fetch path), use your judgment to make the test airtight, but do not skip verifying this reasoning.

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- DexGrid.test
```
Expected: FAIL, the tile is not colored available, since `DexGrid.tsx` doesn't pass overrides into `availableCardsForDex` yet.

- [ ] **Step 3: Modify `src/components/DexGrid.tsx`**

Add `const cardOverrides = useAppStore((s) => s.cardOverrides);` right after the existing `const owned = useAppStore((s) => s.owned);` line.

Change the `openCards` computation from:

```ts
  const openCards = openEntry
    ? availableCardsForDex(cardsByDexNumber.get(openEntry.number) ?? [], activeSet)
    : [];
```

to:

```ts
  const openCards = openEntry
    ? availableCardsForDex(
        cardsByDexNumber.get(openEntry.number) ?? [],
        activeSet,
        cardOverrides,
        activeGroupIds
      )
    : [];
```

Change the tile-map's `cards` computation from:

```ts
            const cards = availableCardsForDex(allCards, activeSet);
```

to:

```ts
            const cards = availableCardsForDex(allCards, activeSet, cardOverrides, activeGroupIds);
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- DexGrid.test
```
Expected: all tests passed (the pre-existing ones plus the new override test).

- [ ] **Step 5: Write the new test in `src/components/Summary.test.tsx`**

Read the current file first. Add a new test to the `describe('Summary', ...)` block, alongside the existing 6:

```ts
  it('counts a Pokemon toward availability when its only matching card comes from a manual override', () => {
    useAppStore.setState({
      cardOverrides: { 'swsh35-74': 'full-art' },
    });
    render(<Summary />);
    expect(screen.getByText(/2 of 2 pok.mon with an available card/i)).toBeInTheDocument();
  });
```

Note: read the existing `beforeEach` fixture carefully first, it already caches `pikachuCard` (dex 25, `swsh35-74`, `rarity: 'Ultra Rare'`) which already matches the default `full-art` group on its own raw rarity, same as `charizardCard`. To make this test a genuine proof that the override path works (not just a coincidence of the fixture's existing rarity), either add a THIRD Pokemon to the fixture whose only cached card has a rarity that matches nothing by default, and assert availability rises specifically because of an override on that card, or change `pikachuCard`'s fixture `rarity` to something outside every default group (e.g. `'Promo'`) before this test runs, then confirm availability still reads 2 of 2 only when the override is set (and would read 1 of 2 without it, if you want an explicit negative-case test too). Use your judgment on the exact fixture shape, but make sure the test would actually fail if `Summary.tsx` didn't pass `cardOverrides` through, not just happen to pass regardless.

- [ ] **Step 6: Run the test to see it fail**

Run:
```bash
npm run test -- Summary.test
```
Expected: FAIL (or, if you adjusted the fixture per the note above so the raw rarity no longer matches on its own, the count is 1 of 2 instead of the expected 2 of 2).

- [ ] **Step 7: Modify `src/components/Summary.tsx`**

Add `const cardOverrides = useAppStore((s) => s.cardOverrides);` right after the existing `const activeGroupIds = useAppStore((s) => s.activeGroupIds);` line.

Change the `availableCount` memo from:

```ts
  const availableCount = useMemo(
    () =>
      dexEntries.filter(
        (entry) =>
          availableCardsForDex(getAllCachedCardsForDex(language, entry.number), activeSet)
            .length > 0
      ).length,
    [language, dexEntries, activeSet]
  );
```

to:

```ts
  const availableCount = useMemo(
    () =>
      dexEntries.filter(
        (entry) =>
          availableCardsForDex(
            getAllCachedCardsForDex(language, entry.number),
            activeSet,
            cardOverrides,
            activeGroupIds
          ).length > 0
      ).length,
    [language, dexEntries, activeSet, cardOverrides, activeGroupIds]
  );
```

- [ ] **Step 8: Run the test to see it pass**

Run:
```bash
npm run test -- Summary.test
```
Expected: all tests passed.

- [ ] **Step 9: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/DexGrid.tsx src/components/DexGrid.test.tsx src/components/Summary.tsx src/components/Summary.test.tsx
git commit -m "Make DexGrid and Summary availability honor per-card group overrides"
```

---

## Task 6: Picker "Show all cards" toggle with rarity labels

**Files:**
- Modify: `src/components/Picker.tsx`
- Modify: `src/components/Picker.test.tsx`
- Modify: `src/components/Picker.module.css`

- [ ] **Step 1: Write the new tests in `src/components/Picker.test.tsx`**

Read the current file first (shown in full above). Add `vi.stubGlobal`/`vi.unstubAllGlobals` scaffolding and new tests. Change the top of the file to add an `afterEach` and a `jsonResponse` helper:

```ts
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { CardRecord } from '../types';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
```

(add `waitFor` to the existing `@testing-library/react` import, add `afterEach` to the existing `vitest` import, add the `jsonResponse` helper, keep everything else in the current import block as-is).

Add `afterEach(() => { vi.unstubAllGlobals(); });` right after the existing `beforeEach(() => { resetStore(); });` block.

Add these tests to the `describe('Picker', ...)` block, alongside the existing 4:

```ts
  it('shows a "Show all cards" toggle that is off by default', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /show all cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('fetches and shows every printed card, including ones outside the curated view, when toggled on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/cards/svp-044')) {
          return jsonResponse({
            id: 'svp-044',
            localId: '044',
            name: 'Charizard',
            rarity: 'Promo',
            set: { id: 'svp', name: 'SVP Black Star Promos' },
          });
        }
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          return jsonResponse([
            { id: 'svp-044', localId: '044', name: 'Charizard', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
          ]);
        }
        return jsonResponse([]);
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.queryByAltText(/charizard from svp/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(await screen.findByAltText(/charizard from svp black star promos/i)).toBeInTheDocument();
    expect(screen.getByAltText(/charizard ex from 151/i)).toBeInTheDocument();
  });

  it('shows a loading state while the full print history is being fetched, then clears it', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          return new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          });
        }
        return Promise.resolve(jsonResponse([]));
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(screen.getByText(/loading all cards/i)).toBeInTheDocument();
    resolveFetch(jsonResponse([]));
    await waitFor(() => {
      expect(screen.queryByText(/loading all cards/i)).not.toBeInTheDocument();
    });
  });

  it('does not refetch on a second toggle-on once the full print history is already cached', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charizard',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return jsonResponse([
          { id: 'svp-044', localId: '044', name: 'Charizard', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
        ]);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchImpl);
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: /show all cards/i });
    await userEvent.click(toggle);
    await screen.findByAltText(/charizard from svp black star promos/i);
    const callsAfterFirstToggle = fetchImpl.mock.calls.length;
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirstToggle);
  });

  it('every shown card displays its rarity label', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByText(cardA.rarity)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- Picker.test
```
Expected: FAIL, no "Show all cards" button exists yet, and no rarity label is rendered yet.

- [ ] **Step 3: Modify `src/components/Picker.module.css`**

Add these rules, anywhere after the existing ones:

```css
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.rarity {
  font-size: 11px;
  opacity: 0.75;
}

.loading {
  font-size: 13px;
  opacity: 0.8;
  padding: 8px 0;
}
```

- [ ] **Step 4: Modify `src/components/Picker.tsx`**

Change the imports at the top from:

```ts
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import { useAppStore } from '../state/store';
import type { CardRecord, Condition } from '../types';
import { ConditionPicker } from './ConditionPicker';
import styles from './Picker.module.css';
```

to:

```ts
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import { loadAllPrintingsForDex } from '../state/loadCardData';
import { useAppStore } from '../state/store';
import type { CardRecord, Condition } from '../types';
import { ConditionPicker } from './ConditionPicker';
import styles from './Picker.module.css';
```

Add these store reads right after the existing `const toggleWishlist = useAppStore((s) => s.toggleWishlist);` line:

```ts
  const language = useAppStore((s) => s.language);
```

Add this new local state right after the existing `const [warning, setWarning] = useState<string | null>(null);` line:

```ts
  const [showAllCards, setShowAllCards] = useState(false);
  const [allCards, setAllCards] = useState<CardRecord[] | null>(null);
  const [isLoadingAllCards, setIsLoadingAllCards] = useState(false);
```

Add this handler right after `handleStarClick`:

```ts
  async function handleToggleShowAll() {
    const next = !showAllCards;
    setShowAllCards(next);
    if (next && allCards === null) {
      setIsLoadingAllCards(true);
      const fetched = await loadAllPrintingsForDex(language, dexNumber);
      setAllCards(fetched);
      setIsLoadingAllCards(false);
    }
  }
```

Change `const displayedCards = cards;`, actually, add this line right after the `handleToggleShowAll` function (there is no existing `displayedCards` variable, this introduces it):

```ts
  const displayedCards = showAllCards ? (allCards ?? []) : cards;
```

In the main (non-`pendingCard`) return branch, replace the toolbar-less header area to add a toolbar with the toggle button. Change:

```tsx
      <motion.div className={styles.panel} {...panelMotion}>
        <div className={styles.header}>
          <h2>{pokemonName}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {owned && (
```

to:

```tsx
      <motion.div className={styles.panel} {...panelMotion}>
        <div className={styles.header}>
          <h2>{pokemonName}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className={styles.toolbar}>
          <button
            type="button"
            aria-pressed={showAllCards}
            disabled={isLoadingAllCards}
            onClick={handleToggleShowAll}
          >
            {showAllCards ? 'Show curated cards' : 'Show all cards'}
          </button>
        </div>
        {isLoadingAllCards && <p className={styles.loading}>Loading all cards...</p>}
        {owned && (
```

Change the rest of the render logic from using `cards` to using `displayedCards`. Replace:

```tsx
        {cards.length === 0 ? (
          <p>No special or full art cards match your current filters for {pokemonName} yet.</p>
        ) : (
          <div className={styles.grid}>
            {cards.map((card) => {
```

to:

```tsx
        {!isLoadingAllCards && displayedCards.length === 0 ? (
          <p>
            {showAllCards
              ? `No cards are on record for ${pokemonName} yet.`
              : `No special or full art cards match your current filters for ${pokemonName} yet.`}
          </p>
        ) : (
          <div className={styles.grid}>
            {displayedCards.map((card) => {
```

Finally, add the rarity label into each card's rendered block. Change:

```tsx
                    <img
                      src={cardImageUrl(card.imageBase)}
                      alt={`${card.name} from ${card.setName}`}
                    />
                    <span>
                      {card.setName} #{card.localId}
                    </span>
                  </button>
                </div>
```

to:

```tsx
                    <img
                      src={cardImageUrl(card.imageBase)}
                      alt={`${card.name} from ${card.setName}`}
                    />
                    <span>
                      {card.setName} #{card.localId}
                    </span>
                    <span className={styles.rarity}>{card.rarity}</span>
                  </button>
                </div>
```

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- Picker.test
```
Expected: all tests passed (the pre-existing 4 plus the 5 new ones).

- [ ] **Step 6: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass. Pay attention to whether any other test that renders `Picker` (e.g. inside `DexGrid.test.tsx`) breaks because it now finds an unexpected extra "Show all cards" button when it queries by some other role/name, if so, tighten that test's query rather than removing the new button.

- [ ] **Step 7: Commit**

```bash
git add src/components/Picker.tsx src/components/Picker.test.tsx src/components/Picker.module.css
git commit -m "Add a Show all cards toggle to the picker, with rarity labels on every card"
```

---

## Task 7: Picker per-card classification control

**Files:**
- Modify: `src/components/Picker.tsx`
- Modify: `src/components/Picker.test.tsx`
- Modify: `src/components/Picker.module.css`

- [ ] **Step 1: Write the new tests in `src/components/Picker.test.tsx`**

Add these tests to the `describe('Picker', ...)` block:

```ts
  it('classifying a card assigns it to the chosen group, persisted in the store', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.selectOptions(
      screen.getByLabelText(`Classify ${cardA.name} as`),
      'rainbow-gold'
    );
    expect(useAppStore.getState().cardOverrides[cardA.id]).toBe('rainbow-gold');
  });

  it("defaults a card's classification select to its existing override, or to using its own rarity if none", () => {
    useAppStore.setState({ cardOverrides: { [cardA.id]: 'vintage-special' } });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />);
    expect(screen.getByLabelText(`Classify ${cardA.name} as`)).toHaveValue('vintage-special');
    const cardBSelects = screen.getAllByLabelText(`Classify ${cardB.name} as`);
    expect(cardBSelects[0]).toHaveValue('');
  });

  it('choosing "Use this card\'s own rarity" clears an existing override', async () => {
    useAppStore.setState({ cardOverrides: { [cardA.id]: 'vintage-special' } });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText(`Classify ${cardA.name} as`), '');
    expect(useAppStore.getState().cardOverrides[cardA.id]).toBeUndefined();
  });
```

Note: `cardB` in this file is defined as `{ ...cardA, id: 'sv03-223', setId: 'sv03', setName: 'Obsidian Flames', localId: '223' }`, it shares `cardA`'s `name` ("Charizard ex"), so `getByLabelText` for it is ambiguous when both `cardA` and `cardB` are rendered together; that's why the second test above uses `getAllByLabelText(...)[0]` and only asserts on the general "no override defaults to blank" case rather than distinguishing the two by name. If this proves awkward once actually running the test, consider giving the classify control's `aria-label` a more specific value than just the card's name (e.g. including `card.setName`/`card.localId`), and adjust these tests and the implementation together, use your judgment, but keep the label human-readable.

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- Picker.test
```
Expected: FAIL, no classification control exists yet.

- [ ] **Step 3: Modify `src/components/Picker.module.css`**

Add this rule:

```css
.classify {
  font-size: 11px;
}
```

- [ ] **Step 4: Modify `src/components/Picker.tsx`**

Add these store reads right after the existing `const language = useAppStore((s) => s.language);` line (added in Task 6):

```ts
  const groups = useAppStore((s) => s.groups);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const setCardOverride = useAppStore((s) => s.setCardOverride);
```

Change the card rendering block to add the classification `<select>` right after the rarity `<span>` added in Task 6. Change:

```tsx
                    <span>
                      {card.setName} #{card.localId}
                    </span>
                    <span className={styles.rarity}>{card.rarity}</span>
                  </button>
                </div>
```

to:

```tsx
                    <span>
                      {card.setName} #{card.localId}
                    </span>
                    <span className={styles.rarity}>{card.rarity}</span>
                  </button>
                  <select
                    className={styles.classify}
                    aria-label={`Classify ${card.name} as`}
                    value={cardOverrides[card.id] ?? ''}
                    onChange={(event) =>
                      setCardOverride(card.id, event.target.value === '' ? null : event.target.value)
                    }
                  >
                    <option value="">Use this card&apos;s own rarity</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
```

Note the `<select>` moved outside the `<button className={cardBodySelected/cardBody}>` element (it's a sibling of that button, still inside the same `<div className={styles.card}>` wrapper), since nesting an interactive `<select>` inside a `<button>` is invalid HTML. Double check the exact current JSX nesting when making this edit and adjust indentation/closing tags accordingly.

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- Picker.test
```
Expected: all tests passed.

- [ ] **Step 6: Run the full suite, typecheck, and lint**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass.

- [ ] **Step 7: Manually verify in a browser**

Run:
```bash
npm run dev
```
Open a Pokemon's picker (e.g. Charmander), click "Show all cards", confirm it loads (with a visible loading state) and shows the SVP-044 promo among the results with a "Promo" rarity label, confirm it is pre-classified as "Full Art" in its classify dropdown (from the Task 1 seed data), and confirm switching back to the curated view now shows it too, since "Full Art" is an active group by default. Confirm the main grid tile for Charmander reflects this (colored, not red, if this was previously the only qualifying card for Charmander). Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add src/components/Picker.tsx src/components/Picker.test.tsx src/components/Picker.module.css
git commit -m "Add per-card rarity group classification control to the picker"
```
