import { useMemo, useState } from 'react';
import { CardImage } from './CardImage';
import {
  buildCollectionRows,
  sortRows,
  type SortDirection,
  type SortKey,
} from '../state/collectionSelectors';
import { useAppStore } from '../state/store';
import styles from './DataTable.module.css';

export function CollectionTable() {
  const language = useAppStore((s) => s.language);
  const owned = useAppStore((s) => s.owned);
  const unmarkOwned = useAppStore((s) => s.unmarkOwned);

  const [sortKey, setSortKey] = useState<SortKey>('dexNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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
  // collection size) is only re-parsed when language or owned actually
  // change — not on every re-render, including ones triggered by
  // sortKey/sortDirection changing when a header is clicked. See
  // collectionSelectors.ts's comment on buildCollectionRows for why calling
  // it unmemoized here would be costly.
  const rows = useMemo(() => buildCollectionRows(language, owned), [language, owned]);

  if (rows.length === 0) {
    return <p className={styles.empty}>You have not marked any cards as owned yet.</p>;
  }

  const sortedRows = sortRows(rows, sortKey, sortDirection);

  return (
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
          <th>Condition</th>
          <th>Remove</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => (
          <tr key={row.dexNumber}>
            <td>#{String(row.dexNumber).padStart(3, '0')}</td>
            <td>{row.pokemonName}</td>
            <td>
              {row.card && (
                <CardImage
                  imageBase={row.card.imageBase}
                  hostedThumbUrl={row.card.hostedThumbUrl}
                  alt={row.card.name}
                  width={48}
                />
              )}
            </td>
            <td>{row.condition}</td>
            <td>
              <button
                type="button"
                aria-label={`Remove ${row.pokemonName}`}
                onClick={() => unmarkOwned(row.dexNumber)}
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
