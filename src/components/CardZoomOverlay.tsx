import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cardImageUrl } from '../api/tcgdex';
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

// The mirror-image close: one continuous reverse spin-and-shrink back down
// to the resting pose, then the caller (whichever of Picker/DexGrid/
// BinderView is holding the zoomedCard state that mounted this overlay)
// removes it from the tree. Kept a touch faster than the entrance -- a
// dismissal reads best when it gets out of the way slightly quicker than it
// arrived -- while staying in the same "single tween, no bounce" duration
// class the entrance uses.
const EXIT_DURATION_MS = 560;

// The app's one shared "gentle deceleration" landing curve (see
// src/styles/global.css's --ease-out custom property) -- reused here as a
// literal numeric array because framer-motion's transition.ease wants
// numbers, not a CSS var() string. Using the exact same curve the rest of
// the app's UI motion already lands on keeps this flip's landing feeling
// like the same hand drew it, rather than a bespoke curve invented just for
// this one component.
const LANDING_EASE = [0.16, 1, 0.3, 1] as const;

// How long the opacity fade takes at each end of the flight, in seconds --
// shared by both the entrance (fades in, THEN keeps flying opaque) and the
// exit (keeps flying opaque, THEN fades out) so the two read as true
// mirrors of each other. Deliberately shorter than the full flight: the
// point of a flip-and-grow is to actually SEE the turn, so opacity should
// clear out of the way early on the way in, and only step in at the very
// end on the way out -- never dominate the middle of either flight.
const FADE_SEGMENT_S = 0.22;

