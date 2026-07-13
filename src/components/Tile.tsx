import { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { TileState } from '../state/selectors';
import { CardImage } from './CardImage';
import { PokeballSpinner } from './PokeballSpinner';
import { MagnifyIcon } from './icons/TabIcons';
import styles from './Tile.module.css';

export interface TileProps {
  dexNumber: number;
  name: string;
  // This app's own self-hosted static sprite (see src/data/sprites.ts) --
  // always used for the 'unavailable' state, and used everywhere else too
  // whenever spriteAnimatedUrl is null or reduced motion is requested.
  spriteStaticUrl: string;
  // This app's own self-hosted animated sprite, or null when
  // src/data/sprites.ts's manifest has no animated coverage for this dex
  // number (including "hasn't resolved yet"). Only ever actually shown for
  // the 'available'/'owned' states -- 'unavailable' and 'loading' always
  // use the static sprite regardless of this being set.
  spriteAnimatedUrl: string | null;
  // The OLD live third-party sprite URL (src/api/pokeapi.ts's spriteUrl) --
  // rendered only as an onError fallback if the self-hosted static/animated
  // file this tile picked fails to load (e.g. a manifest/file mismatch),
  // so a missing local file never shows a broken image icon.
  spriteFallbackUrl: string;
  state: TileState;
  view: 'sprite' | 'card';
  ownedCardImageBase?: string;
  // A pre-resolved hosted thumbnail URL for the owned card, taking priority
  // over the live-API imageBase construction whenever it's present -- see
  // CardImage's own hostedThumbUrl prop, which this passes straight
  // through.
  ownedCardHostedThumbUrl?: string;
  // A user-uploaded replacement image for the owned card (see CardImage's
  // own uploadedImageUri prop) -- only ever shown as a fallback when
  // ownedCardImageBase has no usable real image, never as an override of one
  // that's actually available.
  uploadedImageUri?: string;
  // Fired when the small "Enlarge" button is clicked (see showEnlarge
  // below for exactly when that button renders), with this tile's own
  // dexNumber. Tile itself stays presentational -- it has no idea what
  // CardZoomOverlay even is, it just reports the click (and which dex
  // number it was for) and leaves the zoomed-card state to DexGrid. Taking
  // dexNumber as an argument, rather than the caller closing over it per
  // tile, is what lets DexGrid hand every Tile the exact same stable
  // function reference instead of a fresh closure each render -- see this
  // component's memo wrapper below for why that identity stability is the
  // other half of what actually stops a re-render. Omitted entirely by
  // callers that never need this (e.g. most existing tests), in which case
  // the button simply never renders.
  onEnlarge?: (dexNumber: number) => void;
  // Same "takes the dexNumber, so the caller can hand every Tile one
  // stable function" reasoning as onEnlarge above.
  onClick: (dexNumber: number) => void;
}

// Wrapped in React.memo so marking a single dex number owned (or any other
// change that only actually affects a handful of tiles) doesn't re-render
// all up to 151 of these -- `owned`/`uploadedImages`/`cardOverrides` are
// subscribed directly from the zustand store in DexGrid, and every store
// mutation produces a brand-new object reference for the WHOLE record even
// when only one dex number changed. This only helps as long as every prop
// DexGrid passes down (notably onClick/onEnlarge) also stays referentially
// stable across renders that don't concern this particular tile -- see
// DexGrid's handleTileClick/handleTileEnlarge for that other half.
export const Tile = memo(function Tile({
  dexNumber,
  name,
  spriteStaticUrl,
  spriteAnimatedUrl,
  spriteFallbackUrl,
  state,
  view,
  ownedCardImageBase,
  ownedCardHostedThumbUrl,
  uploadedImageUri,
  onEnlarge,
  onClick,
}: TileProps) {
  const shouldReduceMotion = useReducedMotion();

  // AVAILABLE/OWNED are the only states that ever show the animated sprite
  // -- UNAVAILABLE must read as a static "confirmed empty" ghost, and
  // LOADING shows the Poke Ball spinner instead of any sprite at all (see
  // below). Also respects prefers-reduced-motion (the same
  // framer-motion hook this component already uses for its hover/tap
  // animations): when set, every tile falls back to the static sprite,
  // matching the CSS media query already governing the loading pulse.
  const wantsAnimatedSprite =
    (state === 'available' || state === 'owned') &&
    spriteAnimatedUrl !== null &&
    !shouldReduceMotion;
  const preferredSpriteSrc = wantsAnimatedSprite ? spriteAnimatedUrl : spriteStaticUrl;

  // If the self-hosted sprite this tile picked (static or animated) fails
  // to load -- e.g. a manifest/file mismatch from a partial deploy -- this
  // falls back to the OLD live third-party URL exactly once, the same
  // "never show a broken image icon" contract CardImage's own retry state
  // follows. Reset whenever the tile's own identity or intended sprite
  // changes, so a stale failure from a previous dex number/state (this
  // component stays mounted across most state transitions -- see the
  // memo comment above) doesn't leak into a tile that's since moved on to
  // a different sprite.
  const [spriteFailed, setSpriteFailed] = useState(false);
  useEffect(() => {
    setSpriteFailed(false);
  }, [dexNumber, preferredSpriteSrc]);
  const spriteSrc = spriteFailed ? spriteFallbackUrl : preferredSpriteSrc;

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
        onClick={() => onClick(dexNumber)}
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
        {state === 'loading' ? (
          // While this dex number's card data is still on its way (a cold
          // load, or an in-flight Refresh Data pass), the art area shows
          // the Poke Ball catching its color instead of a sprite -- an
          // unmissable "not downloaded yet" signal.
          <span className={styles.spinnerBox}>
            <PokeballSpinner size={44} label={`Loading card data for ${name}`} />
          </span>
        ) : view === 'card' && ownedCardImageBase !== undefined ? (
          <CardImage
            imageBase={ownedCardImageBase}
            hostedThumbUrl={ownedCardHostedThumbUrl}
            uploadedImageUri={uploadedImageUri}
            alt={`${name} card`}
            loading="lazy"
            width={68}
          />
        ) : (
          // decoding="async" alongside the existing loading="lazy" -- for
          // an animated sprite in particular, decoding off the main thread
          // matters (a GIF/WEBP decode is heavier than a static PNG's), and
          // it's harmless for the static case too. No per-tile
          // IntersectionObserver: native lazy loading already limits actual
          // network/decode work to tiles that scroll into view.
          //
          // key={spriteSrc} forces React to mount a brand-new <img> (rather
          // than mutate the existing one's src) every time the intended
          // sprite target actually changes -- most notably the very common
          // "static at first paint, then animated once the sprite manifest
          // resolves a moment later" transition every available/owned tile
          // goes through (see spriteUrls/loadSpriteManifest in
          // src/data/sprites.ts). Browsers only make their native
          // loading="lazy" fetch-or-defer decision once for a given <img>
          // element; changing an already-decided element's `src` after the
          // fact can leave that element permanently un-fetched instead of
          // re-evaluating against its current (likely already-visible)
          // position. A fresh element gets its own fresh decision, so a
          // tile that's already on screen when the manifest lands actually
          // loads its animated sprite instead of silently staying blank.
          <img
            key={spriteSrc}
            src={spriteSrc}
            alt={name}
            loading="lazy"
            decoding="async"
            className={styles.spriteImg}
            onError={() => setSpriteFailed(true)}
          />
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
            onEnlarge?.(dexNumber);
          }}
        >
          <MagnifyIcon />
        </button>
      )}
    </div>
  );
});
