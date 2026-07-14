// scripts/carddata/src/downloadImage.test.ts
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

  describe('aspect-ratio guard (regression: a landscape photo hotlinked in place of a card scan)', () => {
    it('accepts a legitimate card scan fixture close to the real 63x88mm ratio', () => {
      // 734x1024 (~0.717, the existing high-res fixture above) and a
      // border-heavy scan fixture (~0.667) both fall inside the tolerance.
      expect(validateImageDimensions({ width: 734, height: 1024 })).toEqual({ ok: true });
      expect(validateImageDimensions({ width: 600, height: 900 })).toEqual({ ok: true });
    });

    it('rejects a landscape-photo fixture (e.g. a news photo of a hand holding a card)', () => {
      const result = validateImageDimensions({ width: 1200, height: 800 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/aspect ratio/i);
    });

    it('rejects an implausibly narrow/tall image outside the tolerance band', () => {
      const result = validateImageDimensions({ width: 250, height: 1000 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/aspect ratio/i);
    });

    it('accepts right at the tolerance boundaries', () => {
      expect(validateImageDimensions({ width: 630, height: 1000 })).toEqual({ ok: true }); // ratio 0.63
      expect(validateImageDimensions({ width: 800, height: 1000 })).toEqual({ ok: true }); // ratio 0.80
    });
  });
});
