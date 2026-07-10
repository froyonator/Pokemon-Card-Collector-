import { motion } from 'framer-motion';
import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import { useAppStore } from '../state/store';
import type { CardRecord, Condition } from '../types';
import { ConditionPicker } from './ConditionPicker';
import styles from './Picker.module.css';

export interface PickerProps {
  dexNumber: number;
  pokemonName: string;
  cards: CardRecord[];
  onClose: () => void;
}

export function Picker({ dexNumber, pokemonName, cards, onClose }: PickerProps) {
  const owned = useAppStore((s) => s.owned[dexNumber]);
  const wishlist = useAppStore((s) => s.wishlist[dexNumber]);
  const markOwned = useAppStore((s) => s.markOwned);
  const unmarkOwned = useAppStore((s) => s.unmarkOwned);
  const toggleWishlist = useAppStore((s) => s.toggleWishlist);

  const [pendingCard, setPendingCard] = useState<CardRecord | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleStarClick(card: CardRecord, event: React.MouseEvent) {
    event.stopPropagation();
    const result = toggleWishlist(dexNumber, card.id);
    setWarning(result.ok ? null : (result.reason ?? 'That card could not be added.'));
  }

  function handleConditionConfirm(condition: Condition) {
    if (!pendingCard) return;
    markOwned(dexNumber, pendingCard.id, condition);
    setPendingCard(null);
    onClose();
  }

  if (pendingCard) {
    return (
      <motion.div
        className={styles.overlay}
        role="dialog"
        aria-label={`Choose condition for ${pendingCard.name}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className={styles.panel}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <ConditionPicker
            cardName={pendingCard.name}
            onConfirm={handleConditionConfirm}
            onCancel={() => setPendingCard(null)}
          />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={styles.overlay}
      role="dialog"
      aria-label={`Card options for ${pokemonName}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className={styles.header}>
          <h2>{pokemonName}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {owned && (
          <button type="button" className={styles.unmark} onClick={() => unmarkOwned(dexNumber)}>
            Remove owned card
          </button>
        )}
        {warning && (
          <p role="alert" className={styles.warning}>
            {warning}
          </p>
        )}
        {cards.length === 0 ? (
          <p>No special or full art cards match your current filters for {pokemonName} yet.</p>
        ) : (
          <div className={styles.grid}>
            {cards.map((card) => {
              const isOwned = owned?.cardId === card.id;
              const isWishlisted = wishlist?.cardId === card.id;
              return (
                <div key={card.id} className={styles.card}>
                  <button
                    type="button"
                    className={styles.star}
                    aria-label={
                      isWishlisted
                        ? `Remove ${card.name} from wishlist`
                        : `Add ${card.name} to wishlist`
                    }
                    aria-pressed={isWishlisted}
                    onClick={(event) => handleStarClick(card, event)}
                  >
                    {isWishlisted ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    className={isOwned ? styles.cardBodySelected : styles.cardBody}
                    onClick={() => setPendingCard(card)}
                  >
                    <img
                      src={cardImageUrl(card.imageBase)}
                      alt={`${card.name} from ${card.setName}`}
                    />
                    <span>
                      {card.setName} #{card.localId}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
