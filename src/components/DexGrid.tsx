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
import { CardZoomOverlay } from './CardZoomOverlay';
import { Picker } from './Picker';
import type { DexView } from './Sidebar';
import { Tile } from './Tile';
import styles from './DexGrid.module.css';

export interface DexGridProps {
  view: DexView;
  isManualArrangeActive: boolean;
  // Passed straight through to BinderView -- see that component's own
  // onExitManualArrange prop for why this needs to be threaded down rather
  // than owned locally (isManualArrangeActive itself is lifted all the way
  // up to App.tsx). Optional, matching BinderView's own prop: only
  // meaningful once the binder view is actually showing, which most
  // existing callers/tests here (sprite/card view) never reach.
  onExitManualArrange?: () => void;
  onLoadingChange: (isLoading: boolean) => void;
  // Bumped by the parent (via Sidebar's Refresh Data button) to trigger a
  // refresh from outside -- a counter, not a boolean, so bumping it twice in
  // a row (e.g. two quick clicks) is still two distinct triggers instead of
  // being collapsed by React's state-equality check on an unchanged value.
  refreshRequestId: number;
}

export function DexGrid({
  view,
  isManualArrangeActive,
  onExitManualArrange,
  onLoadingChange,
  refreshRequestId,
}: DexGridProps) {
  const language = useAppStore((s) => s.language);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const owned = useAppStore((s) => s.owned);
  const uploadedImages = useAppStore((s) => s.uploadedImages);
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
  // The card currently shown large in CardZoomOverlay, opened via a Tile's
  // Enlarge button. Kept here rather than in Tile (which stays
  // presentational) so this overlay -- and the specific CardRecord it shows
  // -- is owned by the same component that already resolves ownedCard per
  // dex entry in the grid map below.
  const [zoomedCard, setZoomedCard] = useState<CardRecord | null>(null);
  // Kept local (in addition to reporting every transition up via
  // onLoadingChange for Sidebar's Refresh button, now rendered outside this
  // component) because the tile grid below needs this exact value, in the
  // same render, to distinguish "still loading" from "confirmed empty" per
  // dex number -- see isLoadingDex below and the self-heal comment next to
  // it. Both this state and the prop callback are set together at every
  // call site, so they never disagree.
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
    onLoadingChange(true);
    loadAllCardData(language, {
      dexEntries: missingEntries,
      owned,
      signal: controller.signal,
      onDexLoaded: () => {
        if (loadGeneration.current !== thisGeneration) return;
        scheduleDataVersionBump();
      },
    }).finally(() => {
      if (loadGeneration.current !== thisGeneration) return;
      setIsLoading(false);
      onLoadingChange(false);
      // A final catch-all flush: cheap no-op if nothing changed since the
      // last onDexLoaded-triggered bump, but guarantees the last dex
      // number's data is reflected even if its onDexLoaded fired in the
      // same frame as unmount or some other edge case.
      setDataVersion((v) => v + 1);
    });
    // onLoadingChange deliberately omitted: this effect should only re-run
    // when the actual data to load changes (language/dexEntries), not
    // whenever the parent happens to pass a new function identity for the
    // callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, dexEntries]);

  async function handleRefreshData() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadGeneration.current += 1;
    const thisGeneration = loadGeneration.current;

    setIsLoading(true);
    onLoadingChange(true);
    await loadAllCardData(language, {
      dexEntries,
      owned,
      signal: controller.signal,
      onDexLoaded: () => {
        if (loadGeneration.current !== thisGeneration) return;
        scheduleDataVersionBump();
      },
    });
    if (loadGeneration.current !== thisGeneration) return;
    setIsLoading(false);
    onLoadingChange(false);
    setDataVersion((v) => v + 1);
  }

  // Fires handleRefreshData whenever the parent (Sidebar's Refresh Data
  // button, via App) bumps refreshRequestId. Skips the very first render
  // (refreshRequestId starts at 0 and shouldn't trigger a refresh before the
  // user has ever clicked the button) by tracking the previous value in a
  // ref.
  const previousRefreshRequestId = useRef(refreshRequestId);
  useEffect(() => {
    if (refreshRequestId === previousRefreshRequestId.current) return;
    previousRefreshRequestId.current = refreshRequestId;
    handleRefreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRequestId]);

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
  // Deliberately NOT sourced from cardsByDexNumber: that memo is keyed on
  // the grid's own global `language`, but a Picker opened from a binder
  // slot needs cards cached under THAT binder's language instead, which can
  // differ from the grid's current global language. Reading the cache
  // directly for just this one dex number (cheap -- a single lookup, not
  // the full 151-entry memo) keeps the two cases correct without forking
  // this into two separate code paths: when openPickerLanguage is unset,
  // effectivePickerLanguage just falls back to the same global language
  // cardsByDexNumber would have used anyway.
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
    // styles.panel here is an out-of-scope, undisclosed-at-the-time addition
    // from commit 85ca29a -- see DexGrid.module.css's .panel rule for the
    // full disclosure.
    <div className={styles.panel}>
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
          onExitManualArrange={onExitManualArrange}
        />
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
                  uploadedImageUri={ownedCard ? uploadedImages[ownedCard.id] : undefined}
                  onEnlarge={ownedCard ? () => setZoomedCard(ownedCard) : undefined}
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
            languageOverride={openPickerLanguage}
          />
        )}
      </AnimatePresence>
      {zoomedCard && (
        <CardZoomOverlay
          card={zoomedCard}
          uploadedImageUri={uploadedImages[zoomedCard.id]}
          onClose={() => setZoomedCard(null)}
        />
      )}
    </div>
  );
}
