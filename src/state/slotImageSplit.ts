import { computeCoverCropRect } from './slotImageExport';
import type { CustomSlotImage } from '../types';

// The SAME {offsetX, offsetY, zoom} shape a single-slot CustomSlotImage
// stores, but chosen by the user against a wider/taller AGGREGATE frame
// shaped (cols*5):(rows*7) -- cols normal 5:7 cards wide, rows tall -- via
// the same editor UI (see SlotImageEditor's own frameWidthUnits/
// frameHeightUnits props), instead of a single card's own 5:7 frame.
export interface AggregateCrop {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// Given one aggregate crop chosen against a rows x cols block of slots,
// works out what each INDIVIDUAL slot's own single-card
// offsetX/offsetY/zoom needs to be so that, rendered side by side via
// BinderSlot's existing customImageStyle (translate-then-scale over an
// object-fit: cover image), the slots together show one continuous picture
// instead of each slot independently re-cropping to its own center.
//
// The reasoning has three steps, each undoing/redoing the exact same
// translate-then-scale-around-center transform slotImageExport.ts's
// renderCardSizedCanvas already applies forward for a single card:
//
// 1. INVERT the aggregate crop. The aggregate editor's own default
//    (untouched, offset 0 / zoom 1) view is just computeCoverCropRect
//    against a (cols*5):(rows*7) box. The user's zoom then shrinks the
//    visible source rectangle by that factor (zooming IN reveals LESS of
//    the source, not more), and their offset pans that shrunk rectangle's
//    own center away from the default crop's center, by a fraction of the
//    shrunk rectangle's own size (mirroring how customImageStyle's
//    translate(...) is a percentage of the rendered box, not the original
//    image). Undoing both recovers the actual source-image rectangle
//    (adjSx/adjSy/adjW/adjH) the user settled on.
// 2. SLICE that recovered rectangle into a rows x cols grid of equal
//    sub-rectangles -- one per slot, in source-image pixel space.
// 3. RE-EXPRESS each sub-rectangle in single-card terms: "what offset/zoom,
//    applied to THIS slot's own default single-card cover crop, reproduces
//    exactly this sub-rectangle". That's step 1's same inversion run in
//    reverse -- comparing the sub-rectangle's own center/size against the
//    single-card default crop's center/size, instead of comparing a
//    user-chosen crop against a default one.
export function computeSplitTransforms(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
  aggregate: AggregateCrop
): AggregateCrop[][] {
  // Step 1: the aggregate frame's own default (untouched) cover crop --
  // the widest/tallest rectangle of the source image a (cols*5):(rows*7)
  // box would show before any user pan/zoom is applied.
  const defAgg = computeCoverCropRect(imageWidth, imageHeight, cols * 5, rows * 7);

  const adjW = defAgg.sWidth / aggregate.zoom;
  const adjH = defAgg.sHeight / aggregate.zoom;
  const defCenterX = defAgg.sx + defAgg.sWidth / 2;
  const defCenterY = defAgg.sy + defAgg.sHeight / 2;
  // Subtracting (not adding) offsetX*adjW here mirrors customImageStyle's
  // own translate direction: a POSITIVE stored offsetX shifts the rendered
  // image to the right, which means the crop rectangle it was cut from sits
  // further to the image's own LEFT (smaller sx) -- i.e. the crop's center
  // moves opposite the on-screen pan direction.
  const adjCenterX = defCenterX - aggregate.offsetX * adjW;
  const adjCenterY = defCenterY - aggregate.offsetY * adjH;
  const adjSx = adjCenterX - adjW / 2;
  const adjSy = adjCenterY - adjH / 2;

  // Step 2: slice the recovered rectangle into rows x cols equal pieces.
  const subW = adjW / cols;
  const subH = adjH / rows;

  // Step 3 reference point: an ordinary single slot's OWN default
  // (untouched) 5:7 cover crop -- every sub-rectangle below is re-expressed
  // relative to THIS, exactly like any normal single-slot crop already is.
  const singleDef = computeCoverCropRect(imageWidth, imageHeight, 5, 7);
  const singleDefCenterX = singleDef.sx + singleDef.sWidth / 2;
  const singleDefCenterY = singleDef.sy + singleDef.sHeight / 2;

  const result: AggregateCrop[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: AggregateCrop[] = [];
    for (let c = 0; c < cols; c++) {
      const subSx = adjSx + c * subW;
      const subSy = adjSy + r * subH;
      const subCenterX = subSx + subW / 2;
      const subCenterY = subSy + subH / 2;
      // The smaller this slice is than the single-slot default crop, the
      // more it must be zoomed in to fill a whole card-shaped slot on its
      // own.
      const zoom = singleDef.sWidth / subW;
      // Same sign convention as adjCenterX/adjCenterY above, run in
      // reverse: this slice sits to the LEFT of the single-card default
      // crop's own center exactly when the single-card crop needs to pan
      // RIGHT (positive offsetX) to reveal it.
      const offsetX = (singleDefCenterX - subCenterX) / subW;
      const offsetY = (singleDefCenterY - subCenterY) / subH;
      row.push({ offsetX, offsetY, zoom });
    }
    result.push(row);
  }
  return result;
}

// Attaches the (shared) source dataUri to each of computeSplitTransforms's
// own per-slot results, producing real CustomSlotImage values ready to hand
// straight to setBinderSlotCustomImage for each slot in the block.
export function sliceImageForSlots(
  dataUri: string,
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
  aggregate: AggregateCrop
): CustomSlotImage[][] {
  const transforms = computeSplitTransforms(imageWidth, imageHeight, rows, cols, aggregate);
  return transforms.map((row) => row.map((transform) => ({ dataUri, ...transform })));
}
