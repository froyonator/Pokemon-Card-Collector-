import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spriteUrl } from '../api/pokeapi';
import { entriesForGenerations } from '../data/generations';
import { loadAllCardData } from '../state/loadCardData';
import { activeRarities, availableCardsForDex, computeTileState } from '../state/selectors';
import { useAppStore } from '../state/store';
import { getCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';
import { Picker } from './Picker';
import { Tile } from './Tile';
import styles from './DexGrid.module.css';

export function DexGrid() {
  const language = useAppStore((s) => s.language);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const owned = useAppStore((s) => s.owned);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);

  const [view, setView] = useState<'sprite' | 'card'>('sprite');
  const [openDexNumber, setOpenDexNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  // Memoized so the array reference is stable across renders that don't
  // change selectedGenerations, and reused below by the auto-load effect,
  // the tile map, and the openEntry lookup, instead of recomputing the
  // filter/flatMap/sort at up to three separate call sites per render.
  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  // Coalesces the up-to-151 individual onDexLoaded callbacks fired during a
  // cold-start load into at most one dataVersion bump per animation frame,
  // so tiles update incrementally as data streams in without triggering a
  // full re-render (and full localStorage cache re-read across every dex
  // number, which cardsByDexNumber's memo below does) on every single
  // dex-number completion.
  const dataVersionBumpScheduled = useRef(false);
  function scheduleDataVersionBump() {
    if (dataVersionBumpScheduled.current) return;
    dataVersionBumpScheduled.current = true;
    requestAnimationFrame(() => {
      dataVersionBumpScheduled.current = false;
      setDataVersion((v) => v + 1);
    });
  }

  // Tracks which auto-load/refresh call is the most recently started one.
  // Both call sites bump this ref and only let their own completion touch
  // isLoading/dataVersion state if they're still the current generation by
  // the time they resolve -- otherwise a straggling STALE call's
  // `.finally()`/onDexLoaded would clobber state a NEWER call already owns.
  // That alone would be harmless if it just meant a stale re-render, but
  // since isLoadingDex feeds straight into computeTileState, it would flip
  // still-loading tiles to "unavailable" instead of "loading" for the rest
  // of the newer load's duration.
  const loadGeneration = useRef(0);

  // The generation ref above only silences a stale call's effect on THIS
  // component's own state -- it does nothing to stop the stale call's
  // underlying fetches from continuing to run in the background, consuming
  // real network/API request budget alongside the newer load's own fetches.
  // This controller is aborted and replaced every time a new generation
  // starts (in both the auto-load effect and handleRefreshData), so
  // switching language/generation, or clicking Refresh, actually cancels
  // whatever was still in flight instead of just racing it.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Aborts any still-in-flight load if the component unmounts entirely,
  // so navigating away doesn't leave an abandoned fetch running.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (dexEntries.length === 0) return;
    // Per-dex-number check, not a per-language one: this is what makes a
    // newly-selected generation get auto-fetched even after this language
    // was already cached for a previously-selected generation.
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
      // A final catch-all flush: cheap no-op if nothing changed since the
      // last onDexLoaded-triggered bump, but guarantees the last dex
      // number's data is reflected even if its onDexLoaded fired in the
      // same frame as unmount or some other edge case.
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

  // Memoized so the cache blob (all languages x all dex numbers ever cached)
  // is only re-parsed once per dex entry when language, dexEntries, or
  // dataVersion actually change, not on every re-render — including ones
  // triggered by unrelated state like `owned` changing after
  // markOwned/unmarkOwned. Deliberately NOT keyed on `owned`: the cached
  // cards for a dex number don't change when ownership changes.
  //
  // Stores the raw getCachedCards result (CardRecord[] | undefined), not the
  // []-defaulted getAllCachedCardsForDex, so "never fetched yet" (undefined)
  // stays distinguishable from "fetched, genuinely zero cards" ([]) — that
  // distinction is exactly what the loading tile state below needs. Callers
  // that just want the cards array default to [] downstream, at the point
  // of use.
  const cardsByDexNumber = useMemo(() => {
    // dataVersion itself is never read below — it's a pure cache-busting
    // signal. The underlying data lives in localStorage (outside React's
    // reactivity), so this is how the effect above tells this memo "the
    // cache just changed, go re-read it" after a load completes. The `void`
    // reference is only here so react-hooks/exhaustive-deps sees dataVersion
    // as used and doesn't flag it as an unnecessary dependency.
    void dataVersion;
    const map = new Map<number, CardRecord[] | undefined>();
    for (const entry of dexEntries) {
      map.set(entry.number, getCachedCards(language, entry.number));
    }
    return map;
  }, [language, dexEntries, dataVersion]);

  const openEntry = openDexNumber ? dexEntries.find((e) => e.number === openDexNumber) : undefined;
  const openCards = openEntry
    ? availableCardsForDex(
        cardsByDexNumber.get(openEntry.number) ?? [],
        activeSet,
        cardOverrides,
        activeGroupIds
      )
    : [];

  return (
    <div>
      <div className={styles.toolbar}>
        <div
          className={styles.viewToggle}
          role="radiogroup"
          aria-label="View"
          data-tutorial="view-toggle"
        >
          <button type="button" aria-pressed={view === 'sprite'} onClick={() => setView('sprite')}>
            Sprite view
          </button>
          <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')}>
            Card view
          </button>
        </div>
        <button
          type="button"
          onClick={handleRefreshData}
          disabled={isLoading}
          data-tutorial="refresh-data"
        >
          {isLoading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      {dexEntries.length === 0 ? (
        <p className={styles.emptyState}>
          Select at least one generation in the filter bar to see Pokemon here.
        </p>
      ) : (
        <div className={styles.grid} data-version={dataVersion}>
          {dexEntries.map((entry) => {
            const hasLoaded = cardsByDexNumber.get(entry.number) !== undefined;
            const allCards = cardsByDexNumber.get(entry.number) ?? [];
            const cards = availableCardsForDex(allCards, activeSet, cardOverrides, activeGroupIds);
            const ownedRecord = owned[entry.number];
            // Self-heals if a fetch fails outright for some dex number: once
            // isLoading flips back to false in loadAllCardData's .finally(),
            // any dex number that never got a cache entry (its request
            // errored) falls through to hasLoaded=false, isLoading=false ->
            // not 'loading' -> the availableCount === 0 branch ->
            // 'unavailable', a reasonable fallback instead of a spinner
            // stuck forever.
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
                  onClick={() => setOpenDexNumber(entry.number)}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* mode="wait": a keyboard user can Tab past the visually-covered grid
          (tiles stay focusable under the overlay) and activate a different
          tile while a Picker is open, jumping openDexNumber straight from
          one Pokemon to another without passing through null. Without
          "wait", AnimatePresence's default "sync" mode would let the
          outgoing Picker's exit animation and the incoming Picker's enter
          animation run concurrently — two stacked role="dialog" overlays
          on screen at once. "wait" forces the outgoing one to fully exit
          first. */}
      <AnimatePresence mode="wait">
        {openEntry && (
          <Picker
            key={openEntry.number}
            dexNumber={openEntry.number}
            pokemonName={openEntry.name}
            cards={openCards}
            onClose={() => setOpenDexNumber(null)}
            onAllCardsLoaded={() => setDataVersion((v) => v + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
