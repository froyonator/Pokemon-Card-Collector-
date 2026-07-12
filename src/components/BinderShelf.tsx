import { useState } from 'react';
import { DEFAULT_COVER_COLOR } from '../data/binderCovers';
import type { Binder } from '../types';
import styles from './BinderShelf.module.css';

export interface BinderShelfProps {
  binders: Binder[];
  // Fired with the clicked binder's id -- the caller owns making it active
  // and swapping to the open-binder view.
  onOpenBinder: (id: string) => void;
  // Fired with the new binder's chosen name; the caller owns actually
  // creating it (and, per the store's createBinder, making it active).
  onCreateBinder: (name: string) => void;
}

// The binder library: every binder standing on a shelf as a leather-bound
// volume, cover slightly ajar, spine lettered -- click one to lay it open.
// The last slot is always the "start a new binder" ghost volume.
export function BinderShelf({ binders, onOpenBinder, onCreateBinder }: BinderShelfProps) {
  const [isNaming, setIsNaming] = useState(false);
  const [newName, setNewName] = useState('');

  function submitNewBinder() {
    const name = newName.trim();
    onCreateBinder(name === '' ? 'New Binder' : name);
    setIsNaming(false);
    setNewName('');
  }

  return (
    <section className={styles.shelf} aria-label="Your binders">
      <header className={styles.header}>
        <h2 className={styles.heading}>Your binders</h2>
        <p className={styles.subheading}>Pick a binder to lay it open on the desk.</p>
      </header>
      <ul className={styles.row}>
        {binders.map((binder) => {
          const color = binder.cover?.color ?? DEFAULT_COVER_COLOR;
          return (
            <li key={binder.id} className={styles.slot}>
              <button
                type="button"
                className={styles.book}
                aria-label={`Open ${binder.name}`}
                onClick={() => onOpenBinder(binder.id)}
              >
                <span className={styles.pagesEdge} aria-hidden="true" />
                <span
                  className={styles.cover}
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                >
                  <span className={styles.coverStitch} />
                  {binder.cover?.coverImageUri ? (
                    <img
                      className={styles.coverPlate}
                      src={binder.cover.coverImageUri}
                      alt=""
                    />
                  ) : (
                    <span className={styles.coverEmblem} />
                  )}
                  <span className={styles.coverTitle}>{binder.name}</span>
                </span>
                <span className={styles.spineStrip} style={{ backgroundColor: color }} aria-hidden="true">
                  <span className={styles.spineText}>
                    {binder.cover?.spineText || binder.name}
                  </span>
                </span>
              </button>
              <span className={styles.plaque}>{binder.name}</span>
            </li>
          );
        })}
        <li className={styles.slot}>
          {isNaming ? (
            <form
              className={styles.namingForm}
              onSubmit={(event) => {
                event.preventDefault();
                submitNewBinder();
              }}
            >
              <label className={styles.namingLabel}>
                Binder name
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="e.g. Shinies"
                />
              </label>
              <div className={styles.namingActions}>
                <button type="submit">Create</button>
                <button type="button" onClick={() => setIsNaming(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className={`${styles.book} ${styles.bookGhost}`}
              aria-label="New binder"
              onClick={() => setIsNaming(true)}
            >
              <span className={styles.ghostPlus} aria-hidden="true">
                +
              </span>
              <span className={styles.ghostLabel}>New binder</span>
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}
