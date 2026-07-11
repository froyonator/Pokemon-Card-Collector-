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
  const hasNoImage = !card.imageBase && !uploadedImageUri;
  const tilt = useCardTilt({ disabled: hasNoImage });

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
  // its own. The panel normally scales/slides in with a spring; under
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
        initial: { opacity: 0, scale: 0.95, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 10 },
        transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
      };

  // Portaled straight to document.body, same reason as ManageGroupsPanel:
  // this can be opened from deep inside the Dex Grid, underneath ancestors
  // like the sticky-positioned Sidebar or an already-tilting card body (see
  // useCardTilt's transform), any of which establishes its own stacking
  // context. A naively-nested `position: fixed` overlay would still paint
  // within that ancestor's local stacking context and could be clipped or
  // shrunk instead of covering the full viewport. Portaling out of the
  // component tree sidesteps that regardless of where this is opened from.
  return createPortal(
    <motion.div
      className={styles.overlay}
      role="dialog"
      aria-label={`${card.name} enlarged`}
      onClick={onClose}
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
        <div
          ref={tilt.ref}
          className={tilt.isActive ? `${styles.cardBody} ${styles.cardTilting}` : styles.cardBody}
          style={tilt.style}
          onMouseMove={tilt.onMouseMove}
          onMouseLeave={tilt.onMouseLeave}
        >
          <CardImage
            imageBase={card.imageBase}
            uploadedImageUri={uploadedImageUri}
            alt={`${card.name} from ${card.setName}`}
            className={styles.cardImage}
          />
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
