import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useReducedMotion } from 'framer-motion';
import { computeCardTilt, MAX_TILT_DEG, NEUTRAL_TILT, useCardTilt } from './useCardTilt';
import type { MouseEvent as ReactMouseEvent } from 'react';

vi.mock('framer-motion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

function rect(width: number, height: number, left = 0, top = 0) {
  return { width, height, left, top };
}

function moveEvent(clientX: number, clientY: number) {
  return { clientX, clientY } as ReactMouseEvent<HTMLElement>;
}

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

describe('computeCardTilt', () => {
  it('returns a neutral, centered tilt when the cursor is at the center of the element', () => {
    expect(computeCardTilt(rect(200, 280), 100, 140)).toEqual({
      rotateX: 0,
      rotateY: 0,
      shineX: 50,
      shineY: 50,
    });
  });

  it('tilts toward positive rotateX and negative rotateY at the top-left corner', () => {
    const result = computeCardTilt(rect(200, 280), 0, 0);
    expect(result).toEqual({ rotateX: MAX_TILT_DEG, rotateY: -MAX_TILT_DEG, shineX: 0, shineY: 0 });
  });

  it('tilts toward negative rotateX and positive rotateY at the bottom-right corner', () => {
    const result = computeCardTilt(rect(200, 280), 200, 280);
    expect(result).toEqual({
      rotateX: -MAX_TILT_DEG,
      rotateY: MAX_TILT_DEG,
      shineX: 100,
      shineY: 100,
    });
  });

  it('accounts for the element being offset from the viewport origin', () => {
    const result = computeCardTilt(rect(200, 280, 50, 60), 50, 60);
    expect(result).toEqual({ rotateX: MAX_TILT_DEG, rotateY: -MAX_TILT_DEG, shineX: 0, shineY: 0 });
  });

  it('clamps a cursor position outside the element bounds rather than overshooting the max tilt', () => {
    const result = computeCardTilt(rect(200, 280), -500, -500);
    expect(result).toEqual({ rotateX: MAX_TILT_DEG, rotateY: -MAX_TILT_DEG, shineX: 0, shineY: 0 });
  });

  it('respects a custom maxTiltDeg', () => {
    const result = computeCardTilt(rect(200, 280), 200, 280, 6);
    expect(result).toEqual({ rotateX: -6, rotateY: 6, shineX: 100, shineY: 100 });
  });

  it('returns the neutral tilt for a zero-area rect instead of dividing by zero', () => {
    expect(computeCardTilt(rect(0, 0), 10, 10)).toEqual(NEUTRAL_TILT);
    expect(computeCardTilt(rect(200, 0), 10, 10)).toEqual(NEUTRAL_TILT);
  });
});

describe('useCardTilt', () => {
  it('starts flat: no active tracking, and a style with the shine hidden', () => {
    const { result } = renderHook(() => useCardTilt());
    expect(result.current.isActive).toBe(false);
    expect(result.current.style.transform).toContain('rotateX(0deg)');
    expect(result.current.style.transform).toContain('rotateY(0deg)');
    expect(result.current.style['--tilt-shine-opacity' as never]).toBe('0');
  });

  it('updates the transform and shine position on mouse move, based on cursor position within the tracked element', () => {
    const { result } = renderHook(() => useCardTilt());
    const element = document.createElement('div');
    element.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

    act(() => {
      result.current.ref.current = element;
    });
    act(() => {
      result.current.onMouseMove(moveEvent(200, 0));
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.style.transform).toContain(`rotateX(${MAX_TILT_DEG}deg)`);
    expect(result.current.style.transform).toContain(`rotateY(${MAX_TILT_DEG}deg)`);
    expect(result.current.style['--tilt-shine-x' as never]).toBe('100%');
    expect(result.current.style['--tilt-shine-y' as never]).toBe('0%');
    expect(result.current.style['--tilt-shine-opacity' as never]).not.toBe('0');
  });

  it('does nothing on mouse move when no element is attached to the ref yet', () => {
    const { result } = renderHook(() => useCardTilt());
    act(() => {
      result.current.onMouseMove(moveEvent(200, 0));
    });
    expect(result.current.isActive).toBe(false);
    expect(result.current.style.transform).toContain('rotateX(0deg)');
  });

  it('resets to the neutral, flat state on mouse leave', () => {
    const { result } = renderHook(() => useCardTilt());
    const element = document.createElement('div');
    element.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

    act(() => {
      result.current.ref.current = element;
    });
    act(() => {
      result.current.onMouseMove(moveEvent(200, 0));
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.onMouseLeave();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.style.transform).toContain('rotateX(0deg)');
    expect(result.current.style.transform).toContain('rotateY(0deg)');
    expect(result.current.style['--tilt-shine-opacity' as never]).toBe('0');
  });

  it('returns an empty style and inert handlers when disabled via options', () => {
    const { result } = renderHook(() => useCardTilt({ disabled: true }));
    const element = document.createElement('div');
    element.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

    act(() => {
      result.current.ref.current = element;
    });
    act(() => {
      result.current.onMouseMove(moveEvent(200, 0));
    });

    expect(result.current.style).toEqual({});
    expect(result.current.isActive).toBe(false);
  });

  it('is suppressed entirely when the user prefers reduced motion, even without the disabled option', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { result } = renderHook(() => useCardTilt());
    const element = document.createElement('div');
    element.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

    act(() => {
      result.current.ref.current = element;
    });
    act(() => {
      result.current.onMouseMove(moveEvent(200, 0));
    });

    expect(result.current.style).toEqual({});
    expect(result.current.isActive).toBe(false);
  });
});
