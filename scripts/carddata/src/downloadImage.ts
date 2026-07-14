// scripts/carddata/src/downloadImage.ts
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';

const MIN_BYTE_SIZE = 2_000; // A real card image is tens of KB at minimum; anything under ~2KB is almost certainly a placeholder/error graphic, not real art.
const ACCEPTED_CONTENT_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MIN_WIDTH = 200;
const MIN_HEIGHT = 280;

// A physical card scan's width/height ratio is close to 63x88mm (~0.716).
// This range is tolerant of scan borders/sleeves/margins but excludes
// landscape photos, banners, and other non-scan images that otherwise pass
// every other check (real image, big enough, right content-type) --
// confirmed live: a news/event photo of a hand holding a card, hotlinked in
// place of a real scan, is landscape-oriented and clears every other guard.
export const MIN_CARD_ASPECT_RATIO = 0.63;
export const MAX_CARD_ASPECT_RATIO = 0.8;

export type ImageValidationResult = { ok: true } | { ok: false; reason: string };

export function validateImageResponse(input: {
  contentType: string;
  byteLength: number;
}): ImageValidationResult {
  if (!ACCEPTED_CONTENT_TYPES.has(input.contentType)) {
    return { ok: false, reason: `unexpected content-type: ${input.contentType}` };
  }
  if (input.byteLength < MIN_BYTE_SIZE) {
    return { ok: false, reason: `image too small (${input.byteLength} bytes)` };
  }
  return { ok: true };
}

export interface DownloadedImage {
  bytes: Buffer;
  sha256: string;
  contentType: string;
  width: number;
  height: number;
}

export function validateImageDimensions(input: {
  width?: number;
  height?: number;
}): ImageValidationResult {
  if (!input.width || !input.height)
    return { ok: false, reason: 'image dimensions are unavailable' };
  if (input.width < MIN_WIDTH || input.height < MIN_HEIGHT) {
    return { ok: false, reason: `image dimensions too small (${input.width}x${input.height})` };
  }
  const ratio = input.width / input.height;
  if (ratio < MIN_CARD_ASPECT_RATIO || ratio > MAX_CARD_ASPECT_RATIO) {
    return {
      ok: false,
      reason: `aspect ratio ${ratio.toFixed(3)} outside card-scan range ${MIN_CARD_ASPECT_RATIO}-${MAX_CARD_ASPECT_RATIO} (${input.width}x${input.height}) -- likely not a card scan`,
    };
  }
  return { ok: true };
}

// Downloads via the same Playwright browser context (not a plain fetch),
// consistent with every other network call this data pipeline makes -- tested
// live for HTML pages already in Task 2; images are served from a separate
// static asset host and were not independently confirmed to also
// require a browser context during design research, so verify this against
// a plain `fetch()` first when implementing (it may work without a browser,
// since it's a static asset CDN rather than the main site's Cloudflare
// front) and fall back to a Playwright-driven request only if a plain fetch
// gets blocked.
export async function downloadAndValidateImage(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ image: DownloadedImage } | { error: string }> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }
  const contentType = (res.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  const arrayBuffer = await res.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const validation = validateImageResponse({ contentType, byteLength: bytes.byteLength });
  if (!validation.ok) {
    return { error: validation.reason };
  }
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { error: `image could not be decoded: ${detail}` };
  }
  const dimensionValidation = validateImageDimensions(dimensions);
  if (!dimensionValidation.ok) return { error: dimensionValidation.reason };

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    image: {
      bytes,
      sha256,
      contentType,
      width: dimensions.width!,
      height: dimensions.height!,
    },
  };
}
