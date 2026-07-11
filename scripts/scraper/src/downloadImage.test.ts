// scripts/scraper/src/downloadImage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { validateImageDimensions, validateImageResponse } from './downloadImage';

describe('validateImageResponse', () => {
  it('accepts a plausible webp image response', () => {
    const result = validateImageResponse({
      contentType: 'image/webp',
      byteLength: 45_000,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects a response with the wrong content-type', () => {
    const result = validateImageResponse({ contentType: 'text/html', byteLength: 45_000 });
    expect(result).toEqual({ ok: false, reason: 'unexpected content-type: text/html' });
  });

  it('rejects a suspiciously tiny response (likely a placeholder/error image)', () => {
    const result = validateImageResponse({ contentType: 'image/webp', byteLength: 200 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too small/i);
  });
});

describe('validateImageDimensions', () => {
  it('accepts a plausible high-resolution card image', () => {
    expect(validateImageDimensions({ width: 734, height: 1024 })).toEqual({ ok: true });
  });

  it('rejects tiny placeholders and unavailable dimensions', () => {
    expect(validateImageDimensions({ width: 100, height: 100 })).toEqual({
      ok: false,
      reason: 'image dimensions too small (100x100)',
    });
    expect(validateImageDimensions({})).toEqual({
      ok: false,
      reason: 'image dimensions are unavailable',
    });
  });
});
