import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { spriteUrl } from '../api/pokeapi';
import { cardImageUrl } from '../api/tcgdex';
import { entriesForGenerations } from '../data/generations';
import { getAllCachedCardsForDex, loadAllCardData } from '../state/loadCardData';
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

  useEffect(() => {
    if (dexEntries.length === 0) return;
    // Per-dex-number check, not a per-language one: this is what makes a
    // newly-selected generation get auto-fetched even after this language
    // was already cached for a previously-selected generation.
    const missingEntries = dexEntries.filter(
      (entry) => getCachedCards(language, entry.number) === undefined
    );
    if (missingEntries.length === 0) return;
    setIsLoading(true);
    loadAllCardData(language, { dexEntries: missingEntries }).finally(() => {
      setIsLoading(false);
      setDataVersion((v) => v + 1);
    });
  }, [language, dexEntries]);

  async function handleRefreshData() {
    setIsLoading(true);
    await loadAllCardData(language, { dexEntries });
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
  const cardsByDexNumber = useMemo(() => {
    // dataVersion itself is never read below — it's a pure cache-busting
    // signal. The underlying data lives in localStorage (outside React's
    // reactivity), so this is how the effect above tells this memo "the
    // cache just changed, go re-read it" after a load completes. The `void`
    // reference is only here so react-hooks/exhaustive-deps sees dataVersion
    // as used and doesn't flag it as an unnecessary dependency.
    void dataVersion;
    const map = new Map<number, CardRecord[]>();
    for (const entry of dexEntries) {
      map.set(entry.number, getAllCachedCardsForDex(language, entry.number));
    }
    return map;
  }, [language, dexEntries, dataVersion]);

  const openEntry = openDexNumber ? dexEntries.find((e) => e.number === openDexNumber) : undefined;
  const openCards = openEntry
    ? availableCardsForDex(cardsByDexNumber.get(openEntry.number) ?? [], activeSet)
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
            const allCards = cardsByDexNumber.get(entry.number) ?? [];
            const cards = availableCardsForDex(allCards, activeSet);
            const ownedRecord = owned[entry.number];
            const state = computeTileState(Boolean(ownedRecord), cards.length);
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
                  ownedCardImageUrl={ownedCard ? cardImageUrl(ownedCard.imageBase) : undefined}
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
