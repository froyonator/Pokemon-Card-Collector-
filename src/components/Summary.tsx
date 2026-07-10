import { useMemo, useState } from 'react';
import { entriesForGenerations } from '../data/generations';
import { buildCollectionRows } from '../state/collectionSelectors';
import { getAllCachedCardsForDex } from '../state/loadCardData';
import { refreshMarketPrices } from '../state/loadPricing';
import { priceInCurrency } from '../state/priceDisplay';
import { activeRarities, availableCardsForDex } from '../state/selectors';
import { useAppStore } from '../state/store';
import { useUsdRates } from '../state/useUsdRates';
import styles from './Summary.module.css';

export function Summary() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const owned = useAppStore((s) => s.owned);
  const wishlist = useAppStore((s) => s.wishlist);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const priceVersion = useAppStore((s) => s.priceVersion);
  const bumpPriceVersion = useAppStore((s) => s.bumpPriceVersion);
  const usdRates = useUsdRates();

  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);

  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  async function handleRefreshPrices() {
    setIsRefreshingPrices(true);
    await refreshMarketPrices(language, owned, wishlist);
    bumpPriceVersion();
    setIsRefreshingPrices(false);
  }

  const totalOwned = Object.keys(owned).length;
  const priceSource = currency === 'EUR' ? 'cardmarket' : 'tcgplayer';

  // Memoized so the card cache blob and the price cache blob are only
  // re-parsed when language, owned, or priceVersion actually change — not on
  // every re-render, including ones triggered by isRefreshingPrices toggling
  // during handleRefreshPrices. Same pattern as CollectionTable.tsx's rows
  // useMemo. priceVersion itself is never read inside the callback — pricing
  // is pulled fresh from the (localStorage-backed) price cache via
  // buildCollectionRows's own getCachedPricing call, not from a value closed
  // over here. It's a pure cache-busting signal, same as DexGrid.tsx's
  // dataVersion in its cardsByDexNumber memo, and the `void` reference below
  // exists only so react-hooks/exhaustive-deps sees it as used and doesn't
  // flag it as an unnecessary dependency.
  const rows = useMemo(() => {
    void priceVersion;
    return buildCollectionRows(language, owned);
  }, [language, owned, priceVersion]);

  const totalValue = rows.reduce((sum, row) => {
    const amount = priceInCurrency(
      {
        cardId: row.card?.id ?? '',
        cardmarketEurAvg: row.cardmarketEurAvg,
        tcgplayerUsdMarket: row.tcgplayerUsdMarket,
        fetchedAt: '',
      },
      priceSource,
      currency,
      usdRates
    ).amount;
    return sum + (amount ?? 0);
  }, 0);

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
  // render, including ones triggered by unrelated state like
  // isRefreshingPrices toggling during handleRefreshPrices. Same
  // full-blob-reparse hazard as DexGrid.tsx's cardsByDexNumber memo. Keyed
  // on the memoized activeSet above (not on groups/activeGroupIds directly)
  // so this only recomputes when the actual rarity filter changes.
  const availableCount = useMemo(
    () =>
      dexEntries.filter(
        (entry) =>
          availableCardsForDex(getAllCachedCardsForDex(language, entry.number), activeSet)
            .length > 0
      ).length,
    [language, dexEntries, activeSet]
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
        <span className={styles.label}>Pokemon with a card owned</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.value}>
          {totalValue.toFixed(2)} {currency}
        </span>
        <span className={styles.label}>Total collection value</span>
      </div>
      <button type="button" onClick={handleRefreshPrices} disabled={isRefreshingPrices}>
        {isRefreshingPrices ? 'Refreshing prices...' : 'Refresh Market Prices'}
      </button>
      <div className={styles.progress}>
        <div className={styles.progressLabel}>
          {totalOwned} of {availableCount} Pokemon with an available card under current filters
        </div>
        {/* Decorative: the progressLabel text above already states the same
            information in words, so the bar itself is redundant for screen
            reader users rather than adding a role="progressbar" here. */}
        <div className={styles.progressBarTrack} aria-hidden="true">
          <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
