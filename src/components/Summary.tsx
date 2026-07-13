import { useEffect, useMemo, useState } from 'react';
import { loadDbVersion } from '../api/dbVersion';
import { fetchSets } from '../api/tcgdex';
import { entriesForGenerations } from '../data/generations';
import { isStaticCoveredLanguage } from '../data/staticCoverage';
import { getAllCachedCardsForDex } from '../state/loadCardData';
import { activeRarities, availableCardsForDex } from '../state/selectors';
import { useAppStore } from '../state/store';
import styles from './Summary.module.css';

// Best-effort formatting of the static database's build-timestamp version
// stamp (see api/dbVersion.ts) into something readable in the currency
// label below. Falls back to the raw stamp unchanged if it's ever something
// other than a parseable date (e.g. a future format change to that stamp) --
// this is a purely cosmetic label, never worth throwing over.
function formatDbVersion(version: string): string {
  const parsed = new Date(version);
  if (Number.isNaN(parsed.getTime())) return version;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function Summary() {
  const language = useAppStore((s) => s.language);
  const owned = useAppStore((s) => s.owned);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);

  // Two independent shapes for the same "how current is our data" line,
  // never both set at once -- see the effect below. Kept separate (rather
  // than one pre-formatted string) so the label prefix in the JSX can stay
  // accurate to which source actually answered.
  const [newestSetName, setNewestSetName] = useState<string | null>(null);
  const [dbVersionLabel, setDbVersionLabel] = useState<string | null>(null);

  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  // Static-first: for a language the static database covers (every
  // supported language except nl/ru/pl, see data/staticCoverage.ts), this
  // app's card data -- and therefore its own freshness -- is fully
  // determined by that static database's own build-timestamp version stamp
  // (api/dbVersion.ts), fetched from this app's own origin, zero live API
  // calls. This used to call TCGdex's live /sets endpoint for EVERY
  // language on every mount just to show this one informational label,
  // which is exactly the kind of unconditional live traffic this app's
  // "a covered language makes ZERO live calls" contract (see CLAUDE.md)
  // rules out.
  //
  // Live fallback: nl/ru/pl have no static database file at all (a real
  // upstream gap -- see staticCoverage.ts), so the live sets endpoint is the
  // only source of a freshness signal available for them; TCGdex's set list
  // appears to be returned in release order (confirmed by spot-checking
  // known-recent set ids against their position in the array), so the last
  // entry is the newest set it currently knows about. A failed fetch just
  // leaves this unset either way; it's not worth a retry/error UI for a
  // low-stakes informational label.
  useEffect(() => {
    let cancelled = false;
    setNewestSetName(null);
    setDbVersionLabel(null);

    if (isStaticCoveredLanguage(language)) {
      loadDbVersion()
        .then((version) => {
          if (cancelled) return;
          setDbVersionLabel(version ? formatDbVersion(version) : null);
        })
        .catch(() => {
          if (!cancelled) setDbVersionLabel(null);
        });
      return () => {
        cancelled = true;
      };
    }

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
      {dbVersionLabel && (
        <p className={styles.dataCurrency}>
          Card database last updated: <strong>{dbVersionLabel}</strong>
        </p>
      )}
    </div>
  );
}
