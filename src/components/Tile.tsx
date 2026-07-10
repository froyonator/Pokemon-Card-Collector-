import { motion, useReducedMotion } from 'framer-motion';
import type { TileState } from '../state/selectors';
import { CardImage } from './CardImage';
import styles from './Tile.module.css';

export interface TileProps {
  dexNumber: number;
  name: string;
  spriteUrl: string;
  state: TileState;
  view: 'sprite' | 'card';
  ownedCardImageBase?: string;
  onClick: () => void;
}

export function Tile({
  dexNumber,
  name,
  spriteUrl,
  state,
  view,
  ownedCardImageBase,
  onClick,
}: TileProps) {
  const shouldReduceMotion = useReducedMotion();
  const title =
    state === 'unavailable'
      ? `No special or full art cards have been released yet for ${name}.`
      : state === 'owned'
        ? `You own a card for ${name}. Click to change or remove it.`
        : `Click to see the special art card options for ${name}.`;

  return (
    <motion.button
      type="button"
      className={[styles.tile, styles[`tile--${state}`]].filter(Boolean).join(' ')}
      onClick={onClick}
      title={title}
      layout={!shouldReduceMotion}
      whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
      transition={
        shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 }
      }
    >
      <span className={styles.number}>#{String(dexNumber).padStart(3, '0')}</span>
      {view === 'card' && ownedCardImageBase !== undefined ? (
        <CardImage imageBase={ownedCardImageBase} alt={`${name} card`} loading="lazy" width={68} />
      ) : (
        <img src={spriteUrl} alt={name} loading="lazy" />
      )}
      <span className={styles.name}>{name}</span>
    </motion.button>
  );
}
