import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import styles from './CardImage.module.css';

export interface CardImageProps {
  /** The card's raw image base URL (TCGdex `image` field), without a
   *  quality/extension suffix. Empty/falsy means TCGdex has no image on
   *  record for this card at all. */
  imageBase: string;
  alt: string;
  className?: string;
  width?: number;
  /** When true, requests the high-resolution PNG variant first instead of
   *  the low-resolution webp thumbnail every other caller gets by default.
   *  For contexts where a card is displayed large enough that resolution
   *  actually matters (the click-to-enlarge zoom overlay, a binder slot
   *  sized to its full 5:7 card proportions) -- NOT the default small-
   *  thumbnail contexts (the grid Tile, Picker's selection grid) where a
   *  smaller download is the better tradeoff since the image is never
   *  shown larger than roughly 100px there. */
  preferHighQuality?: boolean;
  loading?: 'lazy' | 'eager';
  /** A user-uploaded replacement image for this specific card, as a
   *  `data:` URI (see src/state/imageResize.ts, which produces these).
   *  Unlike imageBase, this is not a TCGdex CDN base path, so it's rendered
   *  directly rather than run through cardImageUrl's variant/retry logic.
   *  Used ONLY as a fallback for a card that has no usable real image (no
   *  imageBase at all, or every real-image variant has failed to load) --
   *  never as an override of a real image that's actually available, even
   *  if a stale value happens to still be set for this card id (e.g.
   *  TCGdex later gained a real image after the user had uploaded one). */
  uploadedImageUri?: string;
  /** A pre-resolved hosted thumbnail URL for this card, taking priority over
   *  the imageBase-based construction below whenever it's present (see the
   *  card asset resolver used by the static database build step, which
   *  supplies this for a card that step found a better hosted copy for).
   *  Ignored when preferHighQuality is set (hostedFullUrl takes over
   *  instead). Undefined for a card the build step had nothing better to
   *  offer, in which case rendering falls back to the imageBase-based
   *  construction exactly as it did before this prop existed. */
  hostedThumbUrl?: string;
  /** Same as hostedThumbUrl, but for the full-resolution variant used when
   *  preferHighQuality is set. */
  hostedFullUrl?: string;
  // When provided, the "no image available" placeholder also renders a
  // "Search" button (calling this) and an "Upload image" file control. When
  // omitted, the placeholder renders exactly as it does today -- callers
  // that don't have search/upload context aren't forced to provide it.
  onSearchImage?: () => void;
  onUploadImage?: (file: File) => void;
  // When provided (and an uploaded image is actually being shown, i.e.
  // hasNoImage is true and uploadedImageUri is set), renders a "Remove
  // uploaded image" button so a user can undo a wrong upload or fall back
  // to the placeholder/real image again -- there is otherwise no way to
  // clear an uploaded image from the UI once set.
  onRemoveUploadedImage?: () => void;
  /** Fired when the actual rendered <img> (the hosted-URL branch or the
   *  constructed imageBase/variant branch -- never the placeholder or
   *  uploaded-image branches, which have nothing worth signalling) finishes
   *  loading. Used by CardZoomOverlay to know when its hi-res layer is ready
   *  to fade in over the thumbnail sitting beneath it. Optional and unused
   *  by every existing caller. */
  onLoad?: () => void;
}

interface Variant {
  quality: 'low' | 'high';
  ext: 'webp' | 'png';
}

// Tried in order: TCGdex's default low/webp variant first, then high/png as
// a fallback for the (rare) case where one specific quality/format variant
// is missing or a transient CDN hiccup breaks the first attempt.
const VARIANTS: Variant[] = [
  { quality: 'low', ext: 'webp' },
  { quality: 'high', ext: 'png' },
];

const HIGH_QUALITY_VARIANTS: Variant[] = [
  { quality: 'high', ext: 'png' },
  { quality: 'low', ext: 'webp' },
];

