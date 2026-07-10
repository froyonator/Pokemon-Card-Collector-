import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
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
  // Subscribing to priceVersion (bumped by Summary's "Refresh Market Prices"
  // action) forces this table to re-read the price cache after a refresh.
  useAppStore((s) => s.priceVersion);
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

  const rows = buildWishlistRows(language, wishlist);

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
                    <img src={cardImageUrl(row.card.imageBase)} alt={row.card.name} width={48} />
                  )}
                </td>
                <td>{price !== null ? `${price.toFixed(2)} ${currency}` : 'Unknown'}</td>
                <td>
                  <button type="button" onClick={() => removeWishlist(row.dexNumber)}>
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
