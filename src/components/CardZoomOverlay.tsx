import { motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCardTilt } from '../state/useCardTilt';
import type { CardRecord } from '../types';
import { CardImage } from './CardImage';
import styles from './CardZoomOverlay.module.css';

export interface CardZoomOverlayProps {
  card: CardRecord;
  uploadedImageUri: string | undefined;
  onClose: () => void;
}

export function CardZoomOverlay({ card, uploadedImageUri, onClose }: CardZoomOverlayProps) {
  const shouldReduceMotion = useReducedMotion();
  // Mirrors Picker's own hasNoImage check: a placeholder with no real art
  // and no uploaded fallback is just "No image available" text, not
  // something worth tilting. An uploaded image, once it's the thing being
  // shown, is real card art from the tilt effect's point of view.
  const hasNoImage = !card.imageBase && !card.hostedFullUrl && !uploadedImageUri;
  const tilt = useCardTilt({ disabled: hasNoImage, maxTiltDeg: 10 });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // The overlay only ever fades, so it needs no reduced-motion variant of
  // its own. The card normally rises with a spring and a slight settle; under
  // reduced motion it falls back to a quick opacity-only fade instead so a
  // dialog opening doesn't move or resize on screen. (Same split as
  // Picker.tsx's overlayMotion/panelMotion.)
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
        initial: { opacity: 0, scale: 0.82, y: 46, rotateX: 14 },
        animate: { opacity: 1, scale: 1, y: 0, rotateX: 0 },
        exit: { opacity: 0, scale: 0.9, y: 24 },
        transition: { type: 'spring' as const, stiffness: 260, damping: 24 },
      };

  // Tilt tracking lives on the OVERLAY, not the card. The card is the
  // element being 3D-rotated -- listening on it directly meant that at the
  // card's edge, the rotation moved the projected edge out from under the
  // cursor, firing mouseleave -> reset -> the flat edge slid back under the
  // cursor -> mousemove -> tilt again, oscillating rapidly (the reported
  // "vibrates at the edge" bug). The overlay never transforms, so the
  // pointer can't escape mid-hover; computeCardTilt clamps positions beyond
  // the card's own rect, so from anywhere in the room the card simply leans
  // toward the cursor, hitting full tilt at (and beyond) its edges with no
  // boundary discontinuity anywhere.
  //
  // Portaled straight to document.body, same reason as ManageGroupsPanel:
  // this can be opened from deep inside the Dex Grid, underneath ancestors
  // that establish their own stacking contexts; portaling out sidesteps
  // clipping regardless of where it's opened from.
  return createPortal(
    <motion.div
      className={styles.overlay}
      role="dialog"
      aria-label={`${card.name} enlarged`}
      onClick={onClose}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      {...overlayMotion}
    >
      <motion.div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        {...panelMotion}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ✕
        </button>
        {/* The stationary footprint the tilt measures against (see above) --
            it never transforms, so the math always sees the card's true
            resting bounds. The child is what visually rotates. */}
        <div ref={tilt.ref} className={styles.cardFrame}>
          <div
            className={
              tilt.isActive ? `${styles.cardBody} ${styles.cardTilting}` : styles.cardBody
            }
            style={tilt.style}
          >
            <CardImage
              imageBase={card.imageBase}
              hostedFullUrl={card.hostedFullUrl}
              uploadedImageUri={uploadedImageUri}
              alt={`${card.name} from ${card.setName}`}
              className={styles.cardImage}
              preferHighQuality
            />
            {!hasNoImage && (
              <>
                {/* One-shot reveal glint that sweeps the card as it enters,
                    then the cursor-tracked glare + iridescent sheen. All
                    purely decorative. */}
                {!shouldReduceMotion && <span className={styles.glint} aria-hidden="true" />}
                <span className={styles.sheen} aria-hidden="true" />
                <span className={styles.glare} aria-hidden="true" />
              </>
            )}
          </div>
        </div>
        <figcaption className={styles.caption}>
          <span className={styles.captionName}>{card.name}</span>
          <span className={styles.captionMeta}>
            <span className={styles.captionSet}>{card.setName}</span>
            {card.localId && <span className={styles.captionNumber}>№ {card.localId}</span>}
            {card.rarity && card.rarity !== 'None' && card.rarity !== 'Unknown' && (
              <span className={styles.captionRarity}>{card.rarity}</span>
            )}
          </span>
        </figcaption>
      </motion.div>
    </motion.div>,
    document.body
  );
}
