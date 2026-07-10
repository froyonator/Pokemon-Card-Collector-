import { useState } from 'react';
import type { BinderSlotEntry } from '../types';
import styles from './BinderSlot.module.css';

export interface BinderSlotProps {
  entry: BinderSlotEntry | undefined;
  pokemonName?: string;
  spriteUrl?: string;
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
  onClick,
  isManualArrangeActive = false,
  isSelected = false,
  onSelect,
  onDragStart,
  onDrop,
}: BinderSlotProps) {
  // The sprite only enters the DOM on hover/focus rather than always
  // rendering with opacity: 0 -- a binder slot's whole point is that its
  // contents are a surprise until revealed, so the image shouldn't be
  // queryable (e.g. by assistive tech or tests) while it's hidden.
  const [isRevealed, setIsRevealed] = useState(false);

  if (!entry || entry.type === 'blank') {
    return <div className={styles.blank} aria-hidden="true" />;
  }

  const label = isManualArrangeActive
    ? `Select ${pokemonName}`
    : `Click to see the special art card options for ${pokemonName}.`;

  return (
    <button
      type="button"
      className={[styles.slot, isSelected ? styles.selected : ''].filter(Boolean).join(' ')}
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
      {isRevealed && spriteUrl && pokemonName && (
        <img src={spriteUrl} alt={pokemonName} loading="lazy" />
      )}
    </button>
  );
}
