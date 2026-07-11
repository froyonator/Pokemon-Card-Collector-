import { describe, expect, it } from 'vitest';
import { computeSplitTransforms, sliceImageForSlots } from './slotImageSplit';

const DEFAULT_AGGREGATE = { offsetX: 0, offsetY: 0, zoom: 1 };

describe('computeSplitTransforms', () => {
  it('splits a square image 1 row x 2 cols with no manual adjustment: left slot reveals the image\'s own left side (positive offsetX), right slot reveals its right side (negative offsetX), both at the same zoom', () => {
    const result = computeSplitTransforms(400, 400, 1, 2, DEFAULT_AGGREGATE);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    const [left, right] = result[0];
    expect(left.offsetX).toBeCloseTo(0.5, 4);
    expect(right.offsetX).toBeCloseTo(-0.5, 4);
    expect(left.zoom).toBeCloseTo(1.42857, 4);
    expect(right.zoom).toBeCloseTo(1.42857, 4);
    // No vertical adjustment for a horizontal-only split.
    expect(left.offsetY).toBeCloseTo(0, 4);
    expect(right.offsetY).toBeCloseTo(0, 4);
  });

  it('splits a square image 2 rows x 2 cols with no manual adjustment: equal zoom everywhere, offsetX sign differs by column, offsetY sign differs by row', () => {
    const result = computeSplitTransforms(400, 400, 2, 2, DEFAULT_AGGREGATE);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2);

    const allZooms = result.flat().map((t) => t.zoom);
    for (const z of allZooms) expect(z).toBeCloseTo(allZooms[0], 4);

    const topLeft = result[0][0];
    const topRight = result[0][1];
    const bottomLeft = result[1][0];
    const bottomRight = result[1][1];

    // Left column reveals more of the image's own left side (positive
    // offsetX); right column reveals more of its right side (negative) --
    // same horizontal-axis reasoning as the 1x2 case above.
    expect(topLeft.offsetX).toBeGreaterThan(0);
    expect(bottomLeft.offsetX).toBeGreaterThan(0);
    expect(topRight.offsetX).toBeLessThan(0);
    expect(bottomRight.offsetX).toBeLessThan(0);

    // Top row reveals more of the image's own top (positive offsetY);
    // bottom row reveals more of its bottom (negative) -- mirrors the
    // horizontal case on the vertical axis.
    expect(topLeft.offsetY).toBeGreaterThan(0);
    expect(topRight.offsetY).toBeGreaterThan(0);
    expect(bottomLeft.offsetY).toBeLessThan(0);
    expect(bottomRight.offsetY).toBeLessThan(0);
  });

  it('propagates a manually panned/zoomed aggregate crop through to every slot, instead of ignoring it', () => {
    const defaultResult = computeSplitTransforms(400, 400, 1, 2, DEFAULT_AGGREGATE);
    const adjustedResult = computeSplitTransforms(400, 400, 1, 2, {
      offsetX: 0.3,
      offsetY: -0.2,
      zoom: 1.8,
    });
    expect(adjustedResult).not.toEqual(defaultResult);
    // Every slot's transform should have moved, not just one.
    expect(adjustedResult[0][0]).not.toEqual(defaultResult[0][0]);
    expect(adjustedResult[0][1]).not.toEqual(defaultResult[0][1]);
  });
});

describe('sliceImageForSlots', () => {
  it('attaches the shared dataUri to every slot alongside its own computed transform', () => {
    const result = sliceImageForSlots('data:image/png;base64,ABC', 400, 400, 1, 2, DEFAULT_AGGREGATE);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    for (const slot of result[0]) {
      expect(slot.dataUri).toBe('data:image/png;base64,ABC');
      expect(typeof slot.offsetX).toBe('number');
      expect(typeof slot.offsetY).toBe('number');
      expect(typeof slot.zoom).toBe('number');
    }
    // Left and right slots must still differ from each other despite
    // sharing the same source image.
    expect(result[0][0].offsetX).not.toBeCloseTo(result[0][1].offsetX, 2);
  });
});
