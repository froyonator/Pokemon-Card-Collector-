// Raw photos a user uploads for a card with no TCGdex image can be several
// MB each. Storing them verbatim as base64 data URIs in localStorage/export
// JSON would bloat the backup file fast and risks hitting localStorage's
// quota after only a handful of uploads. This downscales to a max of 600px
// on the longer edge and re-encodes as JPEG at ~0.82 quality before the
// result is ever handed to the store.
//
// Exported as an injectable type/function, mirroring this codebase's
// existing pattern of injecting fetchImpl everywhere (see src/api/tcgdex.ts)
// for testability: jsdom implements neither createImageBitmap nor a real
// <canvas> 2D context, so callers that need to exercise their own wiring in
// a test substitute a fake resizer rather than driving this real
// canvas-based implementation.
export type ImageResizer = (file: File) => Promise<string>;

const MAX_DIMENSION = 600;
const JPEG_QUALITY = 0.82;

export async function resizeImageForUpload(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
