# Binder View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app shell full-width with a single left rail (title, tabs, and the Dex Grid's own filters/binder settings), fix three real binder-view bugs (broken page-flip animation, oversized/wrong-proportion slots, buried "Manual arrange"/"Keep empty" controls), make a binder page/spread genuinely fill the screen, add a zoom slider plus a "G" scroll-to-zoom mode, and let a "kept empty" slot hold a custom pan/zoom-cropped filler image.

**Architecture:** `view`/`isManualArrangeActive` state moves from `DexGrid` up to `App`, since the unified left rail (now rendering the app's title/tabs at its top and, only on the Dex Grid tab, the existing filter/view/binder-settings sections beneath) needs to read and drive them from outside `DexGrid`. `DexGrid` becomes a props-driven "just render the grid or binder, plus the Picker" component. Binder page/slot sizing moves from CSS `1fr` grid tracks (which silently overrides the intended 5:7 card aspect ratio) to a `ResizeObserver`-driven measured pixel size, computed by a pure, independently-testable function. A binder slot's "blank" entry gains an optional `customImage` (original image + pan/zoom crop transform, not a pre-cropped raster) so it can be re-cropped later and, in a future deferred feature, re-rendered at full print resolution.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, Framer Motion, CSS Modules. No new dependencies — the crop editor is built on a plain `<canvas>`, not a third-party cropping library.

---

### Task 1: Lift `view`/`isManualArrangeActive` state to `App`, merge title+tabs into `Sidebar`, de-center the app shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.module.css`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.module.css`
- Modify: `src/components/DexGrid.tsx`
- Modify: `src/components/DexGrid.module.css`
- Test: `src/App.test.tsx`
- Test: `src/components/Sidebar.test.tsx`
- Test: `src/components/DexGrid.test.tsx`

Today `App.tsx` renders a centered `max-width: 1120px` column containing a header (`<h1>` + Export/Import) and a tab nav, then mounts `DexGrid` (which renders its own `Sidebar` internally, containing filters/view-toggle/binder-settings). This task merges the app-level title+tabs into `Sidebar` itself (rendered once, at the `App` level, above `Sidebar`'s existing sections) so there's one continuous left rail instead of two separate boxes, and removes the centering so the rail sits flush against the real left edge with the main content filling the rest of the viewport.

- [ ] **Step 1: Write the failing test for Sidebar's new tab props**

```tsx
// src/components/Sidebar.test.tsx — add to the existing file, inside the top-level describe or as new top-level its; keep all existing tests as-is.
it('renders the app title and every tab, marking the active one pressed', () => {
  render(
    <Sidebar
      view="sprite"
      onSetView={() => {}}
      isLoading={false}
      onRefresh={() => {}}
      isManualArrangeActive={false}
      onToggleManualArrange={() => {}}
      activeTab="collection"
      tabs={[
        { id: 'grid', label: 'Dex Grid' },
        { id: 'collection', label: 'My Collection' },
      ]}
      onTabChange={() => {}}
      showDexGridControls={false}
    />
  );
  expect(screen.getByRole('heading', { name: "Collector's Ledger" })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dex Grid' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'My Collection' })).toHaveAttribute('aria-pressed', 'true');
});

it('calls onTabChange with the clicked tab id', async () => {
  const onTabChange = vi.fn();
  render(
    <Sidebar
      view="sprite"
      onSetView={() => {}}
      isLoading={false}
      onRefresh={() => {}}
      isManualArrangeActive={false}
      onToggleManualArrange={() => {}}
      activeTab="grid"
      tabs={[{ id: 'grid', label: 'Dex Grid' }, { id: 'collection', label: 'My Collection' }]}
      onTabChange={onTabChange}
      showDexGridControls
    />
  );
  await userEvent.click(screen.getByRole('button', { name: 'My Collection' }));
  expect(onTabChange).toHaveBeenCalledWith('collection');
});

it('hides the filter/view/binder-settings sections when showDexGridControls is false', () => {
  render(
    <Sidebar
      view="sprite"
      onSetView={() => {}}
      isLoading={false}
      onRefresh={() => {}}
      isManualArrangeActive={false}
      onToggleManualArrange={() => {}}
      activeTab="summary"
      tabs={[{ id: 'summary', label: 'Summary' }]}
      onTabChange={() => {}}
      showDexGridControls={false}
    />
  );
  expect(screen.queryByRole('button', { name: /sprite view/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /refresh data/i })).not.toBeInTheDocument();
});
```

Add `import userEvent from '@testing-library/user-event';` and `import { vi } from 'vitest';` to the top of `Sidebar.test.tsx` if not already imported (check the existing imports first — `vi` almost certainly already is, since the file already tests click handlers).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/Sidebar.test.tsx`
Expected: FAIL — `Sidebar` doesn't accept `activeTab`/`tabs`/`onTabChange`/`showDexGridControls` props yet, and renders no `<h1>` or tab buttons.

- [ ] **Step 3: Update `Sidebar.tsx`**

```tsx
// src/components/Sidebar.tsx — full new content
import { useState } from 'react';
import { BinderSettings } from './BinderSettings';
import { FilterBar } from './FilterBar';
import styles from './Sidebar.module.css';

export type DexView = 'sprite' | 'card' | 'binder';

export interface SidebarTab {
  id: string;
  label: string;
}

export interface SidebarProps {
  view: DexView;
  onSetView: (view: DexView) => void;
  isLoading: boolean;
  onRefresh: () => void;
  isManualArrangeActive: boolean;
  onToggleManualArrange: () => void;
  activeTab: string;
  tabs: SidebarTab[];
  onTabChange: (tabId: string) => void;
  // False on every tab except Dex Grid: the filters/view-toggle/binder-settings
  // sections only make sense while the Dex Grid is what's actually on screen.
  // The title and tab nav above them stay visible regardless -- they're the
  // one persistent piece of chrome every tab shares.
  showDexGridControls: boolean;
}

// The single left rail for the whole app: the title and tab nav (previously
// App.tsx's own centered header), plus -- only while the Dex Grid tab is
// active -- every control that affects what the Dex Grid shows (filters,
// view mode, refresh, and Binder Settings). Merging these into one component
// is what makes the rail read as one continuous panel flush against the left
// edge instead of two separate boxes stacked with a gap between them.
// Collapses to a thin strip so it doesn't have to compete with the grid for
// space once the user already knows what they want, and stays pinned via
// `position: sticky` so it's still reachable after scrolling down a long grid.
export function Sidebar({
  view,
  onSetView,
  isLoading,
  onRefresh,
  isManualArrangeActive,
  onToggleManualArrange,
  activeTab,
  tabs,
  onTabChange,
  showDexGridControls,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={[styles.sidebar, isCollapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}
      aria-label="App navigation and Dex Grid controls"
    >
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '»' : '«'}
      </button>
      {!isCollapsed && (
        <>
          <h1 className={styles.title}>Collector&apos;s Ledger</h1>

          <nav className={styles.tabs} data-tutorial="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={activeTab === tab.id}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {showDexGridControls && (
            <>
              <hr className={styles.divider} />

              <div data-tutorial="filter-bar">
                <FilterBar />
              </div>

              <hr className={styles.divider} />

              <fieldset className={styles.section}>
                <legend>View</legend>
                <div
                  className={styles.viewToggle}
                  role="radiogroup"
                  aria-label="View"
                  data-tutorial="view-toggle"
                >
                  <button
                    type="button"
                    aria-pressed={view === 'sprite'}
                    onClick={() => onSetView('sprite')}
                  >
                    Sprite view
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'card'}
                    onClick={() => onSetView('card')}
                  >
                    Card view
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'binder'}
                    onClick={() => onSetView('binder')}
                  >
                    Binder view
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  data-tutorial="refresh-data"
                >
                  {isLoading ? 'Refreshing...' : 'Refresh Data'}
                </button>
              </fieldset>

              {view === 'binder' && (
                <>
                  <hr className={styles.divider} />
                  <BinderSettings
                    isManualArrangeActive={isManualArrangeActive}
                    onToggleManualArrange={onToggleManualArrange}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Add the title style to `Sidebar.module.css`**

```css
/* src/components/Sidebar.module.css — add this rule; leave every existing rule in the file unchanged */
.title {
  font-size: var(--text-xl);
  letter-spacing: -0.01em;
}
```

- [ ] **Step 5: Run the Sidebar tests to verify they pass**

Run: `npm test -- src/components/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 6: Update `DexGrid.tsx` to become props-driven (no more local `view`/`isManualArrangeActive` state, no more rendering its own `Sidebar`)**

```tsx
// src/components/DexGrid.tsx — full new content
import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spriteUrl } from '../api/pokeapi';
import { entriesForGenerations } from '../data/generations';
import { loadAllCardData } from '../state/loadCardData';
import { activeRarities, availableCardsForDex, computeTileState } from '../state/selectors';
import { useAppStore } from '../state/store';
import { getCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';
import { BinderView } from './BinderView';
import { Picker } from './Picker';
import type { DexView } from './Sidebar';
import { Tile } from './Tile';
import styles from './DexGrid.module.css';

export interface DexGridProps {
  view: DexView;
  isManualArrangeActive: boolean;
}

export function DexGrid({ view, isManualArrangeActive }: DexGridProps) {
  const language = useAppStore((s) => s.language);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const owned = useAppStore((s) => s.owned);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);

  const [openDexNumber, setOpenDexNumber] = useState<number | null>(null);
  // Set alongside openDexNumber whenever a Picker is opened from a binder
  // slot, so the Picker fetches "Show all cards" in that binder's own
  // language rather than the app's global language. Cleared (back to
  // undefined) whenever a Picker is opened from the ordinary sprite/card
  // grid instead, so that path keeps using the global language exactly as
  // it always has.
  const [openPickerLanguage, setOpenPickerLanguage] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  const dataVersionBumpScheduled = useRef(false);
  function scheduleDataVersionBump() {
    if (dataVersionBumpScheduled.current) return;
    dataVersionBumpScheduled.current = true;
    requestAnimationFrame(() => {
      dataVersionBumpScheduled.current = false;
      setDataVersion((v) => v + 1);
    });
  }

  const loadGeneration = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (dexEntries.length === 0) return;
    const missingEntries = dexEntries.filter(
      (entry) => getCachedCards(language, entry.number) === undefined
    );
    if (missingEntries.length === 0) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadGeneration.current += 1;
    const thisGeneration = loadGeneration.current;

    setIsLoading(true);
    loadAllCardData(language, {
      dexEntries: missingEntries,
      signal: controller.signal,
      onDexLoaded: () => {
        if (loadGeneration.current !== thisGeneration) return;
        scheduleDataVersionBump();
      },
    }).finally(() => {
      if (loadGeneration.current !== thisGeneration) return;
      setIsLoading(false);
      setDataVersion((v) => v + 1);
    });
  }, [language, dexEntries]);

  async function handleRefreshData() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadGeneration.current += 1;
    const thisGeneration = loadGeneration.current;

    setIsLoading(true);
    await loadAllCardData(language, {
      dexEntries,
      signal: controller.signal,
      onDexLoaded: () => {
        if (loadGeneration.current !== thisGeneration) return;
        scheduleDataVersionBump();
      },
    });
    if (loadGeneration.current !== thisGeneration) return;
    setIsLoading(false);
    setDataVersion((v) => v + 1);
  }

  const activeSet = useMemo(
    () => activeRarities(groups, activeGroupIds),
    [groups, activeGroupIds]
  );

  const cardsByDexNumber = useMemo(() => {
    void dataVersion;
    const map = new Map<number, CardRecord[] | undefined>();
    for (const entry of dexEntries) {
      map.set(entry.number, getCachedCards(language, entry.number));
    }
    return map;
  }, [language, dexEntries, dataVersion]);

  const openEntry = openDexNumber ? dexEntries.find((e) => e.number === openDexNumber) : undefined;
  const effectivePickerLanguage = openPickerLanguage ?? language;
  const openCards = openEntry
    ? availableCardsForDex(
        getCachedCards(effectivePickerLanguage, openEntry.number) ?? [],
        activeSet,
        cardOverrides,
        activeGroupIds
      )
    : [];

  return (
    <div>
      {dexEntries.length === 0 ? (
        <p className={styles.emptyState}>
          Select at least one generation in the filter bar to see Pokémon here.
        </p>
      ) : view === 'binder' ? (
        <BinderView
          dexEntries={dexEntries}
          owned={owned}
          dataVersion={dataVersion}
          onSlotClick={(dexNumber, language) => {
            setOpenDexNumber(dexNumber);
            setOpenPickerLanguage(language);
          }}
          isManualArrangeActive={isManualArrangeActive}
        />
      ) : (
        <div className={styles.grid} data-version={dataVersion}>
          {dexEntries.map((entry) => {
            const hasLoaded = cardsByDexNumber.get(entry.number) !== undefined;
            const allCards = cardsByDexNumber.get(entry.number) ?? [];
            const cards = availableCardsForDex(allCards, activeSet, cardOverrides, activeGroupIds);
            const ownedRecord = owned[entry.number];
            const isLoadingDex = isLoading && !hasLoaded;
            const state = computeTileState(Boolean(ownedRecord), cards.length, isLoadingDex);
            const ownedCard = ownedRecord
              ? allCards.find((c) => c.id === ownedRecord.cardId)
              : undefined;
            return (
              <div key={entry.number} data-tutorial={entry.number === 1 ? 'first-tile' : undefined}>
                <Tile
                  dexNumber={entry.number}
                  name={entry.name}
                  spriteUrl={spriteUrl(entry.number)}
                  state={state}
                  view={view}
                  ownedCardImageBase={ownedCard?.imageBase}
                  onClick={() => {
                    setOpenDexNumber(entry.number);
                    setOpenPickerLanguage(undefined);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      <AnimatePresence mode="wait">
        {openEntry && (
          <Picker
            key={openEntry.number}
            dexNumber={openEntry.number}
            pokemonName={openEntry.name}
            cards={openCards}
            onClose={() => setOpenDexNumber(null)}
            onAllCardsLoaded={() => setDataVersion((v) => v + 1)}
            languageOverride={openPickerLanguage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

Note the removed `handleRefreshData`/`isLoading` are no longer reachable from outside `DexGrid` -- that's fine, `App.tsx` doesn't need them (they stay internal to `DexGrid`, driving its own auto-load effect exactly as before). Only `view`/`isManualArrangeActive` -- the two pieces of state `Sidebar` needs to read/drive from outside `DexGrid` -- move up.

- [ ] **Step 7: Update `DexGrid.test.tsx`'s render calls to pass the new required props**

Every `render(<DexGrid />)` call in `src/components/DexGrid.test.tsx` needs to become `render(<DexGrid view="sprite" isManualArrangeActive={false} />)` (or `view="binder"` for the tests specifically about Binder view -- check each test's intent; the existing "Binder view" describe block's tests should pass `view="binder"`). Search the file for every `<DexGrid` occurrence and update each one's props to match what that test needs. Also remove any assertions in this file that check for Sidebar-owned content that no longer renders inside `DexGrid` itself (e.g. if any test queries for the "Sprite view"/"Refresh Data" button expecting it inside a `DexGrid`-only render tree without a `Sidebar` also mounted, that assertion needs to move to `Sidebar.test.tsx` or `App.test.tsx` instead, since those controls no longer exist inside `DexGrid`'s own output).

- [ ] **Step 8: Run the DexGrid tests, fix any remaining failures, verify they pass**

Run: `npm test -- src/components/DexGrid.test.tsx`
Expected: PASS once every render call has both props and no test asserts on now-removed Sidebar-only content.

- [ ] **Step 9: Rewrite `App.tsx` to own `view`/`isManualArrangeActive`, render one `Sidebar` + full-width main content, and float Export/Import above Tutorial**

```tsx
// src/App.tsx — full new content
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CollectionTable } from './components/CollectionTable';
import { DexGrid } from './components/DexGrid';
import { ExportImportControls } from './components/ExportImportControls';
import { Sidebar, type DexView } from './components/Sidebar';
import { StartScreen } from './components/StartScreen';
import { Summary } from './components/Summary';
import { Tutorial } from './components/Tutorial';
import { WishlistTable } from './components/WishlistTable';
import { USER_DATA_STORAGE_KEY } from './state/store';
import { useUnsavedChangesWarning } from './state/useUnsavedChangesWarning';
import styles from './App.module.css';

const ONBOARDED_KEY = 'pcc:onboarded:v1';

function hasOnboardedFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function hasExistingUserData(): boolean {
  try {
    return localStorage.getItem(USER_DATA_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function readInitialOnboardingNeeded(): boolean {
  if (hasOnboardedFlag()) return false;
  if (hasExistingUserData()) return false;
  return true;
}

type Tab = 'grid' | 'collection' | 'wishlist' | 'summary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'grid', label: 'Dex Grid' },
  { id: 'collection', label: 'My Collection' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'summary', label: 'Summary' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('grid');
  const [needsOnboarding, setNeedsOnboarding] = useState(readInitialOnboardingNeeded);
  const [view, setView] = useState<DexView>('sprite');
  const [isManualArrangeActive, setIsManualArrangeActive] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useUnsavedChangesWarning();

  useEffect(() => {
    if (!hasOnboardedFlag() && hasExistingUserData()) {
      try {
        localStorage.setItem(ONBOARDED_KEY, 'true');
      } catch {
        // Best-effort self-heal; ignore storage errors here just like
        // readInitialOnboardingNeeded does above.
      }
    }
  }, []);

  if (needsOnboarding) {
    return (
      <StartScreen
        onComplete={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true');
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        view={view}
        onSetView={setView}
        isLoading={false}
        onRefresh={() => {}}
        isManualArrangeActive={isManualArrangeActive}
        onToggleManualArrange={() => setIsManualArrangeActive((active) => !active)}
        activeTab={activeTab}
        tabs={TABS}
        onTabChange={(tabId) => setActiveTab(tabId as Tab)}
        showDexGridControls={activeTab === 'grid'}
      />

      <main className={styles.main}>
        {/* The Dex Grid panel stays mounted at all times and is toggled with
            the `hidden` attribute rather than conditional JSX removal. This
            keeps its tutorial anchors present in the DOM regardless of which
            tab is currently visible, avoids re-running DexGrid's mount
            effect (and re-parsing the full card cache blob) on every tab
            round-trip, and preserves its own local UI state (the open
            Picker) across tab switches instead of resetting it every time. */}
        <div hidden={activeTab !== 'grid'}>
          <DexGrid view={view} isManualArrangeActive={isManualArrangeActive} />
        </div>
        <AnimatePresence mode="wait">
          {activeTab !== 'grid' && (
            <motion.div
              key={activeTab}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
            >
              {activeTab === 'collection' && <CollectionTable />}
              {activeTab === 'wishlist' && <WishlistTable />}
              {activeTab === 'summary' && <Summary />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className={styles.floatingControls}>
        <div data-tutorial="export-import">
          <ExportImportControls />
        </div>
      </div>

      <Tutorial onStart={() => setActiveTab('grid')} />
    </div>
  );
}
```

Note `isLoading={false}` / `onRefresh={() => {}}` passed to `Sidebar` here: `DexGrid` still owns its own `isLoading`/`handleRefreshData` internally (Step 6 kept them there) since only `view`/`isManualArrangeActive` needed to move up for `Sidebar` to read/drive them. This leaves the "Refresh Data" button in `Sidebar` structurally wired to nothing until Task 1 is revisited -- **do not ship this task alone**; immediately follow with the fix below in the same task before committing.

Fix: `DexGrid`'s `isLoading` and `handleRefreshData` need to also move up to `App.tsx` alongside `view`/`isManualArrangeActive`, for the same reason -- `Sidebar` (now outside `DexGrid`) needs to read/drive them too. Revise Step 6 and Step 9 together as follows instead of the split shown above:

- In `DexGrid.tsx`: add `isLoading: boolean` and `onRefreshData: () => void` to `DexGridProps`; delete the local `isLoading` state and `handleRefreshData` function; the auto-load `useEffect` still manages loading internally but now needs to call up via a new required prop `onLoadingChange: (loading: boolean) => void` instead of local `setIsLoading` — replace every internal `setIsLoading(true)` / `setIsLoading(false)` call with `onLoadingChange(true)` / `onLoadingChange(false)`, and expose `handleRefreshData` itself by renaming the prop to accept a ref-callback pattern instead. This is simpler done as: **keep `handleRefreshData` and the auto-load effect fully inside `DexGrid`** (its `AbortController`/`loadGeneration` machinery is intentionally private), but have `DexGrid` call `useImperativeHandle` is overkill here — instead, lift only the *value* `isLoading` up by having `DexGrid` accept an `onLoadingChange` callback prop (called from inside the same places `setIsLoading` was called), and have `App.tsx` hold its own `isLoading` state fed by that callback, plus pass a `refreshRequestId` counter prop that `DexGrid` watches in a `useEffect` to trigger its internal `handleRefreshData` when bumped from `Sidebar`'s Refresh button. Concretely:

```tsx
// src/components/DexGrid.tsx — DexGridProps and the relevant pieces (replace just these parts of Step 6's version)
export interface DexGridProps {
  view: DexView;
  isManualArrangeActive: boolean;
  onLoadingChange: (isLoading: boolean) => void;
  // Bumped by the parent (via Sidebar's Refresh Data button) to trigger a
  // refresh from outside -- a counter, not a boolean, so bumping it twice in
  // a row (e.g. two quick clicks) is still two distinct triggers instead of
  // being collapsed by React's state-equality check on an unchanged value.
  refreshRequestId: number;
}

export function DexGrid({ view, isManualArrangeActive, onLoadingChange, refreshRequestId }: DexGridProps) {
  // ...unchanged state declarations, but DELETE `const [isLoading, setIsLoading] = useState(false);`
  // and replace every `setIsLoading(true)` / `setIsLoading(false)` call site with
  // `onLoadingChange(true)` / `onLoadingChange(false)`.

  // ...the auto-load useEffect body is unchanged except for that substitution.

  async function handleRefreshData() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadGeneration.current += 1;
    const thisGeneration = loadGeneration.current;
    onLoadingChange(true);
    await loadAllCardData(language, {
      dexEntries,
      signal: controller.signal,
      onDexLoaded: () => {
        if (loadGeneration.current !== thisGeneration) return;
        scheduleDataVersionBump();
      },
    });
    if (loadGeneration.current !== thisGeneration) return;
    onLoadingChange(false);
    setDataVersion((v) => v + 1);
  }

  // New effect: fire handleRefreshData whenever the parent bumps refreshRequestId.
  // Skips the very first render (refreshRequestId starts at 0 and shouldn't
  // trigger a refresh before the user has ever clicked the button) by
  // tracking the previous value in a ref.
  const previousRefreshRequestId = useRef(refreshRequestId);
  useEffect(() => {
    if (refreshRequestId === previousRefreshRequestId.current) return;
    previousRefreshRequestId.current = refreshRequestId;
    handleRefreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRequestId]);

  // ...rest of the component unchanged.
}
```

```tsx
// src/App.tsx — replace the two placeholder lines from the first version of Step 9 above
const [isLoading, setIsLoading] = useState(false);
const [refreshRequestId, setRefreshRequestId] = useState(0);
// ...
<Sidebar
  view={view}
  onSetView={setView}
  isLoading={isLoading}
  onRefresh={() => setRefreshRequestId((id) => id + 1)}
  isManualArrangeActive={isManualArrangeActive}
  onToggleManualArrange={() => setIsManualArrangeActive((active) => !active)}
  activeTab={activeTab}
  tabs={TABS}
  onTabChange={(tabId) => setActiveTab(tabId as Tab)}
  showDexGridControls={activeTab === 'grid'}
/>
// ...
<DexGrid
  view={view}
  isManualArrangeActive={isManualArrangeActive}
  onLoadingChange={setIsLoading}
  refreshRequestId={refreshRequestId}
/>
```

Update Step 7's `DexGrid.test.tsx` render calls accordingly: every `<DexGrid .../>` now also needs `onLoadingChange={() => {}} refreshRequestId={0}` (or a `vi.fn()` for tests that assert loading-state transitions, and an incrementing value for the one test that exercises "Refresh Data").

- [ ] **Step 10: Update `App.test.tsx`**

Any existing test that queried for the tab buttons, the `<h1>Collector's Ledger</h1>` heading, or the Export/Import controls at the App level needs no change to ITS assertions (those elements still exist with the same accessible names) but may need updating if it asserted on their exact DOM position/nesting. Read through `src/App.test.tsx` in full, run it, and fix whatever breaks — most likely just import/render setup, since the accessible roles and names of every control are unchanged.

- [ ] **Step 11: Rewrite `App.module.css`**

```css
/* src/App.module.css — full new content */
.shell {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  min-height: 100vh;
  padding: var(--space-4);
}

.main {
  flex: 1;
  min-width: 0;
}

.floatingControls {
  position: fixed;
  right: var(--space-5);
  /* Stacked directly above the Tutorial button, which floats at the
     bottom-right corner of the viewport (see Tutorial.module.css) -- this
     value needs to clear that button's own height plus a gap. */
  bottom: calc(var(--space-5) + 56px);
  z-index: 50;
}
```

Check `src/components/Tutorial.module.css` for the Tutorial button's actual `bottom`/`right` offset and height before finalizing the `bottom: calc(...)` value above — adjust the `56px` placeholder to match its real rendered height plus the gap you want between the two floating controls, so Export/Import sits directly above Tutorial with no overlap and no awkward gap.

- [ ] **Step 12: Run the full test suite, typecheck, and lint**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`
Expected: all three clean. Fix anything that breaks before moving on.

- [ ] **Step 13: Commit**

```bash
git add src/App.tsx src/App.module.css src/App.test.tsx src/components/Sidebar.tsx src/components/Sidebar.module.css src/components/Sidebar.test.tsx src/components/DexGrid.tsx src/components/DexGrid.module.css src/components/DexGrid.test.tsx
git commit -m "Merge title/tabs into a single left rail and de-center the app shell"
```

---

### Task 2: Fix the binder page-flip animation (spine-hinged turn, not a corner curl)

**Files:**
- Modify: `src/components/BinderView.tsx`
- Modify: `src/components/BinderView.module.css`
- Test: `src/components/BinderView.test.tsx`

The flip currently uses Framer Motion's `rotateY: ±90deg` rotating around the page's own CENTER, with no ancestor `perspective` set at all — so it has no depth to turn through and looks glitchy/flat instead of like a page turning. Per the approved reference, a page should instead turn like a real binder page hinged on its rings: rotating around the edge NEAREST THE SPINE (its inner edge, where the two pages of a spread meet), not its own center, and not with a curled page-corner (that's a paper-book effect, evaluated and explicitly rejected — a binder page is rigid plastic, it doesn't dog-ear).

- [ ] **Step 1: Add `perspective` to `.spread` and side-aware hinge points to `BinderView.module.css`**

```css
/* src/components/BinderView.module.css — modify .spread and .page, add .pageLeft/.pageRight */
.spread {
  display: flex;
  gap: var(--space-4);
  max-width: 100%;
  overflow-x: auto;
  perspective: 2400px;
}

.page {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-xl);
  background: #050403;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

/* The left page of a spread hinges on its RIGHT edge (the spine); the right
   page (or a lone first page, which has no left-hand partner) hinges on its
   LEFT edge. Framer Motion's rotateY needs a matching transform-origin here
   to actually pivot at that edge instead of the element's center. */
.pageLeft {
  transform-origin: right center;
}

.pageRight {
  transform-origin: left center;
}
```

(`border-radius` bumped from `var(--radius-lg)` to `var(--radius-xl)` here too, per Task 5's "make the rounding obviously visible" requirement — harmless to land early since Task 5 doesn't touch this property again.)

- [ ] **Step 2: Replace the single `pageMotion` object in `BinderView.tsx` with a side-aware variant function**

```tsx
// src/components/BinderView.tsx — delete the existing `const pageMotion = shouldReduceMotion ? ... : ...` block and replace it with this function, defined at module scope (above the BinderView component) so it has no closure dependency on component state
// A page hinged at the spine (its inner edge, set via .pageLeft/.pageRight's
// transform-origin in BinderView.module.css) rather than rotating around its
// own center -- matches how a real binder page turns on its rings, not a
// book-corner curl (a paper effect that doesn't fit a rigid binder page,
// evaluated and rejected in favor of this spine-hinge approach). The left
// page in a spread hinges on its right edge; the right page (or a lone first
// page, which has no left-hand partner to hinge against) hinges on its left
// edge. `awayRotation`'s sign is chosen so a page swings AWAY from the
// viewer on exit/entry, as if genuinely rotating back on its hinge, rather
// than rotating through the viewer's side of the page.
function getPageMotion(side: 'left' | 'right', shouldReduceMotion: boolean) {
  if (shouldReduceMotion) {
    return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  }
  const awayRotation = side === 'left' ? 130 : -130;
  return {
    initial: { opacity: 0, rotateY: awayRotation },
    animate: { opacity: 1, rotateY: 0, transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] as const } },
    exit: { opacity: 0, rotateY: awayRotation, transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] as const } },
  };
}
```

Delete the now-unreferenced `shouldReduceMotion`-based `pageMotion` `const` from the component body if your edit tool left it behind — `getPageMotion` fully replaces it.

- [ ] **Step 3: Apply the side + variant to each rendered page**

```tsx
// src/components/BinderView.tsx — replace the existing {currentSpread.map((pageIndex) => ( <motion.div className={styles.page} ... {...pageMotion}> ... </motion.div> ))} block
{currentSpread.map((pageIndex, i) => {
  // Only a genuine two-page spread has a "left" page to hinge differently
  // from a "right" page -- a lone first page (currentSpread.length === 1)
  // has no left-hand partner, so it's treated as the right/only page.
  const side: 'left' | 'right' = i === 0 && currentSpread.length === 2 ? 'left' : 'right';
  return (
    <motion.div
      key={pageIndex}
      className={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight].join(' ')}
      aria-label={`Page ${pageIndex + 1}`}
      style={{
        gridTemplateColumns: `repeat(${activeBinder.config.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${activeBinder.config.rows}, minmax(0, 1fr))`,
      }}
      {...getPageMotion(side, shouldReduceMotion)}
    >
      {/* ...existing page contents unchanged... */}
    </motion.div>
  );
})}
```

(The `style={{ gridTemplateColumns/gridTemplateRows: ... }}` shown here is still the ORIGINAL `minmax(0, 1fr)` version — Task 3 replaces it with measured pixel sizing; don't jump ahead to that here, just preserve whatever the current step's baseline is so Task 3's diff applies cleanly on top.)

- [ ] **Step 4: Manual verification (no automated test can assert on visual 3D depth or rotation direction)**

This is a visual fix — Vitest/jsdom has no real CSS 3D rendering to assert against. Verify live: start the dev server, open Binder view with at least 3 pages configured (so a spread genuinely has two pages), click "Next page," and confirm each page now visibly rotates around its INNER (spine-side) edge with real depth, not its center — the left page should appear to swing on a hinge at the right, the right page on a hinge at the left. If the rotation direction looks backwards (pages appear to swing toward the viewer instead of away), flip the sign of `awayRotation` in `getPageMotion` and re-check.

- [ ] **Step 5: Run the full test suite, typecheck, and lint to confirm nothing regressed**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`
Expected: all clean — this is a CSS + Framer Motion variant change, no test assertion should be affected, but confirm rather than assume.

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderView.tsx src/components/BinderView.module.css
git commit -m "Turn binder pages on a spine hinge instead of rotating around their own center"
```

---

### Task 3: Measured slot sizing (fix cards rendering larger than real card proportions)

**Files:**
- Create: `src/state/binderSlotSizing.ts`
- Create: `src/state/binderSlotSizing.test.ts`
- Modify: `src/components/BinderView.tsx`
- Modify: `src/components/BinderView.module.css`
- Modify: `src/components/BinderSlot.module.css`
- Test: `src/components/BinderView.test.tsx`

Today each page is `display: grid` with `minmax(0, 1fr)` tracks and default stretch alignment, which overrides `BinderSlot`'s intended `aspect-ratio: 5/7` — the grid cell ends up whatever rectangle the available space divides into, not real card proportions, and `object-fit: cover` then crops card art to fit that wrong shape. This task replaces the `1fr`-driven sizing with a measured pixel size computed from the actual available container size, kept as a small pure function so the math is testable without a real DOM/`ResizeObserver`.

- [ ] **Step 1: Write the failing test for the pure sizing function**

```ts
// src/state/binderSlotSizing.test.ts
import { describe, expect, it } from 'vitest';
import { computeSlotSize } from './binderSlotSizing';

describe('computeSlotSize', () => {
  it('fits slots by height when the container is wide relative to rows/columns', () => {
    // 900x600 container, 3 columns, 2 rows, 8px gap.
    // Width-constrained candidate: (900 - 2*8) / 3 = 294.67 wide -> height = 294.67 * 7/5 = 412.53
    // Height-constrained candidate: (600 - 1*8) / 2 = 296 tall -> width = 296 * 5/7 = 211.43
    // The height-constrained candidate is smaller, so it wins (must fit BOTH dimensions).
    const size = computeSlotSize({ containerWidth: 900, containerHeight: 600, rows: 2, columns: 3, gap: 8 });
    expect(size.width).toBeCloseTo(211.43, 1);
    expect(size.height).toBeCloseTo(296, 1);
  });

  it('fits slots by width when the container is tall relative to rows/columns', () => {
    // 600x900 container, 2 columns, 3 rows, 8px gap.
    // Width-constrained: (600 - 8) / 2 = 296 wide -> height = 296 * 7/5 = 414.4
    // Height-constrained: (900 - 2*8) / 3 = 294.67 tall -> width = 294.67 * 5/7 = 210.48
    // Width-constrained wins here (smaller).
    const size = computeSlotSize({ containerWidth: 600, containerHeight: 900, rows: 3, columns: 2, gap: 8 });
    expect(size.width).toBeCloseTo(296, 1);
    expect(size.height).toBeCloseTo(414.4, 1);
  });

  it('always returns a true 5:7 width:height ratio regardless of container shape', () => {
    const size = computeSlotSize({ containerWidth: 1337, containerHeight: 481, rows: 4, columns: 5, gap: 12 });
    expect(size.width / size.height).toBeCloseTo(5 / 7, 3);
  });

  it('never returns a negative or NaN size for a degenerate (zero) container', () => {
    const size = computeSlotSize({ containerWidth: 0, containerHeight: 0, rows: 3, columns: 3, gap: 8 });
    expect(size.width).toBeGreaterThanOrEqual(0);
    expect(size.height).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(size.width)).toBe(false);
    expect(Number.isNaN(size.height)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/state/binderSlotSizing.test.ts`
Expected: FAIL — `./binderSlotSizing` doesn't exist yet.

- [ ] **Step 3: Implement `computeSlotSize`**

```ts
// src/state/binderSlotSizing.ts
export interface SlotSizeInput {
  containerWidth: number;
  containerHeight: number;
  rows: number;
  columns: number;
  gap: number;
}

export interface SlotSize {
  width: number;
  height: number;
}

// A real trading card is 5:7 (width:height). CSS grid's own 1fr tracks
// stretch each cell to fill the available space regardless of that ratio,
// which is what let cards render as whatever rectangle the page happened to
// divide into rather than true card proportions -- see BinderView.tsx's
// usage of this function for why it replaces 1fr tracks entirely instead of
// trying to constrain them from the CSS side.
//
// Computes the LARGEST 5:7 box that still lets `columns` of them (plus gaps)
// fit within containerWidth AND `rows` of them (plus gaps) fit within
// containerHeight -- i.e. tries sizing from width first, then from height,
// and keeps whichever candidate is smaller (the one that actually fits both
// axes; the larger candidate would overflow one of them).
export function computeSlotSize({
  containerWidth,
  containerHeight,
  rows,
  columns,
  gap,
}: SlotSizeInput): SlotSize {
  const CARD_RATIO = 5 / 7; // width / height

  const availableWidth = Math.max(0, containerWidth - gap * (columns - 1));
  const availableHeight = Math.max(0, containerHeight - gap * (rows - 1));

  const widthConstrainedWidth = columns > 0 ? availableWidth / columns : 0;
  const widthConstrainedHeight = widthConstrainedWidth / CARD_RATIO;

  const heightConstrainedHeight = rows > 0 ? availableHeight / rows : 0;
  const heightConstrainedWidth = heightConstrainedHeight * CARD_RATIO;

  // Whichever candidate is smaller is the one that actually fits within
  // BOTH the width and height budgets -- the other candidate would overflow
  // whichever axis it wasn't derived from.
  if (widthConstrainedHeight <= heightConstrainedHeight) {
    return { width: Math.max(0, widthConstrainedWidth), height: Math.max(0, widthConstrainedHeight) };
  }
  return { width: Math.max(0, heightConstrainedWidth), height: Math.max(0, heightConstrainedHeight) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/state/binderSlotSizing.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `BinderView.tsx` to measure its container and pass a computed pixel size down**

```tsx
// src/components/BinderView.tsx — add these imports and this logic; keep everything else in the file as it already is except the .page rendering block shown further below
import { useEffect, useMemo, useRef, useState } from 'react';
// ...existing imports, plus:
import { computeSlotSize } from '../state/binderSlotSizing';

// ...inside the component, alongside the other useState declarations:
const spreadRef = useRef<HTMLDivElement>(null);
const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

useEffect(() => {
  const node = spreadRef.current;
  if (!node) return;
  const observer = new ResizeObserver(([entry]) => {
    setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
  });
  observer.observe(node);
  return () => observer.disconnect();
}, []);
```

Then, in the JSX, attach `spreadRef` to the `.spread` div, and change the `.page` div's inline `style` (currently setting `gridTemplateColumns`/`gridTemplateRows` to `repeat(n, minmax(0, 1fr))`) to instead compute a real pixel-sized grid via `computeSlotSize`, dividing `containerSize` by however many pages are in the current spread (1 for a lone first page, 2 for a spread — see Task 4, which changes this division; for THIS task, divide by `currentSpread.length || 1` so the fix is correct standalone before Task 4 changes the split behavior):

```tsx
// src/components/BinderView.tsx — replace the existing style={{ gridTemplateColumns: ..., gridTemplateRows: ... }} block
// (this is INSIDE the {currentSpread.map((pageIndex, i) => { const side = ...; return (...) })}
// block Task 2 already introduced -- `side` is already in scope here, unchanged)
const pagesInSpread = currentSpread.length || 1;
const slotSize = computeSlotSize({
  containerWidth: containerSize.width / pagesInSpread - GAP_PX * 2, // leaves room for .page's own padding
  containerHeight: containerSize.height - GAP_PX * 2,
  rows: activeBinder.config.rows,
  columns: activeBinder.config.columns,
  gap: GAP_PX,
});
// ...
<motion.div
  key={pageIndex}
  className={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight].join(' ')}
  aria-label={`Page ${pageIndex + 1}`}
  style={{
    gridTemplateColumns: `repeat(${activeBinder.config.columns}, ${slotSize.width}px)`,
    gridTemplateRows: `repeat(${activeBinder.config.rows}, ${slotSize.height}px)`,
  }}
  {...getPageMotion(side, shouldReduceMotion)}
>
```

Add `const GAP_PX = 8;` near the top of the component (matching `var(--space-2)`'s 8px value used by `.page`'s `gap` in `BinderView.module.css` — keep these two in sync; if `--space-2` is ever changed, this constant needs updating too, which is worth a one-line comment at its declaration pointing at `global.css`'s `--space-2`).

- [ ] **Step 6: Simplify `BinderSlot.module.css`: remove the now-redundant `aspect-ratio`/`min-width`/`min-height` (the parent grid now sets exact pixel sizes) but keep everything else**

```css
/* src/components/BinderSlot.module.css — modify .slot and .blank, leave every other rule unchanged */
.slot {
  border-radius: var(--radius-md);
  background: #0c0a08;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  overflow: hidden;
  transition: background-color var(--transition-fast);
}

/* ...leave .slot:hover, .slot:focus-visible, .slot img, .owned, .cardImage unchanged... */

.blank {
  border-radius: var(--radius-md);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  background: transparent;
}
```

- [ ] **Step 7: Remove the now-dead `minmax(0, 1fr)` comment block from `BinderView.module.css`'s `.page` rule** (the sizing is computed in JS now, not via grid track units) — this was already touched in Task 2's Step 1; just delete the stale explanatory comment about `1fr`/`minmax` if Task 2 already landed, since it no longer describes what the code does.

- [ ] **Step 8: Update `BinderView.test.tsx` for the new container-measurement dependency**

jsdom doesn't implement `ResizeObserver`. Add a minimal mock at the top of the test file (check whether one already exists in the project's `vitest.setup.ts`/similar first — if the project already globally mocks `ResizeObserver` for other components, skip this step and just verify the existing mock reports a nonzero size):

```ts
// src/components/BinderView.test.tsx — add near the top, before the describe blocks, only if no global ResizeObserver mock already exists
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ contentRect: { width: 900, height: 600 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);
```

- [ ] **Step 9: Run the full test suite, typecheck, and lint; fix anything that breaks**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 10: Commit**

```bash
git add src/state/binderSlotSizing.ts src/state/binderSlotSizing.test.ts src/components/BinderView.tsx src/components/BinderView.module.css src/components/BinderSlot.module.css src/components/BinderView.test.tsx
git commit -m "Size binder slots from measured space instead of stretched grid tracks, fixing card proportions"
```

---

### Task 4: Two-page spread splits the screen from center; a lone first page uses the full width

**Files:**
- Modify: `src/components/BinderView.tsx`
- Modify: `src/components/BinderView.module.css`
- Test: `src/components/BinderView.test.tsx`

Per the approved design: a spread of two pages splits the available screen down the center (each half sized as large as possible, page *container* proportions not fixed to any particular shape); a lone first page (nothing to spread with) uses the full width instead of being confined to half.

**Prerequisite queued ahead of this task (already committed separately, before this task starts — not part of this task's own diff, noted here so Step 1 below isn't a silent no-op):** `src/App.module.css`'s `.shell` rule changed `align-items: flex-start` to `align-items: stretch`, and `.main` gained `min-height: 0`. Reason: Step 1's `.binder { height: 100% }` needs `.main` (its parent) to have a real, non-content-derived height to resolve that percentage against — with the old `flex-start`, `.main`'s height was auto/content-driven, which is what let Task 3's measured sizing collapse into a circular content-drives-measurement-drives-content loop (confirmed live: `.spread` and its grid tracks collapsed to single-digit/low-double-digit pixels). `.sidebar` is unaffected by the `.shell` change since it already sets its own `align-self: flex-start` in `Sidebar.module.css`. If this change is somehow missing from `src/App.module.css` when this task starts, add it back before Step 1, or `height: 100%` will resolve to `auto` and the collapse will still happen.

- [ ] **Step 1: Update `.spread`'s CSS to stretch its children to fill height, and let each `.page` grow to fill its share of the row**

```css
/* src/components/BinderView.module.css — modify .binder and .spread */
.binder {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

.spread {
  display: flex;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  perspective: 2400px;
}

.page {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-xl);
  background: #050403;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  flex: 1;
  min-width: 0;
  justify-content: center;
  align-content: center;
}
```

(`backface-visibility: hidden` carried forward from Task 2 — this replaces the WHOLE `.page` rule, so don't drop it. `.pageLeft`/`.pageRight`, also added in Task 2, are separate rule blocks and are untouched by this edit — leave them exactly as they are.)

`flex: 1` on `.page` is what makes each page in a two-page spread claim half the row (both pages have equal `flex: 1`, so they split evenly), while a LONE page (nothing else in the flex row) naturally claims the full row width on its own — no JS branching needed for "single page vs spread" sizing at the container level, only at the slot-sizing level (Step 2 below).

- [ ] **Step 2: `containerSize` in `BinderView.tsx` should now come from measuring one `.page` element directly, not the whole `.spread`, since each page's own box (not the shared row) is what `computeSlotSize` needs**

Change the `ResizeObserver` from Task 3 to observe a ref on the actual page element being sized, not `.spread`. Since `currentSpread` can render 1 or 2 `.page` elements and each needs its own independent measurement, attach the `ResizeObserver` per-page instead of once for the whole spread:

```tsx
// src/components/BinderView.tsx — replace the single spreadRef/containerSize pair from Task 3 with a small per-page measuring hook
function usePageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
```

Since `currentSpread.map(...)` renders each page independently, and React hooks can't be called inside that `.map` callback, restructure the page-rendering block into its own small internal component within the same file (still exported only implicitly, not part of the public API) so each page instance gets its own `usePageSize()` call:

```tsx
// src/components/BinderView.tsx — new internal component, defined above the main BinderView function in the same file
interface BinderPageProps {
  pageIndex: number;
  rows: number;
  columns: number;
  entries: (import('../types').BinderSlotEntry | undefined)[][];
  fillDirection: import('../types').BinderFillDirection;
  nameByDexNumber: Map<number, string>;
  ownedCardImageByDexNumber: Map<number, string>;
  onSlotClick: (dexNumber: number) => void;
  isManualArrangeActive: boolean;
  selectedIndex: number | null;
  onSelectSlot: (slotIndex: number) => void;
  onDragStartSlot: (slotIndex: number) => void;
  onDropSlot: (slotIndex: number) => void;
  // Which edge this page hinges on -- see Task 2's getPageMotion, which
  // BinderPage now calls directly instead of receiving a precomputed motion
  // object as a prop, since the motion also needs to pair with the matching
  // .pageLeft/.pageRight CSS class for its transform-origin.
  side: 'left' | 'right';
}

function BinderPage({
  pageIndex,
  rows,
  columns,
  entries,
  fillDirection,
  nameByDexNumber,
  ownedCardImageByDexNumber,
  onSlotClick,
  isManualArrangeActive,
  selectedIndex,
  onSelectSlot,
  onDragStartSlot,
  onDropSlot,
  side,
}: BinderPageProps) {
  const [ref, size] = usePageSize();
  const shouldReduceMotion = useReducedMotion();
  const slotSize = computeSlotSize({
    // 2 * space-4 (32px) for .page's own left+right padding.
    containerWidth: size.width - 32,
    containerHeight: size.height - 32,
    rows,
    columns,
    gap: 8,
  });

  return (
    <motion.div
      ref={ref}
      key={pageIndex}
      className={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight].join(' ')}
      aria-label={`Page ${pageIndex + 1}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, ${slotSize.width}px)`,
        gridTemplateRows: `repeat(${rows}, ${slotSize.height}px)`,
      }}
      {...getPageMotion(side, shouldReduceMotion)}
    >
      {entries.flatMap((row, r) =>
        row.map((entry, c) => {
          const withinPage = fillDirection === 'horizontal' ? r * columns + c : c * rows + r;
          const slotIndex = pageIndex * rows * columns + withinPage;
          return (
            <BinderSlot
              key={`${r}-${c}`}
              entry={entry}
              pokemonName={entry?.type === 'pokemon' ? nameByDexNumber.get(entry.dexNumber) : undefined}
              spriteUrl={entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined}
              ownedCardImageBase={
                entry?.type === 'pokemon' ? ownedCardImageByDexNumber.get(entry.dexNumber) : undefined
              }
              onClick={() => onSlotClick(entry && entry.type === 'pokemon' ? entry.dexNumber : -1)}
              isManualArrangeActive={isManualArrangeActive}
              isSelected={selectedIndex === slotIndex}
              onSelect={() => onSelectSlot(slotIndex)}
              onDragStart={() => onDragStartSlot(slotIndex)}
              onDrop={() => onDropSlot(slotIndex)}
            />
          );
        })
      )}
    </motion.div>
  );
}
```

And replace the main `BinderView` component's page-rendering JSX (the `{currentSpread.map((pageIndex) => ( <motion.div className={styles.page} ...> ... </motion.div> ))}` block) with:

```tsx
{currentSpread.map((pageIndex, i) => {
  // Same rule as Task 2: only a genuine two-page spread has a "left" page to
  // hinge differently from a "right" page.
  const side: 'left' | 'right' = i === 0 && currentSpread.length === 2 ? 'left' : 'right';
  return (
    <BinderPage
      key={pageIndex}
      pageIndex={pageIndex}
      rows={activeBinder.config.rows}
      columns={activeBinder.config.columns}
      entries={pages[pageIndex] ?? []}
      fillDirection={activeBinder.config.fillDirection}
      nameByDexNumber={nameByDexNumber}
      ownedCardImageByDexNumber={ownedCardImageByDexNumber}
      onSlotClick={(dexNumber) => onSlotClick(dexNumber, activeBinder.language)}
      isManualArrangeActive={isManualArrangeActive}
      selectedIndex={selectedIndex}
      onSelectSlot={setSelectedIndex}
      onDragStartSlot={setDragFromIndex}
      onDropSlot={handleDrop}
      side={side}
    />
  );
})}
```

`getPageMotion` itself (defined at module scope in Task 2) needs no change or re-export — `BinderPage` is defined in the same file and calls it directly. Delete the now-unused `GAP_PX`/`containerSize`/`spreadRef`/`pagesInSpread`/`slotSize` variables from Task 3's Step 5 in the main component body — that logic now lives inside `BinderPage`/`usePageSize` instead. Keep the `AnimatePresence` wrapper around this `.map(...)` exactly as it already is.

- [ ] **Step 3: Update `BinderView.test.tsx`'s `ResizeObserver` mock (from Task 3 Step 8) to fire once per `observe()` call rather than assuming a single global instance**, since there are now potentially two independent `BinderPage` instances each observing their own node:

The `MockResizeObserver` class from Task 3 already supports this correctly as written (each `new MockResizeObserver(callback)` instance is independent, and each `.observe()` call synchronously invokes its own callback) — no change needed here as long as Task 3's mock was implemented per-instance, not as a shared singleton. Just re-run the suite to confirm.

- [ ] **Step 4: Run the full test suite, typecheck, and lint; fix anything that breaks**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/components/BinderView.tsx src/components/BinderView.module.css src/components/BinderView.test.tsx
git commit -m "Split the screen down the center for a two-page spread; a lone page fills the full width"
```

---

### Task 5: Zoom slider and "G" scroll-to-zoom mode

**Files:**
- Create: `src/components/BinderZoomControl.tsx`
- Create: `src/components/BinderZoomControl.module.css`
- Create: `src/components/BinderZoomControl.test.tsx`
- Modify: `src/components/BinderView.tsx`
- Modify: `src/components/BinderView.module.css`
- Test: `src/components/BinderView.test.tsx`

A slider next to the page-nav arrows, plus: pressing "G" enters a temporary zoom mode (mouse wheel scroll zooms in/out, anchored at the cursor position); Escape or any click exits the mode, and that exiting click is consumed (it doesn't also trigger whatever it would normally do, like opening a slot's Picker).

- [ ] **Step 1: Write the failing test for the zoom control component**

```tsx
// src/components/BinderZoomControl.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderZoomControl } from './BinderZoomControl';

describe('BinderZoomControl', () => {
  it('renders a slider reflecting the current zoom level', () => {
    render(<BinderZoomControl zoom={1.5} onZoomChange={() => {}} isZoomModeActive={false} />);
    expect(screen.getByRole('slider', { name: /zoom/i })).toHaveValue('1.5');
  });

  it('calls onZoomChange when the slider is moved', async () => {
    const onZoomChange = vi.fn();
    render(<BinderZoomControl zoom={1} onZoomChange={onZoomChange} isZoomModeActive={false} />);
    const slider = screen.getByRole('slider', { name: /zoom/i });
    fireEventChange(slider, '2');
    expect(onZoomChange).toHaveBeenCalledWith(2);
  });

  it('shows a zoom-mode hint only while zoom mode is active', () => {
    const { rerender } = render(
      <BinderZoomControl zoom={1} onZoomChange={() => {}} isZoomModeActive={false} />
    );
    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
    rerender(<BinderZoomControl zoom={1} onZoomChange={() => {}} isZoomModeActive />);
    expect(screen.getByText(/scroll to zoom/i)).toBeInTheDocument();
  });
});

// Testing Library's fireEvent.change on a range input needs a native value
// setter to work reliably with React-controlled inputs -- this small helper
// avoids repeating that boilerplate at each call site above.
function fireEventChange(element: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
```

(Uses a raw DOM event dispatch rather than `userEvent` for the range input, matching the well-known jsdom/Testing-Library limitation that `userEvent.type`/`.click` don't reliably drive `<input type="range">`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/BinderZoomControl.test.tsx`
Expected: FAIL — `./BinderZoomControl` doesn't exist yet.

- [ ] **Step 3: Implement `BinderZoomControl.tsx`**

```tsx
// src/components/BinderZoomControl.tsx
import styles from './BinderZoomControl.module.css';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export interface BinderZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  isZoomModeActive: boolean;
}

export function BinderZoomControl({ zoom, onZoomChange, isZoomModeActive }: BinderZoomControlProps) {
  return (
    <div className={styles.zoomControl}>
      <input
        type="range"
        aria-label="Zoom"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.05}
        value={zoom}
        onChange={(event) => onZoomChange(Number(event.target.value))}
      />
      <span className={styles.percent}>{Math.round(zoom * 100)}%</span>
      {isZoomModeActive && (
        <span className={styles.hint} role="status">
          Scroll to zoom · Esc or click to exit
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Style it**

```css
/* src/components/BinderZoomControl.module.css */
.zoomControl {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.percent {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  min-width: 3.5ch;
}

.hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-sm);
  padding: 0.2rem 0.5rem;
}
```

- [ ] **Step 5: Run the BinderZoomControl tests to verify they pass**

Run: `npm test -- src/components/BinderZoomControl.test.tsx`
Expected: PASS

- [ ] **Step 6: Write the failing test for BinderView's G-mode keyboard/scroll/exit behavior**

```tsx
// src/components/BinderView.test.tsx — add to the describe('BinderView') block
describe('zoom', () => {
  beforeEach(resetStore);

  it('pressing g enters zoom mode, shown via the zoom control hint', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/scroll to zoom/i);
  });

  it('scrolling while in zoom mode changes the zoom slider value', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    const slider = screen.getByRole('slider', { name: /zoom/i });
    const before = Number(slider.getAttribute('value') ?? slider.getAttribute('aria-valuenow'));
    fireEvent.wheel(screen.getByLabelText(/page 1/i).parentElement!, { deltaY: -100 });
    const after = Number((slider as HTMLInputElement).value);
    expect(after).toBeGreaterThan(before);
  });

  it('pressing Escape exits zoom mode', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
  });

  it('clicking anywhere while in zoom mode exits it without triggering the click underneath', async () => {
    const onSlotClick = vi.fn();
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={onSlotClick} />);
    await userEvent.keyboard('g');
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
    expect(onSlotClick).not.toHaveBeenCalled();
  });
});
```

Add `fireEvent` to the existing `import { act, fireEvent, render, screen } from '@testing-library/react';` line at the top of the file if it isn't already imported (it already is, per the file's existing manual-arrange tests using `fireEvent.dragStart`/`fireEvent.drop`).

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npm test -- src/components/BinderView.test.tsx`
Expected: FAIL — no G-mode behavior exists yet.

- [ ] **Step 8: Implement G-mode in `BinderView.tsx`**

```tsx
// src/components/BinderView.tsx — add near the other useState declarations
const [zoom, setZoom] = useState(1);
const [isZoomModeActive, setIsZoomModeActive] = useState(false);

// Keyboard: 'g' enters zoom mode, Escape exits it. Attached to `window`
// rather than a specific element since the user can press 'g' with focus
// anywhere on the page, not just while a binder element itself has focus.
useEffect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'g' || event.key === 'G') {
      setIsZoomModeActive(true);
    } else if (event.key === 'Escape') {
      setIsZoomModeActive(false);
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

// Any click anywhere exits zoom mode and swallows that specific click so it
// doesn't also activate whatever was underneath it (e.g. opening a binder
// slot's Picker) -- captured on window in the CAPTURE phase, so it runs
// before the click reaches its actual target and can be stopped there.
useEffect(() => {
  if (!isZoomModeActive) return;
  function handleClickCapture(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    setIsZoomModeActive(false);
  }
  window.addEventListener('click', handleClickCapture, { capture: true });
  return () => window.removeEventListener('click', handleClickCapture, { capture: true });
}, [isZoomModeActive]);

function handleWheel(event: React.WheelEvent) {
  if (!isZoomModeActive) return;
  event.preventDefault();
  const delta = event.deltaY < 0 ? 0.1 : -0.1;
  setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 20) / 20)));
}
```

Import `MIN_ZOOM`/`MAX_ZOOM`/`BinderZoomControl` at the top of the file: `import { BinderZoomControl, MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';`.

Wire the zoom value onto `.spread` as a CSS transform (scale-only, doesn't affect layout/measurement — `computeSlotSize` continues to size slots from the page's own unscaled box, and the visual zoom is purely a transform applied on top), and attach `onWheel={handleWheel}` to the `.spread` container:

```tsx
// src/components/BinderView.tsx — modify the .spread div's props
<div className={styles.spread} ref={/* keep whatever ref Task 4 already put here, if any */} onWheel={handleWheel} style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}>
```

Add the zoom control to the `.nav` row, next to the existing page-nav buttons:

```tsx
// src/components/BinderView.tsx — inside the existing <div className={styles.nav}> block, after the "Next page" button and the existing "Keep empty" button
<BinderZoomControl zoom={zoom} onZoomChange={setZoom} isZoomModeActive={isZoomModeActive} />
```

- [ ] **Step 9: Run the BinderView tests to verify they pass**

Run: `npm test -- src/components/BinderView.test.tsx`
Expected: PASS

- [ ] **Step 10: Run the full test suite, typecheck, and lint; fix anything that breaks**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 11: Commit**

```bash
git add src/components/BinderZoomControl.tsx src/components/BinderZoomControl.module.css src/components/BinderZoomControl.test.tsx src/components/BinderView.tsx src/components/BinderView.module.css src/components/BinderView.test.tsx
git commit -m "Add a binder zoom slider and a G-mode scroll-to-zoom interaction"
```

---

### Task 6: Extend `BinderSlotEntry` with an optional custom image on blank slots

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/state/store.ts`
- Test: `src/state/store.test.ts`
- Modify: `src/state/exportImport.ts`
- Test: `src/state/exportImport.test.ts`

A "kept empty" slot can hold a custom filler image: the ORIGINAL uploaded image plus a pan/zoom crop transform (not a pre-cropped raster), so it can be re-cropped later and, in a future deferred feature, re-rendered at full print resolution without quality loss.

- [ ] **Step 1: Write the failing test for the extended type and a new store action**

```ts
// src/state/store.test.ts — add a new describe block
describe('setBinderSlotCustomImage', () => {
  it('sets a custom image on the blank slot at the given sequence index in a binder\'s customOrder', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'pokemon', dexNumber: 1 },
            { type: 'blank' },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    useAppStore.getState().setBinderSlotCustomImage('a', 1, {
      dataUri: 'data:image/jpeg;base64,ABC',
      offsetX: 0.1,
      offsetY: 0.2,
      zoom: 1.5,
    });
    const order = useAppStore.getState().binders[0].customOrder;
    expect(order?.[1]).toEqual({
      type: 'blank',
      customImage: { dataUri: 'data:image/jpeg;base64,ABC', offsetX: 0.1, offsetY: 0.2, zoom: 1.5 },
    });
  });

  it('clearing a custom image (passing null) reverts the slot to a plain blank', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            {
              type: 'blank',
              customImage: { dataUri: 'data:image/jpeg;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 },
            },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    useAppStore.getState().setBinderSlotCustomImage('a', 0, null);
    expect(useAppStore.getState().binders[0].customOrder?.[0]).toEqual({ type: 'blank' });
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [{ type: 'blank' }],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    useAppStore.getState().setBinderSlotCustomImage('a', 0, {
      dataUri: 'data:image/jpeg;base64,ABC',
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/state/store.test.ts`
Expected: FAIL — `setBinderSlotCustomImage` doesn't exist yet, and `BinderSlotEntry`'s `blank` variant doesn't accept `customImage`.

- [ ] **Step 3: Extend the type in `src/types/index.ts`**

```ts
// src/types/index.ts — replace the existing BinderSlotEntry line
export interface CustomSlotImage {
  // The ORIGINAL uploaded image, not a pre-cropped raster -- storing the
  // crop as a separate transform (offsetX/offsetY/zoom) instead of baking it
  // into the pixels lets the user re-open the editor and adjust the crop
  // later without any quality loss, and lets a future print-size export
  // re-render the crop at full resolution from the original source.
  dataUri: string;
  // Pan offset as a fraction of the image's own width/height (0 = centered
  // on that axis), not raw pixels -- keeps the transform independent of
  // whatever size the image happens to be uploaded at.
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export type BinderSlotEntry =
  | { type: 'pokemon'; dexNumber: number }
  | { type: 'blank'; customImage?: CustomSlotImage };
```

- [ ] **Step 4: Add the store action in `src/state/store.ts`**

Add `setBinderSlotCustomImage: (binderId: string, slotIndex: number, customImage: CustomSlotImage | null) => void;` to the `AppState` interface, and implement it alongside the other `setBinder*` actions:

```ts
// src/state/store.ts — add to the AppState interface, near setBinderCustomOrder
setBinderSlotCustomImage: (binderId: string, slotIndex: number, customImage: CustomSlotImage | null) => void;
```

```ts
// src/state/store.ts — add to the store implementation, near setBinderCustomOrder's own implementation
setBinderSlotCustomImage: (binderId, slotIndex, customImage) =>
  set((state) => ({
    binders: state.binders.map((binder) => {
      if (binder.id !== binderId) return binder;
      const order = binder.customOrder;
      if (!order || !order[slotIndex] || order[slotIndex].type !== 'blank') return binder;
      const nextOrder = [...order];
      nextOrder[slotIndex] = customImage
        ? { type: 'blank', customImage }
        : { type: 'blank' };
      return { ...binder, customOrder: nextOrder };
    }),
    hasUnsavedChanges: true,
  })),
```

Add `CustomSlotImage` to the existing `import type { ... } from '../types';` line at the top of `store.ts`.

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `npm test -- src/state/store.test.ts`
Expected: PASS

- [ ] **Step 6: Check `src/state/exportImport.ts`'s binder validators accept the new optional field**

Read `isValidBinder`/whatever validates a `BinderSlotEntry`'s shape inside a binder's `customOrder` array during import. If it validates each entry with an exact-shape check (e.g. `Object.keys(entry).length === 1` for a blank entry, or a strict union-tag switch that doesn't account for an optional `customImage`), loosen it to accept an optional `customImage` object with `dataUri`/`offsetX`/`offsetY`/`zoom` fields, matching the same permissive-but-type-checked pattern the file already uses for other optional fields. Add a test to `src/state/exportImport.test.ts` importing a binder whose `customOrder` includes a blank slot with a `customImage`, asserting the import succeeds and the field round-trips intact.

- [ ] **Step 7: Run the full test suite, typecheck, and lint; fix anything that breaks**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/state/store.ts src/state/store.test.ts src/state/exportImport.ts src/state/exportImport.test.ts
git commit -m "Let a kept-empty binder slot carry an optional custom filler image"
```

---

### Task 7: Custom-image pan/zoom crop editor

**Files:**
- Create: `src/state/slotImageCrop.ts`
- Create: `src/state/slotImageCrop.test.ts`
- Create: `src/components/SlotImageEditor.tsx`
- Create: `src/components/SlotImageEditor.module.css`
- Create: `src/components/SlotImageEditor.test.tsx`

A `<canvas>`-based editor: upload an image, drag to pan, a slider to zoom, always rendering into a fixed 5:7 frame that matches how the slot itself will display it. Never stretches/distorts — this is a crop (choosing what part of the image shows), not a resize.

- [ ] **Step 1: Write the failing test for the pure crop-math module**

```ts
// src/state/slotImageCrop.test.ts
import { describe, expect, it } from 'vitest';
import { clampCropOffset } from './slotImageCrop';

describe('clampCropOffset', () => {
  it('leaves an offset of 0 (centered) unchanged at any zoom', () => {
    expect(clampCropOffset(0, 1)).toBe(0);
    expect(clampCropOffset(0, 2.5)).toBe(0);
  });

  it('clamps an offset to the range the current zoom actually allows', () => {
    // At zoom 1 (the image exactly fills the 5:7 frame with no slack), any
    // nonzero offset would reveal empty space, so it must clamp to 0.
    expect(clampCropOffset(0.3, 1)).toBe(0);
    // At zoom 2, there's slack of (2-1)/2 = 0.5 on each side to pan into.
    expect(clampCropOffset(0.3, 2)).toBeCloseTo(0.3, 5);
    expect(clampCropOffset(0.9, 2)).toBeCloseTo(0.5, 5);
    expect(clampCropOffset(-0.9, 2)).toBeCloseTo(-0.5, 5);
  });

  it('never allows an offset beyond the available slack, symmetric in both directions', () => {
    const clamped = clampCropOffset(10, 3);
    expect(clamped).toBeCloseTo(1, 5); // (3-1)/2 = 1
    expect(clampCropOffset(-10, 3)).toBeCloseTo(-1, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/state/slotImageCrop.test.ts`
Expected: FAIL — `./slotImageCrop` doesn't exist yet.

- [ ] **Step 3: Implement the pure crop-math helper**

```ts
// src/state/slotImageCrop.ts
// offsetX/offsetY are expressed as a fraction of the CROP FRAME's own
// width/height (matching CustomSlotImage's stored units in types/index.ts).
// At zoom 1, the image exactly fills the frame with zero slack to pan into,
// so any offset must clamp to 0. At zoom Z, the image is Z times the frame
// size, leaving (Z-1)/2 of slack on each side (half on the left/top, half on
// the right/bottom) -- an offset beyond that would reveal empty space
// outside the source image.
export function clampCropOffset(offset: number, zoom: number): number {
  const maxSlack = Math.max(0, (zoom - 1) / 2);
  return Math.min(maxSlack, Math.max(-maxSlack, offset));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/state/slotImageCrop.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `SlotImageEditor`**

```tsx
// src/components/SlotImageEditor.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotImageEditor } from './SlotImageEditor';

describe('SlotImageEditor', () => {
  it('shows an upload prompt when there is no image yet', () => {
    render(<SlotImageEditor initialImage={null} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText(/upload an image/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows the zoom slider and Save/Cancel once an image is loaded', async () => {
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole('slider', { name: /zoom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onSave with the current crop transform', async () => {
    const onSave = vi.fn();
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      dataUri: 'data:image/png;base64,ABC',
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    });
  });

  it('calls onCancel and does not call onSave when Cancel is clicked', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a Remove image button that clears back to the upload prompt, only once an image is loaded', async () => {
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.getByLabelText(/upload an image/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test -- src/components/SlotImageEditor.test.tsx`
Expected: FAIL — `./SlotImageEditor` doesn't exist yet.

- [ ] **Step 7: Implement `SlotImageEditor.tsx`**

```tsx
// src/components/SlotImageEditor.tsx
import { useRef, useState } from 'react';
import type { CustomSlotImage } from '../types';
import { clampCropOffset } from '../state/slotImageCrop';
import { MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';
import styles from './SlotImageEditor.module.css';

export interface SlotImageEditorProps {
  initialImage: CustomSlotImage | null;
  onSave: (image: CustomSlotImage) => void;
  onCancel: () => void;
}

const DEFAULT_TRANSFORM = { offsetX: 0, offsetY: 0, zoom: 1 };

export function SlotImageEditor({ initialImage, onSave, onCancel }: SlotImageEditorProps) {
  const [dataUri, setDataUri] = useState<string | null>(initialImage?.dataUri ?? null);
  const [offsetX, setOffsetX] = useState(initialImage?.offsetX ?? DEFAULT_TRANSFORM.offsetX);
  const [offsetY, setOffsetY] = useState(initialImage?.offsetY ?? DEFAULT_TRANSFORM.offsetY);
  const [zoom, setZoom] = useState(initialImage?.zoom ?? DEFAULT_TRANSFORM.zoom);
  const dragOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setDataUri(reader.result as string);
      setOffsetX(DEFAULT_TRANSFORM.offsetX);
      setOffsetY(DEFAULT_TRANSFORM.offsetY);
      setZoom(DEFAULT_TRANSFORM.zoom);
    };
    reader.readAsDataURL(file);
  }

  function handleZoomChange(nextZoom: number) {
    setZoom(nextZoom);
    setOffsetX((x) => clampCropOffset(x, nextZoom));
    setOffsetY((y) => clampCropOffset(y, nextZoom));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragOrigin.current = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return;
    // Divides by a fixed 200px reference frame size so drag sensitivity is
    // independent of exactly how large the editor happens to render on
    // screen -- the stored offset is a fraction of the frame, not pixels.
    const dx = (event.clientX - dragOrigin.current.x) / 200;
    const dy = (event.clientY - dragOrigin.current.y) / 280;
    setOffsetX(clampCropOffset(dragOrigin.current.offsetX + dx, zoom));
    setOffsetY(clampCropOffset(dragOrigin.current.offsetY + dy, zoom));
  }

  function handlePointerUp() {
    dragOrigin.current = null;
  }

  if (!dataUri) {
    return (
      <div className={styles.editor}>
        <label className={styles.uploadPrompt}>
          Upload an image
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div
        className={styles.frame}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={dataUri}
          alt="Crop preview"
          className={styles.previewImage}
          style={{
            transform: `translate(${offsetX * 200}px, ${offsetY * 280}px) scale(${zoom})`,
          }}
          draggable={false}
        />
      </div>
      <input
        type="range"
        aria-label="Zoom"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.05}
        value={zoom}
        onChange={(event) => handleZoomChange(Number(event.target.value))}
      />
      <div className={styles.actions}>
        <button type="button" onClick={() => setDataUri(null)}>
          Remove image
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={() => onSave({ dataUri, offsetX, offsetY, zoom })}>
          Save
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Style it**

```css
/* src/components/SlotImageEditor.module.css */
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}

.uploadPrompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.frame {
  width: 200px;
  height: 280px;
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
  background: #0c0a08;
  cursor: grab;
  touch-action: none;
}

.previewImage {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform-origin: center;
  user-select: none;
  pointer-events: none;
}

.actions {
  display: flex;
  gap: var(--space-2);
}
```

- [ ] **Step 9: Run the SlotImageEditor tests to verify they pass**

Run: `npm test -- src/components/SlotImageEditor.test.tsx`
Expected: PASS

- [ ] **Step 10: Run the full test suite, typecheck, and lint; fix anything that breaks**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 11: Commit**

```bash
git add src/state/slotImageCrop.ts src/state/slotImageCrop.test.ts src/components/SlotImageEditor.tsx src/components/SlotImageEditor.module.css src/components/SlotImageEditor.test.tsx
git commit -m "Add a pan/zoom crop editor for custom binder slot filler images"
```

---

### Task 8: Wire `BinderSlot`/`BinderView` to render custom images and open the editor

**Files:**
- Modify: `src/components/BinderSlot.tsx`
- Modify: `src/components/BinderSlot.module.css`
- Modify: `src/components/BinderView.tsx`
- Test: `src/components/BinderSlot.test.tsx`
- Test: `src/components/BinderView.test.tsx`

A blank slot, outside manual-arrange mode, becomes clickable: with no custom image yet, clicking opens the editor to add one; with one already set, clicking re-opens the editor to change it, and the slot permanently shows the cropped image (not a hover-reveal) exactly like an owned card slot does.

**Also fix a pre-existing, separate bug while this task is already touching these two files' owned-card rendering path:** a user-uploaded replacement image (`uploadedImages` in the store, set via `CardImage`'s upload fallback for a card with no real TCGdex image) never reaches Binder view at all — `BinderSlot`'s `isOwned` branch calls `<CardImage imageBase={ownedCardImageBase} .../>` with no `uploadedImageUri` prop, so an uploaded image only ever shows inside the Picker, never on the binder slot itself once that card is owned. (The same gap in Card-view tiles was already fixed directly in `Tile.tsx`/`DexGrid.tsx`, outside this plan, specifically BEFORE this task started, to avoid colliding with this task's own in-flight edits to `BinderSlot.tsx`/`BinderView.tsx` — that fix is the reference pattern for this one.) Do this as part of Step 1-3 below, alongside the new blank-slot work, not as an afterthought:

- Add `uploadedImageUri?: string` to `BinderSlotProps` in `src/components/BinderSlot.tsx`, and pass it through to the EXISTING owned-card `<CardImage imageBase={ownedCardImageBase} .../>` call (the `isOwned` branch, unrelated to the new blank-slot-with-customImage branch this task also adds): `<CardImage imageBase={ownedCardImageBase} uploadedImageUri={uploadedImageUri} alt={...} className={styles.cardImage} loading="lazy" />`.
- In `src/components/BinderView.tsx`, read `const uploadedImages = useAppStore((s) => s.uploadedImages);` alongside the store selectors already destructured near the top of the component, and extend the existing `ownedCardImageByDexNumber` memo (or add a sibling `uploadedImageUriByDexNumber` memo, keyed the same way) to also resolve each owned dex number's `uploadedImages[ownedRecord.cardId]`. Thread it through `BinderPageProps`/`BinderPage`'s existing `ownedCardImageByDexNumber` plumbing (added in Task 4) the same way, and pass it into `BinderSlot`'s new `uploadedImageUri` prop, keyed on `entry.dexNumber`, only when `entry?.type === 'pokemon'` (same conditional pattern already used for `ownedCardImageBase`/`pokemonName`/`spriteUrl`).
- Add a `BinderSlot.test.tsx` test: given `ownedCardImageBase=""` (no real image) and `uploadedImageUri="data:image/jpeg;base64,ABC"`, the slot renders that uploaded image via `CardImage`, not the "no image available" placeholder.
- Add a `BinderView.test.tsx` test mirroring the DexGrid one already added for Card view: seed a cached card with an empty `imageBase`, mark it owned, set `uploadedImages` for that card id, render `BinderView`, and assert the slot shows the uploaded image.

**Also add a click-to-enlarge button on owned binder slots, while this task is already touching this file:** `src/components/CardZoomOverlay.tsx` (a portal-to-`document.body` overlay showing one card large, with the same `useCardTilt` holo effect, reused via `CardImage`) and a magnifying-glass icon in `src/components/icons/TabIcons.tsx` already exist by the time this task runs (built separately, before this task started) — read both in full first, do not redraw the icon or reimplement the overlay. Add a small enlarge button to an OWNED `BinderSlot` (mirroring exactly how the same feature was added to Card-view `Tile`s — read `src/components/Tile.tsx` and `src/components/DexGrid.tsx` for the established pattern: button placement, `stopPropagation` so it doesn't also trigger the slot's own `onClick`/`onSelect`, and where the zoomed-card state lives). Manage the zoomed-card state in `BinderView.tsx` (not `BinderSlot`, keeping `BinderSlot` presentational, matching the existing split), threading an `onEnlarge` callback down through `BinderPage` into `BinderSlot` the same way `onEditCustomImage`/`onSlotClick` already are. Only show the enlarge button on a `pokemon`-type entry that `isOwned` — never on a blank slot (custom-image or not) or an unowned Pokemon slot. Add tests to `BinderSlot.test.tsx` (button appears only when owned, clicking it doesn't also trigger the slot's normal click) and `BinderView.test.tsx` (clicking Enlarge on an owned slot opens the overlay with the right card and the binder's own `uploadedImages` resolution already computed elsewhere in this task).

- [ ] **Step 1: Write the failing tests for `BinderSlot`'s new blank-with-custom-image behavior**

```tsx
// src/components/BinderSlot.test.tsx — add to the existing describe block
it('renders a plain non-interactive blank when not in manual arrange and there is no onEditCustomImage handler', () => {
  render(<BinderSlot entry={{ type: 'blank' }} onClick={() => {}} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('renders an interactive "add image" affordance for a blank slot when onEditCustomImage is provided and not in manual arrange', async () => {
  const onEditCustomImage = vi.fn();
  render(<BinderSlot entry={{ type: 'blank' }} onClick={() => {}} onEditCustomImage={onEditCustomImage} />);
  await userEvent.click(screen.getByRole('button', { name: /add a custom image/i }));
  expect(onEditCustomImage).toHaveBeenCalledTimes(1);
});

it('permanently renders a blank slot\'s custom image instead of the add-image affordance', () => {
  render(
    <BinderSlot
      entry={{
        type: 'blank',
        customImage: { dataUri: 'data:image/png;base64,ABC', offsetX: 0.1, offsetY: 0, zoom: 1.5 },
      }}
      onClick={() => {}}
      onEditCustomImage={() => {}}
    />
  );
  expect(screen.getByAltText('Custom binder slot image')).toBeInTheDocument();
});

it('does not offer to edit a blank slot\'s custom image while manual arrange is active (drag/select takes priority)', () => {
  render(
    <BinderSlot
      entry={{ type: 'blank' }}
      onClick={() => {}}
      onEditCustomImage={() => {}}
      isManualArrangeActive
    />
  );
  expect(screen.queryByRole('button', { name: /add a custom image/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/BinderSlot.test.tsx`
Expected: FAIL — `onEditCustomImage` prop doesn't exist yet, blanks are always a bare inert `div`.

- [ ] **Step 3: Update `BinderSlot.tsx`**

```tsx
// src/components/BinderSlot.tsx — full new content
import { useState } from 'react';
import type { BinderSlotEntry } from '../types';
import { CardImage } from './CardImage';
import styles from './BinderSlot.module.css';

export interface BinderSlotProps {
  entry: BinderSlotEntry | undefined;
  pokemonName?: string;
  spriteUrl?: string;
  ownedCardImageBase?: string;
  // A user-uploaded replacement image for the owned card (see CardImage's
  // own uploadedImageUri prop) -- only relevant when isOwned; unrelated to
  // a blank slot's own `customImage` (that's the crop-editor filler-image
  // feature this task also adds, a completely separate path).
  uploadedImageUri?: string;
  onClick: (dexNumber: number) => void;
  isManualArrangeActive?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  // Only relevant for a `blank` entry, and only outside manual-arrange mode
  // (dragging/selecting takes priority over editing while rearranging).
  // Undefined suppresses the affordance entirely -- BinderView only passes
  // this in the flow where blank-slot editing genuinely makes sense.
  onEditCustomImage?: () => void;
}

export function BinderSlot({
  entry,
  pokemonName,
  spriteUrl,
  ownedCardImageBase,
  uploadedImageUri,
  onClick,
  isManualArrangeActive = false,
  isSelected = false,
  onSelect,
  onDragStart,
  onDrop,
  onEditCustomImage,
}: BinderSlotProps) {
  const [isRevealed, setIsRevealed] = useState(false);

  if (!entry || entry.type === 'blank') {
    const customImage = entry?.type === 'blank' ? entry.customImage : undefined;

    if (customImage) {
      return (
        <div className={[styles.slot, styles.owned].join(' ')}>
          <button
            type="button"
            className={styles.customImageButton}
            onClick={onEditCustomImage}
            disabled={!onEditCustomImage || isManualArrangeActive}
            aria-label="Edit custom binder slot image"
          >
            <img
              src={customImage.dataUri}
              alt="Custom binder slot image"
              className={styles.cardImage}
              style={{
                objectPosition: `${50 + customImage.offsetX * 100}% ${50 + customImage.offsetY * 100}%`,
                transform: `scale(${customImage.zoom})`,
              }}
            />
          </button>
        </div>
      );
    }

    if (onEditCustomImage && !isManualArrangeActive) {
      return (
        <button
          type="button"
          className={styles.blankEditable}
          onClick={onEditCustomImage}
          aria-label="Add a custom image to this slot"
        >
          +
        </button>
      );
    }

    return <div className={styles.blank} aria-hidden="true" />;
  }

  const isOwned = ownedCardImageBase !== undefined;
  const label = isManualArrangeActive
    ? `Select ${pokemonName}`
    : `Click to see the special art card options for ${pokemonName}.`;

  return (
    <button
      type="button"
      className={[styles.slot, isOwned ? styles.owned : '', isSelected ? styles.selected : '']
        .filter(Boolean)
        .join(' ')}
      draggable={isManualArrangeActive}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        if (isManualArrangeActive) event.preventDefault();
      }}
      onDrop={onDrop}
      onClick={() => (isManualArrangeActive ? onSelect?.() : onClick(entry.dexNumber))}
      onMouseEnter={() => setIsRevealed(true)}
      onMouseLeave={() => setIsRevealed(false)}
      onFocus={() => setIsRevealed(true)}
      onBlur={() => setIsRevealed(false)}
      aria-label={label}
      aria-pressed={isManualArrangeActive ? isSelected : undefined}
    >
      {isOwned ? (
        <CardImage
          imageBase={ownedCardImageBase}
          uploadedImageUri={uploadedImageUri}
          alt={`${pokemonName} card`}
          className={styles.cardImage}
          loading="lazy"
        />
      ) : (
        isRevealed &&
        spriteUrl &&
        pokemonName && <img src={spriteUrl} alt={pokemonName} loading="lazy" />
      )}
    </button>
  );
}
```

- [ ] **Step 4: Add the new CSS classes to `BinderSlot.module.css`**

```css
/* src/components/BinderSlot.module.css — add these rules, leave every existing rule unchanged */
.blankEditable {
  border-radius: var(--radius-md);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.blankEditable:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.6);
}

.customImageButton {
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  overflow: hidden;
  border-radius: calc(var(--radius-md) - 1px);
}
```

- [ ] **Step 5: Run the BinderSlot tests to verify they pass**

Run: `npm test -- src/components/BinderSlot.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire `BinderView.tsx` to pass `onEditCustomImage` down and render the `SlotImageEditor` when a blank slot is being edited**

```tsx
// src/components/BinderView.tsx — add near the other useState declarations
const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

function handleSaveCustomImage(customImage: import('../types').CustomSlotImage) {
  if (editingSlotIndex === null) return;
  setBinderSlotCustomImage(activeBinder.id, editingSlotIndex, customImage);
  setEditingSlotIndex(null);
}
```

Import `SlotImageEditor`, `setBinderSlotCustomImage` (from the store, alongside the other `setBinder*` selectors already destructured at the top of the component), and pass `onEditCustomImage={() => setEditingSlotIndex(slotIndex)}` down through `BinderPage`'s props (added in Task 4) into each `BinderSlot`, matching the same `slotIndex` computation already used for `isSelected`/`onSelect`. Only pass it through when `entry?.type === 'blank'` — reuse the existing conditional pattern already present for `pokemonName`/`spriteUrl`/`ownedCardImageBase` in `BinderPage`'s `BinderSlot` invocation:

```tsx
// src/components/BinderView.tsx — inside BinderPage's BinderSlot invocation, add this prop
onEditCustomImage={
  entry?.type === 'blank' ? () => onEditSlot(slotIndex) : undefined
}
```

(`onEditSlot` is a new required prop threaded through `BinderPageProps`, wired from the main component as `onEditSlot={setEditingSlotIndex}`.)

While you're here: also thread the pre-existing `uploadedImages` fix described at the top of this task through the exact same path. In the main `BinderView` component, add `const uploadedImages = useAppStore((s) => s.uploadedImages);` alongside the other store selectors, and extend the `ownedCardImageByDexNumber` memo (from an earlier task) with a sibling `uploadedImageUriByDexNumber` memo built the same way but resolving `uploadedImages[card.id]` instead of `card.imageBase`. Add `uploadedImageUriByDexNumber: Map<number, string>` to `BinderPageProps`, thread it into the `BinderPage` invocation the same way `ownedCardImageByDexNumber` already is, and in `BinderPage`'s own `BinderSlot` invocation add:

```tsx
// src/components/BinderView.tsx — inside BinderPage's BinderSlot invocation, alongside the existing ownedCardImageBase line
uploadedImageUri={
  entry?.type === 'pokemon' ? uploadedImageUriByDexNumber.get(entry.dexNumber) : undefined
}
```

Render the editor as an overlay when `editingSlotIndex !== null`, using the same portal-to-`document.body` pattern `ManageGroupsPanel.tsx` already established for exactly this "ancestor establishes its own stacking context" problem (the binder's own `.spread` isn't `position: sticky`, but rendering the editor inline within the zoomed/transformed `.spread` would inherit that `scale()` transform, visually shrinking the editor along with the binder — portaling out avoids that entirely, for the same class of reason `ManageGroupsPanel` already documents):

```tsx
// src/components/BinderView.tsx — add near the top of the file
import { createPortal } from 'react-dom';
import { SlotImageEditor } from './SlotImageEditor';

// ...in the JSX, as a sibling of the top-level .binder div's closing tag, inside the same return's fragment/root
{editingSlotIndex !== null &&
  createPortal(
    <div className={styles.editorOverlay} role="dialog" aria-label="Edit custom binder slot image">
      <SlotImageEditor
        initialImage={
          sequence[editingSlotIndex]?.type === 'blank'
            ? (sequence[editingSlotIndex] as { type: 'blank'; customImage?: import('../types').CustomSlotImage }).customImage ?? null
            : null
        }
        onSave={handleSaveCustomImage}
        onCancel={() => setEditingSlotIndex(null)}
      />
    </div>,
    document.body
  )}
```

Add the overlay styling to `BinderView.module.css`:

```css
/* src/components/BinderView.module.css — add this rule */
.editorOverlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 10, 8, 0.6);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: var(--space-4);
}
```

- [ ] **Step 7: Add a BinderView-level test covering the end-to-end flow**

```tsx
// src/components/BinderView.test.tsx — add to the manual-arrange describe block or a new one
it('marking a slot empty, then clicking it, opens the custom image editor; saving persists the image to that slot', async () => {
  render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
  await userEvent.click(screen.getByRole('button', { name: /select bulbasaur/i }));
  await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

  // Manual arrange is still on; turning it off is what makes the blank slot
  // editable, matching BinderSlot's own isManualArrangeActive gating.
  const { rerender } = render(
    <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
  );
  rerender(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);

  await userEvent.click(screen.getByRole('button', { name: /add a custom image to this slot/i }));
  expect(screen.getByRole('dialog', { name: /edit custom binder slot image/i })).toBeInTheDocument();
});
```

(Adjust this test once you see the real rendered structure after Steps 3–6 land — the exact query for "which slot is now blank" depends on `insertBlankAt`'s shift behavior already covered by the existing "Keep empty" tests above it in the same file; use the same `activeBinderCustomOrder()` helper already defined near the top of `BinderView.test.tsx` to assert on the underlying data if querying the DOM directly proves awkward for this particular case.)

- [ ] **Step 8: Run the full test suite, typecheck, and lint; fix anything that breaks**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 9: Commit**

```bash
git add src/components/BinderSlot.tsx src/components/BinderSlot.module.css src/components/BinderView.tsx src/components/BinderView.module.css src/components/BinderView.test.tsx
git commit -m "Wire binder slots to render and edit custom filler images"
```

---

### Task 9: Make "Manual arrange" and "Keep empty" genuinely discoverable

**Files:**
- Modify: `src/components/BinderSettings.tsx`
- Test: `src/components/BinderSettings.test.tsx`

Today "Manual arrange" is the very last control in a long Binder Settings list, which is why "Keep empty" (only reachable after turning it on, selecting a slot) was effectively invisible. Move it to the top of Binder Settings, directly under the binder-switcher, so it's the first thing visible without scrolling.

- [ ] **Step 1: Write the failing test asserting the new order**

```tsx
// src/components/BinderSettings.test.tsx — add this test
it('places the Manual arrange toggle before the grid size / page count / fill direction controls', () => {
  render(
    <BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />
  );
  const settingsRoot = screen.getByRole('group', { name: /binder settings/i }) ?? document.body;
  const allText = settingsRoot.textContent ?? '';
  const manualArrangeIndex = allText.indexOf('Manual arrange');
  const pageCountIndex = allText.indexOf('Page count');
  expect(manualArrangeIndex).toBeGreaterThan(-1);
  expect(pageCountIndex).toBeGreaterThan(-1);
  expect(manualArrangeIndex).toBeLessThan(pageCountIndex);
});
```

If `<fieldset>` doesn't expose an accessible `role="group"` with the expected name via its `<legend>` in the testing environment, query by the fieldset element directly instead (`document.querySelector('fieldset')`) — verify which works once the test runs, and use whichever query actually resolves the element in this codebase's existing testing-library setup (check an existing `BinderSettings.test.tsx` test for the established pattern first).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/BinderSettings.test.tsx`
Expected: FAIL — Manual arrange currently renders last.

- [ ] **Step 3: Reorder `BinderSettings.tsx`**

Move the `<button type="button" aria-pressed={isManualArrangeActive} onClick={onToggleManualArrange}>Manual arrange</button>` block (and the "Reset arrangement" button that conditionally follows it) from the end of the `<fieldset>` to immediately after the "New binder" button and before the "Binder name" field. No other content or props change — this is a pure reordering within the existing JSX.

- [ ] **Step 4: Run the BinderSettings tests to verify they pass**

Run: `npm test -- src/components/BinderSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `npm test -- --run`, `npm run typecheck`, `npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderSettings.tsx src/components/BinderSettings.test.tsx
git commit -m "Move Manual arrange to the top of Binder Settings so Keep empty is discoverable"
```

---

### Task 10: Full-feature integration review

Per this project's established practice: once every task above has individually passed its own tests, dispatch one more review pass scoped to the WHOLE redesign's diff (`git diff` against the commit before Task 1 started), specifically hunting for bugs at the seams between independently-correct pieces -- e.g.: does the zoom transform in Task 5 interact correctly with the measured slot sizing from Task 3/4 (a `scale()` transform shouldn't cause `ResizeObserver` to report a shrunk/grown `contentRect`, since CSS transforms don't affect layout size, but confirm this empirically rather than assuming); does opening the `SlotImageEditor` from a slot correctly resolve which binder/slot when the user has switched binders since last rendering (mirroring the `activeBinder.id`-keyed reset already proven necessary for `dragFromIndex`/`selectedIndex` in the original binder-view work); does the G-mode click-to-exit correctly avoid swallowing a click on the zoom slider itself or on Binder Settings controls (a real click a user might reasonably make while zoom mode happens to still be active); does the new `isManualArrangeActive`-gated blank-slot editability correctly re-render when manual arrange is toggled off mid-session (not just on fresh mount). Fix anything found, with regression tests, before considering this plan complete.

**Queued from a Task 3 spec-compliance review:** commit `85ca29a`, landed during Task 3 and titled as a Task 3 fix, added an undeclared `.dexGridPanel`/`.panel` height-chain mechanism to `src/App.module.css`, `src/App.tsx`, `src/components/DexGrid.module.css`, and `src/components/DexGrid.tsx` -- none of which are in any task's declared Files list anywhere in this plan, and this mechanism isn't described anywhere in this plan either. It exists because `src/state/binderSlotSizing.ts`'s `ResizeObserver`-driven measurement collapses toward a near-zero degenerate size in a live browser without it, a regression `BinderView.test.tsx` can't catch since its `ResizeObserver` mock hardcodes a healthy 900x600 `contentRect`. That same commit's `.binder` edit in `BinderView.module.css` (`align-items: stretch; height: 100%; min-height: 0;`) used Task 4 Step 1's own values roughly 30 minutes before Task 4's commit (`bdd2ae3`) landed, so `bdd2ae3`'s actual diff only adds `.spread`'s and `.page`'s own rules on top of already-present `.binder` values -- account for that when auditing what Task 4 itself contributed, not just Task 3. Both deviations are disclosed in code comments at each affected site (`App.module.css`'s `.dexGridPanel`, `App.tsx`'s and `DexGrid.tsx`'s use of it, `DexGrid.module.css`'s `.panel`, and `BinderView.module.css`'s `.binder`) and in commit `a445496`, which is disclosure-only and makes no functional change. As part of this review pass, decide whether the height-chain mechanism should stay adopted as-is (reverting it reintroduces the collapse-to-near-zero bug) or be restructured, and formally close out this audit-trail gap since it currently lives on a commit labeled as a Task 3 fix rather than its own disclosed commit.

- [ ] **Step 1: Manual live verification in the browser** (per this project's `<preview_tools>` convention): start the dev server, exercise every feature from this plan in Binder view -- full-screen layout on every tab, page-flip animation, two-page-spread sizing vs. a lone first page, the zoom slider and G-mode, marking a slot empty and adding/editing a custom image, and confirm nothing from the earlier binder-view build (drag-and-drop rearranging, per-binder language, owned-card art) regressed.
- [ ] **Step 2: Resolve the queued Task 3/Task 4 height-chain audit-trail gap described above** -- confirm the mechanism is still required (re-test with it removed and confirm the collapse-to-near-zero bug returns in a live browser, then restore it), and record the resolution in this plan section so the gap is closed rather than left open-ended.
- [ ] **Step 3: Fix anything else found, with regression tests, following the same TDD pattern as every task above.**
- [ ] **Step 4: Final full-suite run**: `npm test -- --run`, `npm run typecheck`, `npm run lint` -- all clean.
- [ ] **Step 5: Push**: `git push` (only after explicit confirmation this is wanted, per this session's standing practice of verifying before every push).