export function CardImage({
  imageBase,
  alt,
  className,
  width,
  loading,
  uploadedImageUri,
  onSearchImage,
  onUploadImage,
  onRemoveUploadedImage,
  preferHighQuality = false,
  hostedThumbUrl,
  hostedFullUrl,
  onLoad,
}: CardImageProps) {
  const [variantIndex, setVariantIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  // Set once a hosted URL has actually failed to load (a bad/stale hosted
  // copy, a transient CDN hiccup, etc.), so rendering falls through to the
  // imageBase-based construction below instead of getting stuck retrying
  // the same broken hosted URL forever. Distinct from `exhausted`, which
  // means "nothing at all worked" -- a hosted-URL failure with a usable
  // imageBase to fall back to is not that.
  const [hostedFailed, setHostedFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The one hosted URL relevant to this render, matching whichever variant
  // set preferHighQuality selects below -- undefined (falling through to
  // the imageBase-based construction) unless the resolver actually found a
  // better hosted copy for this exact quality tier.
  const hostedUrl = preferHighQuality ? hostedFullUrl : hostedThumbUrl;

  // A mounted CardImage instance can be handed a different imageBase (or
  // hostedUrl) later (e.g. DexGrid keeps its Tile components mounted across
  // tab switches, and a user can mark a different card owned for the same
  // Pokemon). Without this reset, retry/exhausted state from the PREVIOUS
  // card would leak into the new one: an image that would have loaded fine
  // at low/webp could stay stuck on a stale "high/png" variant, or worse, on
  // the placeholder forever, even though the new card has a perfectly good
  // image.
  useEffect(() => {
    setVariantIndex(0);
    setExhausted(false);
    setHostedFailed(false);
  }, [imageBase, hostedUrl]);

  const useHostedUrl = Boolean(hostedUrl) && !hostedFailed;
  const hasNoImage = (!imageBase && !useHostedUrl) || exhausted;

  function handleHostedError() {
    // A hosted URL that fails to load with a usable imageBase still on hand
    // falls through to that construction below (today's exact behavior)
    // rather than jumping straight to the placeholder -- a bad/unpublished
    // hosted copy shouldn't regress a card that would otherwise render
    // fine. Only when there's truly nothing else to try does this count as
    // exhausted.
    if (imageBase) {
      setHostedFailed(true);
    } else {
      setExhausted(true);
    }
  }

  function handleUploadButtonClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      onUploadImage?.(file);
    }
  }

  if (hasNoImage) {
    // A user-uploaded image is only ever shown as a fallback for a card
    // with no usable real image (checked above via hasNoImage) -- a card
    // with a working imageBase always keeps showing its real image, even
    // if uploadedImageUri happens to have a stale value set for it.
    if (uploadedImageUri) {
      const uploadedImg = (
        <img
          src={uploadedImageUri}
          alt={alt}
          className={className}
          width={width}
          loading={loading}
        />
      );

      if (!onRemoveUploadedImage) {
        return uploadedImg;
      }

      return (
        <div className={styles.placeholderWithActions}>
          {uploadedImg}
          <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.actionButton} onClick={onRemoveUploadedImage}>
              Remove uploaded image
            </button>
          </div>
        </div>
      );
    }

    const placeholder = (
      <div
        className={[styles.placeholder, className].filter(Boolean).join(' ')}
        style={width ? { width, height: width } : undefined}
        role="img"
        aria-label={alt}
      >
        No image available
      </div>
    );

    if (!onSearchImage && !onUploadImage) {
      return placeholder;
    }

    return (
      <div className={styles.placeholderWithActions}>
        {placeholder}
        <div
          className={styles.actions}
          // Stops any click inside here -- the Search/Upload buttons
          // themselves, and the hidden file input's own click event
          // (whether from a real user click or the programmatic
          // fileInputRef.current.click() below) -- from bubbling up into a
          // caller's own click handler on an ancestor of this component
          // (e.g. Picker's card-select button), which would otherwise fire
          // alongside these actions.
          onClick={(event) => event.stopPropagation()}
        >
          {onSearchImage && (
            <button type="button" className={styles.actionButton} onClick={onSearchImage}>
              Search
            </button>
          )}
          {onUploadImage && (
            <>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleUploadButtonClick}
              >
                Upload image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handleFileChange}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  // A resolved hosted URL is preferred outright over the imageBase-based
  // construction below -- there's only one hosted candidate per quality
  // tier (no further hosted variant to retry into), so a load failure here
  // falls through to that imageBase-based construction instead (see
  // handleHostedError), rather than getting stuck retrying the same broken
  // hosted URL.
  if (useHostedUrl) {
    return (
      <img
        src={hostedUrl}
        alt={alt}
        className={className}
        width={width}
        loading={loading}
        onError={handleHostedError}
        onLoad={onLoad}
      />
    );
  }

  const variants = preferHighQuality ? HIGH_QUALITY_VARIANTS : VARIANTS;
  const variant = variants[variantIndex];

  function handleError() {
    if (variantIndex < variants.length - 1) {
      setVariantIndex((index) => index + 1);
    } else {
      setExhausted(true);
    }
  }

  return (
    <img
      src={cardImageUrl(imageBase, variant.quality, variant.ext)}
      alt={alt}
      className={className}
      width={width}
      loading={loading}
      onError={handleError}
      onLoad={onLoad}
    />
  );
}
