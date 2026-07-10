import { motion } from 'framer-motion';
import type { TileState } from '../state/selectors';
import styles from './Tile.module.css';

export interface TileProps {
  dexNumber: number;
  name: string;
  spriteUrl: string;
  state: TileState;
  view: 'sprite' | 'card';
  ownedCardImageUrl?: string;
  onClick: () => void;
}

export function Tile({
  dexNumber,
  name,
  spriteUrl,
  state,
  view,
  ownedCardImageUrl,
  onClick,
}: TileProps) {
  const title =
    state === 'unavailable'
      ? `No special or full art cards have been released yet for ${name}.`
      : state === 'owned'
        ? `You own a card for ${name}. Click to change or remove it.`
        : `Click to see the special art card options for ${name}.`;

  const showCardImage = view === 'card' && ownedCardImageUrl;

  return (
    <motion.button
      type="button"
      className={[styles.tile, styles[`tile--${state}`]].filter(Boolean).join(' ')}
      onClick={onClick}
      title={title}
      layout
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <span className={styles.number}>#{String(dexNumber).padStart(3, '0')}</span>
      {showCardImage ? (
        <img src={ownedCardImageUrl} alt={`${name} card`} loading="lazy" />
      ) : (
        <img src={spriteUrl} alt={name} loading="lazy" />
      )}
      <span className={styles.name}>{name}</span>
    </motion.button>
  );
}
