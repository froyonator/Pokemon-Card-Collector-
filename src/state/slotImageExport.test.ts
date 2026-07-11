import { describe, expect, it } from 'vitest';
import { CARD_PRINT_HEIGHT_PX, CARD_PRINT_WIDTH_PX, computeCoverCropRect } from './slotImageExport';

describe('computeCoverCropRect', () => {
  it('matches the print dimensions to the editor frame\'s own 5:7 card ratio', () => {
    expect(CARD_PRINT_WIDTH_PX / CARD_PRINT_HEIGHT_PX).toBeCloseTo(5 / 7, 5);
  });

  it('makes no crop at all when the image already matches the destination ratio exactly', () => {
    expect(computeCoverCropRect(500, 700, CARD_PRINT_WIDTH_PX, CARD_PRINT_HEIGHT_PX)).toEqual({
      sx: 0,
      sy: 0,
      sWidth: 500,
      sHeight: 700,
    });
  });

  it('crops the left/right edges of an image relatively wider than the destination', () => {
    // 1000x700 is wider than the 5:7 destination ratio, so the full height
    // is kept and the width is cropped down to match -- same as
    // object-fit: cover trimming the sides of a landscape photo.
    const rect = computeCoverCropRect(1000, 700, CARD_PRINT_WIDTH_PX, CARD_PRINT_HEIGHT_PX);
    expect(rect.sHeight).toBe(700);
    expect(rect.sWidth).toBeCloseTo(500, 5); // 700 * (5/7)
    expect(rect.sx).toBeCloseTo(250, 5); // centered: (1000 - 500) / 2
    expect(rect.sy).toBe(0);
  });

  it('crops the top/bottom edges of an image relatively taller than the destination', () => {
    // 500x1400 is taller than the 5:7 destination ratio, so the full width
    // is kept and the height is cropped down to match.
    const rect = computeCoverCropRect(500, 1400, CARD_PRINT_WIDTH_PX, CARD_PRINT_HEIGHT_PX);
    expect(rect.sWidth).toBe(500);
    expect(rect.sHeight).toBeCloseTo(700, 5); // 500 / (5/7)
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBeCloseTo(350, 5); // centered: (1400 - 700) / 2
  });
});
