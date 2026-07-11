import { useState } from 'react';
import type { BinderSlotEntry } from '../types';
import { CardImage } from './CardImage';
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
  onClick: (dexNumber: number) => void;
  isManualArrangeActive?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
}

export function BinderSlot({
  entry,
  pokemonName,
  spriteUrl,
  ownedCardImageBase,
  onClick,
  isManualArrangeActive = false,
  isSelected = false,
  onSelect,
  onDragStart,
  onDrop,
}: BinderSlotProps) {
  // Only relevant for the not-yet-owned case: an owned slot always shows its
  // card permanently, so there's no "surprise until revealed" left to gate
  // on hover. The sprite only enters the DOM on hover/focus rather than
  // always rendering with opacity: 0 -- while unowned, a binder slot's whole
  // point is that its contents are a surprise until revealed, so the image
  // shouldn't be queryable (e.g. by assistive tech or tests) while hidden.
  const [isRevealed, setIsRevealed] = useState(false);

  if (!entry || entry.type === 'blank') {
    return <div className={styles.blank} aria-hidden="true" />;
  }

  const isOwned = ownedCardImageBase !== undefined;
  const label = isManualArrangeActive
    ? `Select ${pokemonName}`
    : `Click to see the special art card options for ${pokemonName}.`;

  return (
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
  );
}
