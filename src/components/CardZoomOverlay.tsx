import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
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

// How long the entrance flip-and-grow takes, in milliseconds. Shared by the
// framer-motion transition below AND the settle timer that gates the tilt
// effect, so the two can never drift apart -- one number, one source of
// truth, comfortably inside the "roughly 600-900ms" the effect calls for.
const ENTRANCE_DURATION_MS = 720;

export function CardZoomOverlay({ card, uploadedImageUri, onClose }: CardZoomOverlayProps) {
  const shouldReduceMotion = useReducedMotion();
  // Mirrors Picker's own hasNoImage check: a placeholder with no real art
  // and no uploaded fallback is just "No image available" text, not
  // something worth tilting. An uploaded image, once it's the thing being
  // shown, is real card art from the tilt effect's point of view.
  const hasNoImage = !card.imageBase && !card.hostedFullUrl && !uploadedImageUri;

  // True once the entrance animation has actually landed. Reduced motion
  // has no flight to land from (just a quick fade), so it starts settled.
  // Otherwise this flips true ENTRANCE_DURATION_MS after mount, on a plain
  // timer rather than framer-motion's onAnimationComplete -- a timer is
  // deterministic in tests (advance fake timers, no need to pump real
  // animation frames) and keeps this gate decoupled from however framer
  // internally paces the tween.
  //
  // Everything gated on this (the cursor tilt below, and the one-shot glint
  // further down) stays off for the full flight so it can never fight the
  // entrance mid-turn -- the tilt in particular would otherwise be free to
  // slap its own rotateX/rotateY onto cardBody while the entrance is still
  // spinning cardBody's own ancestor, and a mouse move landing mid-flip
  // would visibly fight the turn.
  const [hasEntered, setHasEntered] = useState(Boolean(shouldReduceMotion));

  useEffect(() => {
    if (shouldReduceMotion) return;
    const timer = window.setTimeout(() => setHasEntered(true), ENTRANCE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [shouldReduceMotion]);

  const tilt = useCardTilt({ disabled: hasNoImage || !hasEntered, maxTiltDeg: 10 });

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
  // its own. The card's entrance is the "jewel box" moment: it launches
  // from a small resting pose and does one full 360-degree turn on the Y
  // axis while continuously growing, landing exactly at full size and a
  // flat, face-front pose in a single unbroken motion -- rotation and
  // growth finish at the same instant, no separate flip-then-grow phases.
  // Under reduced motion it falls back to a quick opacity-only fade instead
  // so a dialog opening doesn't move, resize, or spin on screen. (Same
  // split as Picker.tsx's overlayMotion/panelMotion.)
  //
  // A plain eased tween, not a spring: a spring driving rotateY would be
  // free to overshoot past 360 and swing back, which would read as a
  // stutter/second phase right at the landing -- exactly what this isn't
  // supposed to do. The tween guarantees it lands the instant it arrives,
  // pixel- and degree-exact.
  //
  // rotateY turns the full 360 rather than stopping at 180: stopping
  // halfway would leave the card showing its backface. There's no
  // dedicated card-back asset in this codebase, and neither this panel nor
  // CardImage sets backface-visibility: hidden, so the browser's default
  // (visible) shows the same artwork mirrored mid-turn -- fine for a beat
  // that's gone in well under a second, and completing the full turn
  // always lands back on the face regardless.
  //
  // The 3D depth for this turn comes from CSS `perspective` on .overlay
  // (the panel's parent, see CardZoomOverlay.module.css) rather than a
  // `transformPerspective` motion prop on the panel itself: this build's
  // framer-motion bundle doesn't recognize that prop (it falls straight
  // through to the DOM and React warns), and CSS perspective on the parent
  // is the standard way to give a single element's own rotateY real depth
  // anyway -- it reads as the card tipping through 3D space rather than a
  // flat horizontal squash.
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
        initial: { opacity: 0, scale: 0.3, rotateY: 0 },
        animate: { opacity: 1, scale: 1, rotateY: 360 },
        exit: { opacity: 0, scale: 0.92 },
        transition: {
          duration: ENTRANCE_DURATION_MS / 1000,
          ease: [0.22, 1, 0.36, 1] as const,
          opacity: { duration: 0.26, ease: 'easeOut' as const },
        },
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
        // Marks which entrance this panel is playing, independent of
        // framer-motion's own animation internals -- a stable, directly
        // testable signal that the flip-and-grow entrance (vs. the reduced-
        // motion fade) is the one actually wired up.
        data-entrance={shouldReduceMotion ? 'fade' : 'flip'}
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
                {/* One-shot reveal glint, held back until the entrance has
                    actually landed (hasEntered) -- mounting it only then
                    means its sweep animation starts fresh right as the
                    card settles, rather than racing the flip and reading as
                    two effects fighting over the same half-second. Then the
                    cursor-tracked glare + iridescent sheen, both purely
                    decorative and gated off the same way via useCardTilt's
                    disabled option. */}
                {!shouldReduceMotion && hasEntered && (
                  <span className={styles.glint} aria-hidden="true" />
                )}
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
