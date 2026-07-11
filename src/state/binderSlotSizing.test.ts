import { describe, expect, it } from 'vitest';
import { computeSlotSize } from './binderSlotSizing';

describe('computeSlotSize', () => {
  it('fits slots by height when the container is wide relative to rows/columns', () => {
    // 900x600 container, 3 columns, 2 rows, 8px gap.
    // Width-constrained candidate: (900 - 2*8) / 3 = 294.67 wide -> height = 294.67 * 7/5 = 412.53
    // Height-constrained candidate: (600 - 1*8) / 2 = 296 tall -> width = 296 * 5/7 = 211.43
    // The height-constrained candidate is smaller, so it wins (must fit BOTH dimensions).
    const size = computeSlotSize({ containerWidth: 900, containerHeight: 600, rows: 2, columns: 3, gap: 8 });
    expect(size.width).toBeCloseTo(211.43, 1);
    expect(size.height).toBeCloseTo(296, 1);
  });

  it('fits slots by width when the container is tall relative to rows/columns', () => {
    // 600x900 container, 2 columns, 2 rows, 8px gap.
    // Width-constrained: (600 - 8) / 2 = 296 wide -> height = 296 * 7/5 = 414.4
    // Height-constrained: (900 - 8) / 2 = 446 tall -> width = 446 * 5/7 = 318.57
    // Width-constrained wins here (smaller).
    const size = computeSlotSize({ containerWidth: 600, containerHeight: 900, rows: 2, columns: 2, gap: 8 });
    expect(size.width).toBeCloseTo(296, 1);
    expect(size.height).toBeCloseTo(414.4, 1);
  });

  it('always returns a true 5:7 width:height ratio regardless of container shape', () => {
    const size = computeSlotSize({ containerWidth: 1337, containerHeight: 481, rows: 4, columns: 5, gap: 12 });
    expect(size.width / size.height).toBeCloseTo(5 / 7, 3);
  });

  it('never returns a negative or NaN size for a degenerate (zero) container', () => {
    const size = computeSlotSize({ containerWidth: 0, containerHeight: 0, rows: 3, columns: 3, gap: 8 });
    expect(size.width).toBeGreaterThanOrEqual(0);
    expect(size.height).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(size.width)).toBe(false);
    expect(Number.isNaN(size.height)).toBe(false);
  });
});
