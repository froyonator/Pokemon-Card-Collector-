import { useMemo, useState } from 'react';
import { CardImage } from './CardImage';
import {
  buildWishlistRows,
  sortRows,
  type SortDirection,
  type SortKey,
  type WishlistRow,
} from '../state/collectionSelectors';
import { priceInCurrency } from '../state/priceDisplay';
import { useAppStore } from '../state/store';
import { useUsdRates } from '../state/useUsdRates';
import styles from './DataTable.module.css';

export function WishlistTable() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const wishlist = useAppStore((s) => s.wishlist);
  const removeWishlist = useAppStore((s) => s.removeWishlist);
  // priceVersion is bumped by Summary's "Refresh Market Prices" action.
  // Pricing is baked into each row at build time via getCachedPricing, so
  // it's included in the useMemo deps below (not just subscribed to) —
  // otherwise a price refresh wouldn't invalidate the memoized rows and
  // this table would keep showing stale prices after a refresh.
  const priceVersion = useAppStore((s) => s.priceVersion);
  const usdRates = useUsdRates();

  const [sortKey, setSortKey] = useState<SortKey>('dexNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const priceSource = currency === 'EUR' ? 'cardmarket' : 'tcgplayer';

  function priceOf(row: WishlistRow): number | null {
    return priceInCurrency(
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
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  // Memoized so the card cache blob (every ${language}:${dexNumber} entry
  // ever cached, across every language the user has browsed, not bounded by
  // wishlist size) and the price cache blob are only re-parsed when
  // language, wishlist, or priceVersion actually change — not on every
  // re-render, including ones triggered by sortKey/sortDirection changing
  // when a header is clicked. See collectionSelectors.ts's comment on
  // buildWishlistRows for why calling it unmemoized here would be costly.
  // priceVersion itself is never read inside the callback — pricing is
  // pulled fresh from the (localStorage-backed) price cache via
  // buildWishlistRows's own getCachedPricing call, not from a value closed
  // over here. It's a pure cache-busting signal, same as DexGrid.tsx's
  // dataVersion in its cardsByDexNumber memo, and the `void` reference
  // below exists only so react-hooks/exhaustive-deps sees it as used and
  // doesn't flag it as an unnecessary dependency.
  const rows = useMemo(() => {
    void priceVersion;
    return buildWishlistRows(language, wishlist);
  }, [language, wishlist, priceVersion]);

  if (rows.length === 0) {
    return <p className={styles.empty}>Your wishlist is empty.</p>;
  }

  const sortedRows = sortRows(rows, sortKey, sortDirection, priceOf);
  const total = rows.reduce((sum, row) => sum + (priceOf(row) ?? 0), 0);

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>
              <button type="button" onClick={() => toggleSort('dexNumber')}>
                Dex #
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort('name')}>
                Name
              </button>
            </th>
            <th>Card</th>
            <th>
              <button type="button" onClick={() => toggleSort('price')}>
                Price
              </button>
            </th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const price = priceOf(row);
            return (
              <tr key={row.dexNumber}>
                <td>#{String(row.dexNumber).padStart(3, '0')}</td>
                <td>{row.pokemonName}</td>
                <td>
                  {row.card && (
                    <CardImage imageBase={row.card.imageBase} alt={row.card.name} width={48} />
                  )}
                </td>
                <td>{price !== null ? `${price.toFixed(2)} ${currency}` : 'Unknown'}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Remove ${row.pokemonName}`}
                    onClick={() => removeWishlist(row.dexNumber)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>Total to complete wishlist: {total.toFixed(2)} {currency}</p>
    </>
  );
}
