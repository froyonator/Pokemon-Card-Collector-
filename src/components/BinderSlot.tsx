import { useState } from 'react';
import type { BinderSlotEntry } from '../types';
import styles from './BinderSlot.module.css';

export interface BinderSlotProps {
  entry: BinderSlotEntry | undefined;
  pokemonName?: string;
  spriteUrl?: string;
  onClick: (dexNumber: number) => void;
}

export function BinderSlot({ entry, pokemonName, spriteUrl, onClick }: BinderSlotProps) {
  // The sprite only enters the DOM on hover/focus rather than always
  // rendering with opacity: 0 -- a binder slot's whole point is that its
  // contents are a surprise until revealed, so the image shouldn't be
  // queryable (e.g. by assistive tech or tests) while it's hidden.
  const [isRevealed, setIsRevealed] = useState(false);

  if (!entry || entry.type === 'blank') {
    return <div className={styles.blank} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      className={styles.slot}
      onClick={() => onClick(entry.dexNumber)}
      onMouseEnter={() => setIsRevealed(true)}
      onMouseLeave={() => setIsRevealed(false)}
      onFocus={() => setIsRevealed(true)}
      onBlur={() => setIsRevealed(false)}
      aria-label={`Click to see the special art card options for ${pokemonName}.`}
    >
      {isRevealed && spriteUrl && pokemonName && (
        <img src={spriteUrl} alt={pokemonName} loading="lazy" />
      )}
    </button>
  );
}
