import { motion, useReducedMotion } from 'framer-motion';
import type { TileState } from '../state/selectors';
import { CardImage } from './CardImage';
import { MagnifyIcon } from './icons/TabIcons';
import styles from './Tile.module.css';

export interface TileProps {
  dexNumber: number;
  name: string;
  spriteUrl: string;
  state: TileState;
  view: 'sprite' | 'card';
  ownedCardImageBase?: string;
  // A user-uploaded replacement image for the owned card (see CardImage's
  // own uploadedImageUri prop) -- only ever shown as a fallback when
  // ownedCardImageBase has no usable real image, never as an override of one
  // that's actually available.
  uploadedImageUri?: string;
  // Fired when the small "Enlarge" button is clicked (see showEnlarge
  // below for exactly when that button renders). Tile itself stays
  // presentational -- it has no idea what CardZoomOverlay even is, it just
  // reports the click and leaves the zoomed-card state to DexGrid. Omitted
  // entirely by callers that never need this (e.g. most existing tests),
  // in which case the button simply never renders.
  onEnlarge?: () => void;
  onClick: () => void;
}

export function Tile({
  dexNumber,
  name,
  spriteUrl,
  state,
  view,
  ownedCardImageBase,
  uploadedImageUri,
  onEnlarge,
  onClick,
}: TileProps) {
  const shouldReduceMotion = useReducedMotion();
  const title =
    state === 'loading'
      ? `Loading card data for ${name}...`
      : state === 'unavailable'
        ? `No special or full art cards have been released yet for ${name}.`
        : state === 'owned'
          ? `You own a card for ${name}. Click to change or remove it.`
          : `Click to see the special art card options for ${name}.`;

  // Card view is specifically about collecting status, so a Pokemon with no
  // cards at all should read as starkly, unmistakably dull there -- more so
  // than the lighter dulling used in sprite view, where some color still
  // helps identify the Pokemon while browsing the dex.
  const isDullInCardView = state === 'unavailable' && view === 'card';

  // Only an owned Card-view tile has real card art worth enlarging -- an
  // unowned tile shows a dulled sprite/placeholder instead (nothing to
  // zoom into), and Sprite view never shows card art at all. This
  // deliberately mirrors the exact condition just below that decides
  // whether to render CardImage instead of the plain sprite <img>, so the
  // Enlarge button only ever appears alongside real card art. Also
  // requires onEnlarge itself, so callers that never wire up the zoom
  // feature don't get a button with nothing to call.
  const showEnlarge = view === 'card' && ownedCardImageBase !== undefined && Boolean(onEnlarge);

  return (
    <div className={styles.tileWrapper}>
      <motion.button
        type="button"
        className={[styles.tile, styles[`tile--${state}`], isDullInCardView && styles.dullCardView]
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
        title={title}
        aria-busy={state === 'loading'}
        layout={!shouldReduceMotion}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 }
        }
      >
        <span className={styles.number}>#{String(dexNumber).padStart(3, '0')}</span>
        {view === 'card' && ownedCardImageBase !== undefined ? (
          <CardImage
            imageBase={ownedCardImageBase}
            uploadedImageUri={uploadedImageUri}
            alt={`${name} card`}
            loading="lazy"
            width={68}
          />
        ) : (
          <img src={spriteUrl} alt={name} loading="lazy" />
        )}
        <span className={styles.name}>{name}</span>
      </motion.button>
      {showEnlarge && (
        // A sibling of the tile's own <button> above (both positioned via
        // .tileWrapper), not nested inside it -- the tile is itself a real
        // <button>, and nesting another one inside it would be invalid
        // button-in-button HTML (the same reason Picker's own
        // enlarge/star buttons sit next to, not inside, its card body).
        // stopPropagation is kept anyway, matching that same precedent, so
        // this stays inert to the tile's own onClick regardless.
        <button
          type="button"
          className={styles.enlarge}
          aria-label={`Enlarge ${name} card`}
          onClick={(event) => {
            event.stopPropagation();
            onEnlarge?.();
          }}
        >
          <MagnifyIcon />
        </button>
      )}
    </div>
  );
}
