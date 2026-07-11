// scripts/scraper/src/downloadImage.ts
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';

const MIN_BYTE_SIZE = 2_000; // A real card image is tens of KB at minimum; anything under ~2KB is almost certainly a placeholder/error graphic, not real art.
const ACCEPTED_CONTENT_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MIN_WIDTH = 200;
const MIN_HEIGHT = 280;

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
  return { ok: true };
}

// Downloads via the same Playwright browser context (not a plain fetch),
// consistent with every other network call this scraper makes -- tested
// live for HTML pages already in Task 2; images are served from a separate
// static.tcgcollector.com host and were not independently confirmed to also
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
