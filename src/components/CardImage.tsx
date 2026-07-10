import { useEffect, useState } from 'react';
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

export function CardImage({ imageBase, alt, className, width, loading }: CardImageProps) {
  const [variantIndex, setVariantIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

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

  if (hasNoImage) {
    return (
      <div
        className={[styles.placeholder, className].filter(Boolean).join(' ')}
        style={width ? { width, height: width } : undefined}
        role="img"
        aria-label={alt}
      >
        No image available
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
