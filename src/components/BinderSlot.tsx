import { useState } from 'react';
import type { BinderSlotEntry } from '../types';
import { CardImage } from './CardImage';
import { MagnifyIcon } from './icons/TabIcons';
import styles from './BinderSlot.module.css';

export interface BinderSlotProps {
  entry: BinderSlotEntry | undefined;
  pokemonName?: string;
  spriteUrl?: string;
  // The actual card art for this Pokemon's owned card, once one has been
  // picked via the option picker. When set, the slot permanently shows this
  // card instead of the black/hover-reveal-sprite placeholder -- a binder
  // slot's whole point is to look like the real card once you've filled it.
  ownedCardImageBase?: string;
  // A user-uploaded replacement image for the owned card (see CardImage's
  // own uploadedImageUri prop) -- only relevant when isOwned; unrelated to
  // a blank slot's own `customImage` (that's the crop-editor filler-image
  // feature below, a completely separate path).
  uploadedImageUri?: string;
  onClick: (dexNumber: number) => void;
  isManualArrangeActive?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  // Only relevant for a `blank` entry, and only outside manual-arrange mode
  // (dragging/selecting takes priority over editing while rearranging).
  // Undefined suppresses the affordance entirely -- BinderView only passes
  // this in the flow where blank-slot editing genuinely makes sense.
  onEditCustomImage?: () => void;
  // Fired when the small "Enlarge" button on an OWNED pokemon slot is
  // clicked -- mirrors Card-view Tile's own onEnlarge exactly. BinderSlot
  // stays presentational, same as Tile: it has no idea what CardZoomOverlay
  // even is, it just reports the click and leaves the zoomed-card state to
  // BinderView. Omitted entirely by callers that never need this, in which
  // case the button simply never renders.
  onEnlarge?: () => void;
}

export function BinderSlot({
  entry,
  pokemonName,
  spriteUrl,
  ownedCardImageBase,
  uploadedImageUri,
  onClick,
  isManualArrangeActive = false,
  isSelected = false,
  onSelect,
  onDragStart,
  onDrop,
  onEditCustomImage,
  onEnlarge,
}: BinderSlotProps) {
  // Only relevant for the not-yet-owned case: an owned slot always shows its
  // card permanently, so there's no "surprise until revealed" left to gate
  // on hover. The sprite only enters the DOM on hover/focus rather than
  // always rendering with opacity: 0 -- while unowned, a binder slot's whole
  // point is that its contents are a surprise until revealed, so the image
  // shouldn't be queryable (e.g. by assistive tech or tests) while hidden.
  const [isRevealed, setIsRevealed] = useState(false);

  if (!entry || entry.type === 'blank') {
    const customImage = entry?.type === 'blank' ? entry.customImage : undefined;

    if (customImage) {
      return (
        <div className={[styles.slot, styles.owned].join(' ')}>
          <button
            type="button"
            className={styles.customImageButton}
            onClick={onEditCustomImage}
            disabled={!onEditCustomImage || isManualArrangeActive}
            aria-label="Edit custom binder slot image"
          >
            <img
              src={customImage.dataUri}
              alt="Custom binder slot image"
              className={styles.cardImage}
              style={{
                objectPosition: `${50 + customImage.offsetX * 100}% ${50 + customImage.offsetY * 100}%`,
                transform: `scale(${customImage.zoom})`,
              }}
            />
          </button>
        </div>
      );
    }

    if (onEditCustomImage && !isManualArrangeActive) {
      return (
        <button
          type="button"
          className={styles.blankEditable}
          onClick={onEditCustomImage}
          aria-label="Add a custom image to this slot"
        >
          +
        </button>
      );
    }

    return <div className={styles.blank} aria-hidden="true" />;
  }

  const isOwned = ownedCardImageBase !== undefined;
  const label = isManualArrangeActive
    ? `Select ${pokemonName}`
    : `Click to see the special art card options for ${pokemonName}.`;
  // Only an owned slot has real card art worth enlarging -- an unowned slot
  // shows the black/hover-reveal-sprite placeholder instead (nothing to
  // zoom into). Also requires onEnlarge itself, so callers that never wire
  // up the zoom feature don't get a button with nothing to call. Mirrors
  // Card-view Tile's own showEnlarge condition exactly.
  const showEnlarge = isOwned && Boolean(onEnlarge);

  return (
    <div className={styles.slotWrapper}>
      <button
        type="button"
        className={[styles.slot, isOwned ? styles.owned : '', isSelected ? styles.selected : '']
          .filter(Boolean)
          .join(' ')}
        draggable={isManualArrangeActive}
        onDragStart={onDragStart}
        onDragOver={(event) => {
          if (isManualArrangeActive) event.preventDefault();
        }}
        onDrop={onDrop}
        onClick={() => (isManualArrangeActive ? onSelect?.() : onClick(entry.dexNumber))}
        onMouseEnter={() => setIsRevealed(true)}
        onMouseLeave={() => setIsRevealed(false)}
        onFocus={() => setIsRevealed(true)}
        onBlur={() => setIsRevealed(false)}
        aria-label={label}
        aria-pressed={isManualArrangeActive ? isSelected : undefined}
      >
        {isOwned ? (
          <CardImage
            imageBase={ownedCardImageBase}
            uploadedImageUri={uploadedImageUri}
            alt={`${pokemonName} card`}
            className={styles.cardImage}
            loading="lazy"
            preferHighQuality
          />
        ) : (
          isRevealed &&
          spriteUrl &&
          pokemonName && <img src={spriteUrl} alt={pokemonName} loading="lazy" />
        )}
      </button>
      {showEnlarge && (
        // A sibling of the slot's own <button> above (both positioned via
        // .slotWrapper), not nested inside it -- the slot is itself a real
        // <button>, and nesting another one inside it would be invalid
        // button-in-button HTML (same reason Tile's own Enlarge button sits
        // next to, not inside, its tile). stopPropagation keeps this inert
        // to the slot's own onClick regardless.
        <button
          type="button"
          className={styles.enlarge}
          aria-label={`Enlarge ${pokemonName} card`}
          onClick={(event) => {
            event.stopPropagation();
            onEnlarge?.();
          }}
        >
          <MagnifyIcon />
        </button>
      )}
    </div>
  );
}
