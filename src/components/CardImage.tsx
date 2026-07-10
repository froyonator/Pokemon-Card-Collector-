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
}: CardImageProps) {
  const [variantIndex, setVariantIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A mounted CardImage instance can be handed a different imageBase later
  // (e.g. DexGrid keeps its Tile components mounted across tab switches, and
  // a user can mark a different card owned for the same Pokemon). Without
  // this reset, retry/exhausted state from the PREVIOUS card would leak into
  // the new one: an image that would have loaded fine at low/webp could
  // stay stuck on a stale "high/png" variant, or worse, on the placeholder
  // forever, even though the new card has a perfectly good image.
  useEffect(() => {
    setVariantIndex(0);
    setExhausted(false);
  }, [imageBase]);

  const hasNoImage = !imageBase || exhausted;

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

  const variant = VARIANTS[variantIndex];

  function handleError() {
    if (variantIndex < VARIANTS.length - 1) {
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
    />
  );
}
