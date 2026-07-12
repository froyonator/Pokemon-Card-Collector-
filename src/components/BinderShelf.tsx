import { useState } from 'react';
import { DEFAULT_COVER_COLOR } from '../data/binderCovers';
import { useBinderTilt } from '../state/useBinderTilt';
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
        {binders.map((binder) => (
          <BinderVolume key={binder.id} binder={binder} onOpenBinder={onOpenBinder} />
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
}

// One volume on the shelf. Split out from BinderShelf so useBinderTilt --
// which tracks its own hover/rect state -- gets one hook instance per
// binder rather than being called from inside a .map(), which would break
// the rules of hooks as the binder list grows and shrinks.
function BinderVolume({ binder, onOpenBinder }: BinderVolumeProps) {
  const color = binder.cover?.color ?? DEFAULT_COVER_COLOR;
  const coverImageUri = binder.cover?.coverImageUri;
  const tilt = useBinderTilt();

  return (
    <li className={styles.slot}>
      {/* The stationary hit target the tilt math measures against (see
          useBinderTilt) -- it never itself transforms, so the pointer can't
          slide the tracked rect out from under itself mid-hover. The
          .volume child below is what actually leans with the cursor. */}
      <button
        type="button"
        className={styles.book}
        aria-label={`Open ${binder.name}`}
        onClick={() => onOpenBinder(binder.id)}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        ref={tilt.ref}
      >
        <span
          className={tilt.isActive ? `${styles.volume} ${styles.volumeTilting}` : styles.volume}
          style={tilt.style}
        >
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
                coverImageUri ? `${styles.coverTitle} ${styles.coverTitleOnImage}` : styles.coverTitle
              }
            >
              {binder.name}
            </span>
          </span>
          <span className={styles.spineStrip} style={{ backgroundColor: color }} aria-hidden="true">
            <span className={styles.spineText}>{binder.cover?.spineText || binder.name}</span>
          </span>
        </span>
      </button>
      <span className={styles.plaque}>{binder.name}</span>
    </li>
  );
}
