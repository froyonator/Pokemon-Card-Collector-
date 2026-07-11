// scripts/scraper/src/downloadImage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { validateImageResponse } from './downloadImage';

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
