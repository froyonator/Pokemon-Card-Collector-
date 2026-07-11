// Standard US trading card size (2.5in x 3.5in) at 300 DPI -- exactly a 5:7
// ratio, matching SlotImageEditor.module.css's own 200x280 editor frame, so
// the printed export is a faithful WYSIWYG copy of the live crop preview at
// full resolution instead of a slightly different proportion.
export const CARD_PRINT_WIDTH_PX = 750;
export const CARD_PRINT_HEIGHT_PX = 1050;

export interface CoverCropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

// Replicates CSS `object-fit: cover` as a canvas source rectangle: the
// largest centered crop of the source image whose aspect ratio matches the
// destination, so drawing this rect to fill the destination exactly
// reproduces what the live editor preview shows on screen (see
// SlotImageEditor.module.css's .previewImage), just at print resolution
// instead of the small 200x280 editor frame.
export function computeCoverCropRect(
  imageWidth: number,
  imageHeight: number,
  destWidth: number,
  destHeight: number
): CoverCropRect {
  const imageRatio = imageWidth / imageHeight;
  const destRatio = destWidth / destHeight;
  if (imageRatio > destRatio) {
    // Image is relatively wider than the destination -- keep the full
    // height and crop its left/right edges.
    const sHeight = imageHeight;
    const sWidth = sHeight * destRatio;
    return { sx: (imageWidth - sWidth) / 2, sy: 0, sWidth, sHeight };
  }
  // Image is relatively taller than (or exactly matches) the destination --
  // keep the full width and crop its top/bottom edges.
  const sWidth = imageWidth;
  const sHeight = sWidth / destRatio;
  return { sx: 0, sy: (imageHeight - sHeight) / 2, sWidth, sHeight };
}

export interface SlotImageTransform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// Renders the same crop the live SlotImageEditor preview shows -- object-fit:
// cover, then the same pan/zoom transform -- onto a full print-resolution
// canvas. Kept separate from computeCoverCropRect (which has no DOM/canvas
// dependency and is unit-tested directly) since this needs a real
// CanvasRenderingContext2D, unavailable in this project's jsdom test
// environment; verified live in a browser instead.
export function renderCardSizedCanvas(
  image: HTMLImageElement,
  transform: SlotImageTransform
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_PRINT_WIDTH_PX;
  canvas.height = CARD_PRINT_HEIGHT_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available.');

  const { sx, sy, sWidth, sHeight } = computeCoverCropRect(
    image.naturalWidth,
    image.naturalHeight,
    CARD_PRINT_WIDTH_PX,
    CARD_PRINT_HEIGHT_PX
  );

  // Matches SlotImageEditor's own live CSS transform exactly:
  // `transform: translate(offsetX*frameWidth, offsetY*frameHeight)
  // scale(zoom)` with `transform-origin: center`. CSS composes a
  // translate-then-scale transform list as "scale first, pivoting on the
  // origin, then shift the already-scaled result by a FIXED pixel amount"
  // -- reproduced here as a center-pivot scale followed by that same fixed
  // shift, just scaled up to this canvas's own print resolution instead of
  // the 200x280 editor frame.
  ctx.save();
  ctx.translate(
    transform.offsetX * CARD_PRINT_WIDTH_PX + CARD_PRINT_WIDTH_PX / 2,
    transform.offsetY * CARD_PRINT_HEIGHT_PX + CARD_PRINT_HEIGHT_PX / 2
  );
  ctx.scale(transform.zoom, transform.zoom);
  ctx.translate(-CARD_PRINT_WIDTH_PX / 2, -CARD_PRINT_HEIGHT_PX / 2);
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, CARD_PRINT_WIDTH_PX, CARD_PRINT_HEIGHT_PX);
  ctx.restore();

  return canvas;
}

function loadImage(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load the image for export.'));
    image.src = dataUri;
  });
}

// Renders the current crop at full print resolution and triggers a browser
// download -- the "later I want to download this image in the pokemon card
// size so I can print it and cut it out" feature. A `dataUri` is always
// same-origin data (never a remote URL), so this never risks a
// tainted-canvas security error on toBlob.
export async function downloadCardSizedImage(
  transform: SlotImageTransform & { dataUri: string },
  fileName = 'binder-slot-card.png'
): Promise<void> {
  const image = await loadImage(transform.dataUri);
  const canvas = renderCardSizedCanvas(image, transform);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to render the card-sized image.');

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
