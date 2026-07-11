import { useEffect, useMemo, useState } from 'react';
import { fetchSets } from '../api/tcgdex';
import { entriesForGenerations } from '../data/generations';
import { getAllCachedCardsForDex } from '../state/loadCardData';
import { activeRarities, availableCardsForDex } from '../state/selectors';
import { useAppStore } from '../state/store';
import styles from './Summary.module.css';

export function Summary() {
  const language = useAppStore((s) => s.language);
  const owned = useAppStore((s) => s.owned);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);

  const [newestSetName, setNewestSetName] = useState<string | null>(null);

  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  // TCGdex's set list appears to be returned in release order (confirmed by
  // spot-checking known-recent set ids against their position in the array),
  // so the last entry is the newest set the card database currently knows
  // about. This is purely a "how current is the data we're drawing from"
  // indicator, not a promise that every card in that set (or any set) is
  // fully indexed -- a brand-new set can still have gaps in TCGdex's own
  // data (e.g. missing dex numbers) even once it shows up here. A failed
  // fetch just leaves this unset; it's not worth a retry/error UI for a
  // low-stakes informational label.
  useEffect(() => {
    let cancelled = false;
    fetchSets(language)
      .then((sets) => {
        if (cancelled) return;
        setNewestSetName(sets.length > 0 ? sets[sets.length - 1].name : null);
      })
      .catch(() => {
        if (!cancelled) setNewestSetName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const totalOwned = Object.keys(owned).length;

  // Memoized so activeRarities (which builds a brand-new Set on every call)
  // has a stable reference across renders that don't change groups or
  // activeGroupIds. Same pattern as DexGrid.tsx's activeSet useMemo. Without
  // this, the availableCount memo below would see a new activeSet identity
  // on every render and never actually skip recomputation.
  const activeSet = useMemo(
    () => activeRarities(groups, activeGroupIds),
    [groups, activeGroupIds]
  );

  // Memoized so getAllCachedCardsForDex — which re-parses the full card
  // cache blob — isn't called once per dex entry (up to 151 times) on every
  // render. Same full-blob-reparse hazard as DexGrid.tsx's cardsByDexNumber
  // memo. Keyed on the memoized activeSet above (not on
  // groups/activeGroupIds directly) so this only recomputes when the actual
  // rarity filter changes.
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

  // Clamped to 100: totalOwned counts every owned card regardless of the
  // active generation/rarity filters, while availableCount is scoped to
  // both. A user who owns cards outside the current filter selection can
  // push totalOwned above availableCount, which would otherwise compute a
  // fill width over 100% (silently clipped today by progressBarTrack's
  // overflow: hidden, but not something to rely on).
  const progressPercent =
    availableCount === 0 ? 0 : Math.min(100, Math.round((totalOwned / availableCount) * 100));

  return (
    <div className={styles.summary}>
      <div className={styles.stat}>
        <span className={styles.value}>
          {totalOwned} / {dexEntries.length}
        </span>
        <span className={styles.label}>Pokémon with a card owned</span>
      </div>
      <div className={styles.progress}>
        <div className={styles.progressLabel}>
          {totalOwned} of {availableCount} Pokémon with an available card under current filters
        </div>
        {/* Decorative: the progressLabel text above already states the same
            information in words, so the bar itself is redundant for screen
            reader users rather than adding a role="progressbar" here. */}
        <div className={styles.progressBarTrack} aria-hidden="true">
          <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      {newestSetName && (
        <p className={styles.dataCurrency}>
          Card database current through: <strong>{newestSetName}</strong>
        </p>
      )}
    </div>
  );
}
