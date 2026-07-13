import { useState } from 'react';
import { DEFAULT_COVER_COLOR } from '../data/binderCovers';
import { useAppStore } from '../state/store';
import type { Binder } from '../types';
import { TrashIcon } from './icons/TabIcons';
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
        {binders.map((binder) => (
          <BinderVolume
            key={binder.id}
            binder={binder}
            onOpenBinder={onOpenBinder}
            isOnlyBinder={binders.length <= 1}
          />
        ))}
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

interface BinderVolumeProps {
  binder: Binder;
  onOpenBinder: (id: string) => void;
  // The app requires at least one binder to always exist (BinderView derives
  // the open binder as `binders.find(...) ?? binders[0]` with no empty-shelf
  // guard of its own), so the last surviving binder can't be deleted -- the
  // delete button is shown but disabled, with a title explaining why, rather
  // than hidden outright.
  isOnlyBinder: boolean;
}

// One volume on the shelf. Split out from BinderShelf mainly for readability
// -- each binder gets its own local delete-confirm state.
function BinderVolume({ binder, onOpenBinder, isOnlyBinder }: BinderVolumeProps) {
  const color = binder.cover?.color ?? DEFAULT_COVER_COLOR;
  const coverImageUri = binder.cover?.coverImageUri;
  const deleteBinder = useAppStore((s) => s.deleteBinder);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  return (
    <li className={styles.slot}>
      {/* Wraps the turning book button and the delete affordance that sits
          on top of it -- a sibling overlay, not a nested button, since a
          <button> can't legally contain another <button>. Also carries the
          perspective for the book's 3D turn, so each volume gets its own
          vanishing point rather than sharing one across the whole shelf. */}
      <div className={styles.bookWrap}>
        {/* The stationary hit target: hover/focus on this button drives the
            whole turn via CSS only (see .volume below), so the hit area
            stays put and clickable through the animation instead of sliding
            around with a transformed element. */}
        <button
          type="button"
          className={styles.book}
          aria-label={`Open ${binder.name}`}
          onClick={() => onOpenBinder(binder.id)}
        >
          <span className={styles.volume}>
            <span className={styles.pagesEdge} aria-hidden="true" />
            <span className={styles.cover} style={{ backgroundColor: color }} aria-hidden="true">
              {coverImageUri ? (
                <>
                  <img className={styles.coverPlate} src={coverImageUri} alt="" />
                  {/* Scrim so the title stays legible over a bright or busy
                      picture; the empty-state emblem needs no such thing. */}
                  <span className={styles.coverScrim} aria-hidden="true" />
                </>
              ) : (
                <span className={styles.coverEmblem} />
              )}
              <span className={styles.coverStitch} />
              <span
                className={
                  coverImageUri
                    ? `${styles.coverTitle} ${styles.coverTitleOnImage}`
                    : styles.coverTitle
                }
              >
                {binder.name}
              </span>
            </span>
            <span
              className={styles.spineStrip}
              style={{ backgroundColor: color }}
              aria-hidden="true"
            >
              <span className={styles.spineText}>{binder.cover?.spineText || binder.name}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={`Delete binder ${binder.name}`}
          title={isOnlyBinder ? 'At least one binder must remain' : `Delete binder ${binder.name}`}
          disabled={isOnlyBinder}
          onClick={() => setIsConfirmingDelete(true)}
        >
          <TrashIcon />
        </button>
      </div>
      <span className={styles.plaque}>{binder.name}</span>
      {isConfirmingDelete && (
        <div role="dialog" aria-label={`Delete binder ${binder.name}`} className={styles.deleteConfirm}>
          <p>
            Delete &ldquo;{binder.name}&rdquo;? This removes the binder and its page layout,
            including any custom slot pictures inside it. Your card collection and wishlist are
            not affected.
          </p>
          <div className={styles.deleteConfirmActions}>
            <button
              type="button"
              onClick={() => {
                deleteBinder(binder.id);
                setIsConfirmingDelete(false);
              }}
            >
              Delete binder
            </button>
            <button type="button" onClick={() => setIsConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