export function CardZoomOverlay({ card, uploadedImageUri, onClose }: CardZoomOverlayProps) {
  const shouldReduceMotion = useReducedMotion();
  // Mirrors Picker's own hasNoImage check: a placeholder with no real art
  // and no uploaded fallback is just "No image available" text, not
  // something worth tilting. An uploaded image, once it's the thing being
  // shown, is real card art from the tilt effect's point of view.
  const hasNoImage = !card.imageBase && !card.hostedFullUrl && !uploadedImageUri;

  // Whether there's a cheap, already-rendered thumbnail source for this card
  // (the same low/webp construction, or resolved hosted thumb, that the
  // tile/picker cell this overlay was opened from just painted) worth
  // showing instantly underneath the hi-res upgrade. A card with only a
  // hosted FULL url and no thumb source at all (rare -- see hostedThumbUrl's
  // own doc comment) falls back to the single-image path below rather than
  // stacking a hi-res layer over nothing.
  const hasThumbSource = Boolean(card.imageBase || card.hostedThumbUrl);
  const showImageStack = !hasNoImage && hasThumbSource;

  // The exact URL CardImage's own hi-res branch will resolve to (hosted
  // full copy first, then the constructed high/png variant) -- computed
  // here too so the moment this overlay opens, a bare `new Image()` can
  // start fetching it immediately, in parallel with (and independent of)
  // the CardImage component below actually mounting and requesting it. On a
  // warm cache (the common case, since preloading fires every time this
  // overlay opens) this just dedupes against the in-flight/cached request;
  // on a cold one it gets the hi-res fetch started a beat earlier than
  // waiting on React's own render/effect timing would.
  const hiResUrl =
    card.hostedFullUrl || (card.imageBase ? cardImageUrl(card.imageBase, 'high', 'png') : undefined);

  useEffect(() => {
    if (!hiResUrl) return;
    const preload = new Image();
    preload.src = hiResUrl;
  }, [hiResUrl]);

  // Flips true once the hi-res CardImage layer's own <img> fires onLoad.
  // Starts false on every mount -- each distinct card gets a fresh overlay
  // instance (Picker/DexGrid/BinderView all key this component by
  // card.id), so there's no stale card's "loaded" flag to leak into a
  // different card's first paint.
  const [hiResLoaded, setHiResLoaded] = useState(false);

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

  // True from the instant any close path fires. This component doesn't
  // unmount itself -- the parent holding the zoomedCard state does, by
  // rendering it inside <AnimatePresence> and dropping it from the tree --
  // but it keeps rendering with these same props for the length of the exit
  // animation. isLeaving is the local signal that flight has begun, so the
  // tilt/glint (which would otherwise be free to layer their own transforms
  // on top of the reverse spin) switch off the moment closing starts rather
  // than lingering until the parent actually unmounts.
  const [isLeaving, setIsLeaving] = useState(false);

  const tilt = useCardTilt({ disabled: hasNoImage || !hasEntered || isLeaving, maxTiltDeg: 10 });

  // The single entry point for every close path (Escape, backdrop click,
  // close button): flips isLeaving first so the exit render (tilt/glint off)
  // commits in the same tick as the state change that starts unmounting this
  // overlay in the parent, then notifies the parent. Order doesn't matter to
  // React's batching, but keeping it symmetric with "close means closing" is
  // easier to reason about than firing onClose first.
  const handleClose = useCallback(() => {
    setIsLeaving(true);
    onClose();
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

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
  // halfway would leave the card showing its backface. .cardFace/
  // .cardFaceBack below (see CardZoomOverlay.module.css) give that backface
  // a real, deliberate card-back design (backface-visibility: hidden on
  // both, the back pre-rotated 180deg) rather than the browser's default of
  // showing the front artwork mirrored -- so mid-turn now shows an actual
  // card back, and the full 360 always lands back on the face regardless.
  //
  // The 3D depth for this turn comes from CSS `perspective` on .overlay
  // (the panel's parent, see CardZoomOverlay.module.css) rather than a
  // `transformPerspective` motion prop on the panel itself: this build's
  // framer-motion bundle doesn't recognize that prop (it falls straight
  // through to the DOM and React warns), and CSS perspective on the parent
  // is the standard way to give a single element's own rotateY real depth
  // anyway -- it reads as the card tipping through 3D space rather than a
  // flat horizontal squash.
  //
  // The close mirrors the entrance: one continuous reverse spin back down to
  // the resting pose (rotateY unwinds from wherever the entrance left it,
  // typically 360, back to 0 -- the same full turn, run backwards) while the
  // card shrinks back to its launch scale, landing and fading out together
  // rather than in separate phases. This only actually plays when a parent
  // renders this overlay inside <AnimatePresence> (see Picker/DexGrid/
  // BinderView) -- without one, framer-motion applies the exit target
  // instantly on unmount, same as any other exit prop.
  //
  // filter carries a drop-shadow that grows from nothing at the launch/
  // landing pose up to a soft, deep shadow at full size -- scale and shadow
  // depth arrive together, so the card reads as lifting further off the
  // table the bigger it gets, not as a flat cutout that merely resizes.
  // transform/opacity/filter are the only properties animated anywhere in
  // this transition -- all three are compositor/paint-only, so the flight
  // never touches layout and stays smooth regardless of frame budget.
  const RESTING_SHADOW = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0))';
  const FLIGHT_SHADOW = 'drop-shadow(0 34px 54px rgba(0, 0, 0, 0.55))';
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
        initial: { opacity: 0, scale: 0.3, rotateY: 0, filter: RESTING_SHADOW },
        animate: { opacity: 1, scale: 1, rotateY: 360, filter: FLIGHT_SHADOW },
        // A target object's own `transition` overrides the shared one below
        // for that specific animation -- this is what lets the close run a
        // touch faster (EXIT_DURATION_MS) and with the mirror-image ease
        // (the entrance's landing curve run in reverse: a fast start easing
        // OUT of view rather than into it) without touching the entrance's
        // own timing. Still a single plain tween, same as the entrance -- no
        // spring, so nothing can overshoot past the resting pose and swing
        // back for a second phase.
        //
        // opacity is delayed to the FINAL FADE_SEGMENT_S of the flight
        // (rather than given its own short duration starting at t=0, which
        // is what this used to do) so the card stays fully visible while it
        // shrinks and spins, then fades only right at the very end -- the
        // true mirror of the entrance's "fade in fast, then fly opaque"
        // below. Fading it out immediately instead (the previous behaviour)
        // made the panel reach opacity 0 well before the shrink/spin tween
        // had gone anywhere, which is what made the close read as having no
        // visible animation at all: everything after that early fade was
        // real motion happening on an invisible element.
        exit: {
          opacity: 0,
          scale: 0.3,
          rotateY: 0,
          filter: RESTING_SHADOW,
          transition: {
            duration: EXIT_DURATION_MS / 1000,
            ease: LANDING_EASE,
            opacity: {
              duration: FADE_SEGMENT_S,
              ease: 'easeIn' as const,
              delay: EXIT_DURATION_MS / 1000 - FADE_SEGMENT_S,
            },
          },
        },
        transition: {
          duration: ENTRANCE_DURATION_MS / 1000,
          ease: LANDING_EASE,
          opacity: { duration: FADE_SEGMENT_S, ease: 'easeOut' as const },
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
  const cardAlt = `${card.name} from ${card.setName}`;

  // The card art itself, shared by both the flip-capable path (wrapped in
  // the two-faced .cardFaces below) and the reduced-motion path (rendered
  // directly, no faces/back needed since there's never any turn to reveal a
  // backface during). Thumb-first-then-hi-res: when a cheap thumb source
  // exists, the low/webp (or resolved hosted thumb) layer paints instantly
  // underneath -- it's the same image the tile/picker cell this overlay
  // opened from just rendered, so it's already warm in the browser cache --
  // while a second, hi-res layer loads on top and fades in over it the
  // moment its own onLoad fires. The panel is never left blank waiting on
  // the hi-res fetch. Cards with no cheap thumb source (or no real image at
  // all) fall back to the single CardImage this overlay always used.
  const cardArt = showImageStack ? (
    <div className={styles.cardImageStack}>
      {/* Decorative duplicate of the hi-res layer below -- alt="" so it
          doesn't register as a second accessible image with the same name
          (screen readers, and this file's own getByAltText-based tests,
          both need exactly one "<card> from <set>" image, and that's the
          hi-res layer, since it's the one whose src ends up matching what
          every existing test already asserted). */}
      <CardImage
        imageBase={card.imageBase}
        hostedThumbUrl={card.hostedThumbUrl}
        alt=""
        className={`${styles.cardImage} ${styles.cardImageThumb}`}
      />
      <CardImage
        imageBase={card.imageBase}
        hostedFullUrl={card.hostedFullUrl}
        alt={cardAlt}
        className={[styles.cardImage, styles.cardImageHiRes, hiResLoaded && styles.cardImageHiResVisible]
          .filter(Boolean)
          .join(' ')}
        preferHighQuality
        onLoad={() => setHiResLoaded(true)}
      />
    </div>
  ) : (
    <CardImage
      imageBase={card.imageBase}
      hostedFullUrl={card.hostedFullUrl}
      uploadedImageUri={uploadedImageUri}
      alt={cardAlt}
      className={styles.cardImage}
      preferHighQuality
    />
  );

  const cardDecoration = !hasNoImage && (
    <>
      {/* One-shot reveal glint, held back until the entrance has
          actually landed (hasEntered) -- mounting it only then
          means its sweep animation starts fresh right as the
          card settles, rather than racing the flip and reading as
          two effects fighting over the same half-second. Unmounted
          again the instant closing starts (isLeaving) so it can't
          sweep across the card mid reverse-spin. Then the
          cursor-tracked glare + iridescent sheen, both purely
          decorative and gated off the same way via useCardTilt's
          disabled option. */}
      {!shouldReduceMotion && hasEntered && !isLeaving && (
        <span className={styles.glint} aria-hidden="true" />
      )}
      <span className={styles.sheen} aria-hidden="true" />
      <span className={styles.glare} aria-hidden="true" />
    </>
  );

  return createPortal(
    <motion.div
      className={styles.overlay}
      role="dialog"
      aria-label={`${card.name} enlarged`}
      onClick={handleClose}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      {...overlayMotion}
    >
      <motion.div
        className={styles.panel}
        // Marks which entrance/exit pairing this panel is playing,
        // independent of framer-motion's own animation internals -- a
        // stable, directly testable signal that the flip-and-grow flight
        // (vs. the reduced-motion fade) is the one actually wired up. Same
        // attribute for both directions since it's one continuous pairing:
        // whichever way it launched is the way it turns to leave.
        data-entrance={shouldReduceMotion ? 'fade' : 'flip'}
        // Set the instant any close path fires (see handleClose above) and
        // never cleared -- there's no way back from "closing" short of the
        // whole overlay unmounting. A directly testable signal that the
        // reverse-spin phase, not the entrance, is the one now playing.
        data-leaving={isLeaving ? 'true' : undefined}
        onClick={(event) => event.stopPropagation()}
        {...panelMotion}
      >
        <button type="button" className={styles.close} onClick={handleClose} aria-label="Close">
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
            {shouldReduceMotion ? (
              <>
                {cardArt}
                {cardDecoration}
              </>
            ) : (
              // Two stacked, 3D-composited faces -- the front carries the
              // real card art (+ decoration), the back is a dedicated card
              // back design (see .cardBack below), pre-rotated 180deg with
              // backface-visibility: hidden on both, exactly the same
              // technique BinderView.module.css's .leafFace/.leafFaceBack
              // pair uses for the binder's own page turn. preserve-3d has
              // to be set on every ancestor between .panel (the element
              // framer-motion is actually spinning) and this pair --
              // .cardFrame and .cardBody included -- or the browser
              // flattens the 3D scene partway down and the backface
              // culling stops working. Skipped entirely under reduced
              // motion: with no turn to ever reach 90deg, there's no
              // backface to ever reveal.
              <div className={styles.cardFaces}>
                <div className={styles.cardFace}>
                  {cardArt}
                  {cardDecoration}
                </div>
                <div className={styles.cardFaceBack} aria-hidden="true">
                  <div className={styles.cardBack}>
                    <span className={styles.cardBackBall}>
                      <span className={styles.cardBackBallButton} />
                    </span>
                  </div>
                </div>
              </div>
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
