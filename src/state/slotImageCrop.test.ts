import { describe, expect, it } from 'vitest';
import { clampCropOffset } from './slotImageCrop';

describe('clampCropOffset', () => {
  it('leaves an offset of 0 (centered) unchanged at any zoom', () => {
    expect(clampCropOffset(0, 1)).toBe(0);
    expect(clampCropOffset(0, 2.5)).toBe(0);
  });

  it('clamps an offset to the range the current zoom actually allows', () => {
    // At zoom 1 (the image exactly fills the 5:7 frame with no slack), any
    // nonzero offset would reveal empty space, so it must clamp to 0.
    expect(clampCropOffset(0.3, 1)).toBe(0);
    // At zoom 2, there's slack of (2-1)/2 = 0.5 on each side to pan into.
    expect(clampCropOffset(0.3, 2)).toBeCloseTo(0.3, 5);
    expect(clampCropOffset(0.9, 2)).toBeCloseTo(0.5, 5);
    expect(clampCropOffset(-0.9, 2)).toBeCloseTo(-0.5, 5);
  });

  it('never allows an offset beyond the available slack, symmetric in both directions', () => {
    const clamped = clampCropOffset(10, 3);
    expect(clamped).toBeCloseTo(1, 5); // (3-1)/2 = 1
    expect(clampCropOffset(-10, 3)).toBeCloseTo(-1, 5);
  });
});
