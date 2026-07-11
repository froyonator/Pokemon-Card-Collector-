import { motion, useReducedMotion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { loadAllPrintingsForDex } from '../state/loadCardData';
import { resizeImageForUpload } from '../state/imageResize';
import { buildTcgplayerSearchUrl } from '../state/tcgplayerSearch';
import { useAppStore } from '../state/store';
import { useCardTilt, type UseCardTiltResult } from '../state/useCardTilt';
import type { CardRecord, Condition } from '../types';
import { CardImage } from './CardImage';
import { ConditionPicker } from './ConditionPicker';
import styles from './Picker.module.css';

export interface PickerProps {
  dexNumber: number;
  pokemonName: string;
  cards: CardRecord[];
  onClose: () => void;
  // Fired right after a "Show all cards" fetch lands in the localStorage
  // cache. loadAllPrintingsForDex writes straight to localStorage, entirely
  // outside React's reactivity, so nothing tells a parent like DexGrid (whose
  // own cardsByDexNumber is a useMemo keyed on a local dataVersion counter)
  // that the cache just changed. Without this, a card discovered only via
  // "Show all cards" stays invisible to the grid's tile rendering -- not
  // just filtered out, but absent from the array being read -- until
  // something else (e.g. "Refresh Data") happens to bump that counter.
  onAllCardsLoaded?: () => void;
  // Set only when the Picker is opened from a binder slot, whose binder may
  // have its own language distinct from the app's global language setting.
  // When absent, the Picker falls back to the store's global language, same
  // as it always has.
  languageOverride?: string;
}

function mergeCardsById(curated: CardRecord[], full: CardRecord[]): CardRecord[] {
  const merged = new Map<string, CardRecord>();
  for (const card of curated) merged.set(card.id, card);
  for (const card of full) merged.set(card.id, card);
  return Array.from(merged.values());
}

// A thin wrapper so useCardTilt (a hook) can be called once per card without
// calling hooks inside the displayedCards.map() loop below, which would
// break the Rules of Hooks as the number of cards changes across renders
// (e.g. toggling "Show all cards"). Each instance is its own component with
// a stable hook call order, no matter how many cards are rendered.
function PickerCardTilt({
  disabled,
  children,
}: {
  disabled: boolean;
  children: (tilt: UseCardTiltResult) => ReactNode;
}) {
  const tilt = useCardTilt({ disabled });
  return <>{children(tilt)}</>;
}

export function Picker({
  dexNumber,
  pokemonName,
  cards,
  onClose,
  onAllCardsLoaded,
  languageOverride,
}: PickerProps) {
  const shouldReduceMotion = useReducedMotion();
  // The overlay only ever fades, so it needs no reduced-motion variant of
  // its own. The panel normally scales/slides in with a spring; under
  // reduced motion it falls back to a quick opacity-only fade instead so a
  // dialog opening doesn't move or resize on screen.
  const overlayMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };
  const panelMotion = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      }
    : {
        initial: { opacity: 0, scale: 0.95, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 10 },
        transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
      };

  const owned = useAppStore((s) => s.owned[dexNumber]);
  const wishlist = useAppStore((s) => s.wishlist[dexNumber]);
  const markOwned = useAppStore((s) => s.markOwned);
  const unmarkOwned = useAppStore((s) => s.unmarkOwned);
  const toggleWishlist = useAppStore((s) => s.toggleWishlist);
  const storeLanguage = useAppStore((s) => s.language);
  const language = languageOverride ?? storeLanguage;
  const groups = useAppStore((s) => s.groups);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const setCardOverride = useAppStore((s) => s.setCardOverride);
  const uploadedImages = useAppStore((s) => s.uploadedImages);
  const setUploadedImage = useAppStore((s) => s.setUploadedImage);

  const [pendingCard, setPendingCard] = useState<CardRecord | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showAllCards, setShowAllCards] = useState(false);
  const [allCards, setAllCards] = useState<CardRecord[] | null>(null);
  const [isLoadingAllCards, setIsLoadingAllCards] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  function handleStarClick(card: CardRecord, event: React.MouseEvent) {
    event.stopPropagation();
    const result = toggleWishlist(dexNumber, card.id);
    setWarning(result.ok ? null : (result.reason ?? 'That card could not be added.'));
  }

  function handleToggleSelectMode() {
    setIsSelectMode((prev) => !prev);
    setSelectedCardIds(new Set());
  }

  function toggleCardSelected(cardId: string) {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  function handleMarkSelectedNotUsable() {
    for (const cardId of selectedCardIds) {
      setCardOverride(cardId, 'not-usable');
    }
    setIsSelectMode(false);
    setSelectedCardIds(new Set());
  }

  async function handleToggleShowAll() {
    const next = !showAllCards;
    setShowAllCards(next);
    if (next && allCards === null) {
      setIsLoadingAllCards(true);
      const fetched = await loadAllPrintingsForDex(language, dexNumber, pokemonName);
      setAllCards(fetched);
      onAllCardsLoaded?.();
      setIsLoadingAllCards(false);
    }
  }

  // "Show all cards" must never make a card the user could already see
  // disappear: the curated `cards` prop and the fetched full print history
  // are merged (de-duplicated by id, with the full-history copy of a card
  // winning on conflicts) rather than one replacing the other, since the
  // full-history fetch is not guaranteed to be a strict superset of the
  // curated set.
  const displayedCards = showAllCards ? mergeCardsById(cards, allCards ?? []) : cards;

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
        onClick={() => setPendingCard(null)}
        {...overlayMotion}
      >
        <motion.div
          className={styles.panel}
          onClick={(event) => event.stopPropagation()}
          {...panelMotion}
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
      onClick={onClose}
      {...overlayMotion}
    >
      <motion.div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        {...panelMotion}
      >
        <div className={styles.header}>
          <h2>{pokemonName}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className={styles.toolbar}>
          <button
            type="button"
            aria-pressed={showAllCards}
            disabled={isLoadingAllCards}
            onClick={handleToggleShowAll}
          >
            {showAllCards ? 'Show curated cards' : 'Show all cards'}
          </button>
          <button type="button" aria-pressed={isSelectMode} onClick={handleToggleSelectMode}>
            {isSelectMode ? '✕ Cancel selection' : 'Select cards'}
          </button>
        </div>
        {isSelectMode && (
          <div className={styles.selectBar} role="status">
            <span>{selectedCardIds.size} selected</span>
            <button
              type="button"
              disabled={selectedCardIds.size === 0}
              onClick={handleMarkSelectedNotUsable}
            >
              Mark as Not Usable
            </button>
          </div>
        )}
        {isLoadingAllCards && <p className={styles.loading}>Loading all cards...</p>}
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
        {!isLoadingAllCards && displayedCards.length === 0 ? (
          <p>
            {showAllCards
              ? `No cards are on record for ${pokemonName} yet.`
              : `No special or full art cards match your current filters for ${pokemonName} yet.`}
          </p>
        ) : (
          <div className={styles.grid}>
            {displayedCards.map((card) => {
              const isOwned = owned?.cardId === card.id;
              const isWishlisted = wishlist?.cardId === card.id;
              // Mirrors CardImage's own `!imageBase` check for hasNoImage --
              // the holo tilt effect would look broken tilting a placeholder
              // that's really just Search/Upload buttons. The other half of
              // CardImage's hasNoImage (both real image variants failing to
              // load after the fact) is runtime-only state private to
              // CardImage, not tracked here, since it'd need new plumbing
              // for what's otherwise a rare CDN-failure edge case.
              const hasNoImage = !card.imageBase;
              const baseCardBodyClass = isSelectMode
                ? selectedCardIds.has(card.id)
                  ? styles.cardBodyMultiSelected
                  : styles.cardBody
                : isOwned
                  ? styles.cardBodySelected
                  : styles.cardBody;
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
                  <PickerCardTilt disabled={hasNoImage}>
                    {(tilt) => (
                      // A plain <button> here would nest the placeholder's
                      // own Search/Upload/Remove <button>s (rendered by
                      // CardImage below) inside this outer button, which is
                      // invalid HTML and trips React's validateDOMNesting
                      // warning. A div with an explicit button role,
                      // tabIndex, and matching keyboard handling preserves
                      // the same click/keyboard-activation behavior without
                      // that nesting.
                      <div
                        ref={tilt.ref}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelectMode ? selectedCardIds.has(card.id) : undefined}
                        className={
                          tilt.isActive
                            ? `${baseCardBodyClass} ${styles.cardTilting}`
                            : baseCardBodyClass
                        }
                        style={tilt.style}
                        onMouseMove={tilt.onMouseMove}
                        onMouseLeave={tilt.onMouseLeave}
                        onClick={() =>
                          isSelectMode ? toggleCardSelected(card.id) : setPendingCard(card)
                        }
                        onKeyDown={(event) => {
                          // A keydown event bubbles up from whatever element
                          // is actually focused, regardless of CardImage's
                          // own click-propagation stop (that only stops
                          // click, not keydown). Without this target check,
                          // tabbing to the nested Search/Upload/Remove
                          // button and pressing Enter or Space would fire
                          // that button's own action AND this handler,
                          // spuriously opening the condition picker
                          // alongside it. Only react when the event
                          // originated on this div itself, i.e. this div
                          // (not a focusable descendant of it) is the
                          // focused element.
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (isSelectMode) {
                              toggleCardSelected(card.id);
                            } else {
                              setPendingCard(card);
                            }
                          }
                        }}
                      >
                        <CardImage
                          imageBase={card.imageBase}
                          uploadedImageUri={uploadedImages[card.id]}
                          alt={`${card.name} from ${card.setName}`}
                          className={styles.cardImage}
                          onSearchImage={() =>
                            window.open(buildTcgplayerSearchUrl(card), '_blank', 'noopener,noreferrer')
                          }
                          onUploadImage={(file) => {
                            resizeImageForUpload(file)
                              .then((dataUri) => setUploadedImage(card.id, dataUri))
                              .catch(() =>
                                setWarning("Couldn't use that image file. Try a different one.")
                              );
                          }}
                          onRemoveUploadedImage={() => setUploadedImage(card.id, null)}
                        />
                        <span>
                          {card.setName} #{card.localId}
                        </span>
                        <span className={styles.rarity}>{card.rarity}</span>
                      </div>
                    )}
                  </PickerCardTilt>
                  <select
                    className={styles.classify}
                    aria-label={`Classify ${card.name} (${card.setName} #${card.localId}) as`}
                    value={cardOverrides[card.id] ?? ''}
                    onChange={(event) =>
                      setCardOverride(card.id, event.target.value === '' ? null : event.target.value)
                    }
                  >
                    <option value="">Use this card&apos;s own rarity</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
