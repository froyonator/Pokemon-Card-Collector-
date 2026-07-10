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
   *  directly rather than run through cardImageUrl's variant/retry logic --
   *  and it takes priority over both imageBase and the "no image"
   *  placeholder whenever it's present, even if imageBase is also empty. */
  uploadedImageUri?: string;
  // When provided, the "no image available" placeholder also renders a
  // "Search" button (calling this) and an "Upload image" file control. When
  // omitted, the placeholder renders exactly as it does today -- callers
  // that don't have search/upload context aren't forced to provide it.
  onSearchImage?: () => void;
  onUploadImage?: (file: File) => void;
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

  // A user-uploaded image takes priority over everything else -- that's the
  // entire point of uploading one for a card TCGdex has no image for.
  if (uploadedImageUri) {
    return (
      <img src={uploadedImageUri} alt={alt} className={className} width={width} loading={loading} />
    );
  }

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
