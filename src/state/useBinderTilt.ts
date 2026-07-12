import { useReducedMotion } from 'framer-motion';
import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react';
import { computeCardTilt, NEUTRAL_TILT } from './useCardTilt';

// The binder shelf's resting pose: every volume stands turned toward the
// room at a fixed angle, spine partly visible, well before any cursor is
// anywhere near it. Cursor tracking layers a small swing ON TOP of that
// baseline rather than replacing it -- straightening all the way to 0deg on
// hover would make the book look like it snapped flat instead of leaning
// toward the reader, and swinging past the baseline in the other direction
// is what brings the spine edge further into view.
const REST_ROTATE_Y_DEG = -24;
// How far the cursor can swing the volume off that baseline, in degrees.
const MAX_SWING_Y_DEG = 20;
const MAX_TILT_X_DEG = 7;
const LIFT_PX = 6;

export interface UseBinderTiltOptions {
  // Mirrors useCardTilt's own escape hatch for a specific instance; the
  // hook still runs unconditionally so call order never changes.
  disabled?: boolean;
}

export interface UseBinderTiltResult {
  ref: MutableRefObject<HTMLButtonElement | null>;
  style: CSSProperties;
  // True while the cursor is actively being tracked, so the caller can drop
  // its CSS transition for 1:1 tracking (re-enabled for the mouse-leave
  // spring back) -- the same convention as useCardTilt's isActive.
  isActive: boolean;
  onMouseMove: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
}

// Cursor-follow tilt for a binder volume on the shelf. Reuses useCardTilt's
// own computeCardTilt for the cursor-to-percentage math and its edge
// clamping (so the swing never overshoots when the cursor strays outside
// the tracked element), but maps the result onto a book leaning off its own
// resting angle instead of a flat card leaning off zero.
//
// The listened-to/measured element (ref, onMouseMove, onMouseLeave) must be
// a STATIONARY ancestor of the element the returned `style` is applied to --
// same reasoning as CardZoomOverlay: if the measured element were also the
// transformed one, rotating it would slide its own projected edge out from
// under the cursor mid-hover, firing a spurious mouseleave that snaps the
// tilt back, which un-fires it again, oscillating at the boundary.
export function useBinderTilt(options: UseBinderTiltOptions = {}): UseBinderTiltResult {
  const { disabled = false } = options;
  const shouldReduceMotion = useReducedMotion();
  const isDisabled = disabled || Boolean(shouldReduceMotion);

  const ref = useRef<HTMLButtonElement | null>(null);
  const [tilt, setTilt] = useState(NEUTRAL_TILT);
  const [isActive, setIsActive] = useState(false);

  function handleMouseMove(event: ReactMouseEvent<HTMLButtonElement>) {
    if (isDisabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // maxTiltDeg of 1 turns computeCardTilt's rotateX/rotateY into a plain
    // -1..1 fraction of the way across the element, which is then scaled
    // onto this component's own degree ranges below.
    setTilt(computeCardTilt(rect, event.clientX, event.clientY, 1));
    setIsActive(true);
  }

  function handleMouseLeave() {
    if (isDisabled) return;
    setTilt(NEUTRAL_TILT);
    setIsActive(false);
  }

  const rotateY = REST_ROTATE_Y_DEG + tilt.rotateY * MAX_SWING_Y_DEG;
  const rotateX = tilt.rotateX * MAX_TILT_X_DEG;
  const lift = isActive ? -LIFT_PX : 0;

  const style: CSSProperties = isDisabled
    ? {}
    : {
        transform: `translateY(${lift}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        willChange: 'transform',
      };

  return { ref, style, isActive, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave };
}
