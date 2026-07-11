// offsetX/offsetY are expressed as a fraction of the CROP FRAME's own
// width/height (matching CustomSlotImage's stored units in types/index.ts).
// At zoom 1, the image exactly fills the frame with zero slack to pan into,
// so any offset must clamp to 0. At zoom Z, the image is Z times the frame
// size, leaving (Z-1)/2 of slack on each side (half on the left/top, half on
// the right/bottom) -- an offset beyond that would reveal empty space
// outside the source image.
export function clampCropOffset(offset: number, zoom: number): number {
  const maxSlack = Math.max(0, (zoom - 1) / 2);
  return Math.min(maxSlack, Math.max(-maxSlack, offset));
}
