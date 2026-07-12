import { useReducedMotion } from 'framer-motion';
import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react';

export const MAX_TILT_DEG = 12;
const PERSPECTIVE_PX = 900;
const SHINE_OPACITY = 0.35;

export interface CardTiltRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface CardTiltValues {
  rotateX: number;
  rotateY: number;
  shineX: number;
  shineY: number;
}

export const NEUTRAL_TILT: CardTiltValues = { rotateX: 0, rotateY: 0, shineX: 50, shineY: 50 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Cursor position is expressed as a 0-100% offset within the element's own
// bounding box, then mapped to a small rotation on each axis: a cursor near
// the top/left edge tilts that edge away from the viewer, as if the card
// were being tipped back to catch the light -- the same convention used by
// vanilla-tilt-style hover effects on TCG card gallery sites.
export function computeCardTilt(
  rect: CardTiltRect,
  clientX: number,
  clientY: number,
  maxTiltDeg: number = MAX_TILT_DEG
): CardTiltValues {
  if (rect.width <= 0 || rect.height <= 0) return NEUTRAL_TILT;

  const percentX = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  const percentY = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);

  return {
    rotateX: ((50 - percentY) / 50) * maxTiltDeg,
    rotateY: ((percentX - 50) / 50) * maxTiltDeg,
    shineX: percentX,
    shineY: percentY,
  };
}

export interface UseCardTiltOptions {
  // Set true to skip the effect for a specific card (e.g. one showing
  // CardImage's "no image" placeholder) without changing hook call order --
  // callers gate this per-card, the hook itself always runs the same hooks.
  disabled?: boolean;
  maxTiltDeg?: number;
}

export interface UseCardTiltResult {
  ref: MutableRefObject<HTMLDivElement | null>;
  style: CSSProperties;
  // True while the cursor is actively being tracked over the element, so a
  // caller can suspend its own CSS transition on transform (see
  // Picker.module.css's .cardTilting) for 1:1 tracking, re-enabling it only
  // for the mouse-leave reset.
  isActive: boolean;
  onMouseMove: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
}

export function useCardTilt(options: UseCardTiltOptions = {}): UseCardTiltResult {
  const { disabled = false, maxTiltDeg = MAX_TILT_DEG } = options;
  const shouldReduceMotion = useReducedMotion();
  const isDisabled = disabled || Boolean(shouldReduceMotion);

  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState<CardTiltValues>(NEUTRAL_TILT);
  const [isActive, setIsActive] = useState(false);

  function handleMouseMove(event: ReactMouseEvent<HTMLElement>) {
    if (isDisabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setTilt(computeCardTilt(rect, event.clientX, event.clientY, maxTiltDeg));
    setIsActive(true);
  }

  function handleMouseLeave() {
    if (isDisabled) return;
    setTilt(NEUTRAL_TILT);
    setIsActive(false);
  }

  const style: CSSProperties = isDisabled
    ? {}
    : ({
        transform: `perspective(${PERSPECTIVE_PX}px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
        willChange: 'transform',
        '--tilt-shine-x': `${tilt.shineX}%`,
        '--tilt-shine-y': `${tilt.shineY}%`,
        '--tilt-shine-opacity': isActive ? String(SHINE_OPACITY) : '0',
        // Unitless copies of the rotation, for CSS that wants to DERIVE
        // something from the tilt angle rather than rotate by it -- e.g.
        // CardZoomOverlay's parallax drop shadow, which slides opposite the
        // tilt via calc(var(--tilt-ry) * -2px) so the card seems to lift
        // off a surface the shadow stays on.
        '--tilt-rx': String(tilt.rotateX),
        '--tilt-ry': String(tilt.rotateY),
      } as CSSProperties);

  return { ref, style, isActive, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave };
}
