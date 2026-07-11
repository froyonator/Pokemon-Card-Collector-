export interface SlotSizeInput {
  containerWidth: number;
  containerHeight: number;
  rows: number;
  columns: number;
  gap: number;
}

export interface SlotSize {
  width: number;
  height: number;
}

// A real trading card is 5:7 (width:height). CSS grid's own 1fr tracks
// stretch each cell to fill the available space regardless of that ratio,
// which is what let cards render as whatever rectangle the page happened to
// divide into rather than true card proportions -- see BinderView.tsx's
// usage of this function for why it replaces 1fr tracks entirely instead of
// trying to constrain them from the CSS side.
//
// Computes the LARGEST 5:7 box that still lets `columns` of them (plus gaps)
// fit within containerWidth AND `rows` of them (plus gaps) fit within
// containerHeight -- i.e. tries sizing from width first, then from height,
// and keeps whichever candidate is smaller (the one that actually fits both
// axes; the larger candidate would overflow one of them).
export function computeSlotSize({
  containerWidth,
  containerHeight,
  rows,
  columns,
  gap,
}: SlotSizeInput): SlotSize {
  const CARD_RATIO = 5 / 7; // width / height

  const availableWidth = Math.max(0, containerWidth - gap * (columns - 1));
  const availableHeight = Math.max(0, containerHeight - gap * (rows - 1));

  const widthConstrainedWidth = columns > 0 ? availableWidth / columns : 0;
  const widthConstrainedHeight = widthConstrainedWidth / CARD_RATIO;

  const heightConstrainedHeight = rows > 0 ? availableHeight / rows : 0;
  const heightConstrainedWidth = heightConstrainedHeight * CARD_RATIO;

  // Whichever candidate is smaller is the one that actually fits within
  // BOTH the width and height budgets -- the other candidate would overflow
  // whichever axis it wasn't derived from.
  if (widthConstrainedHeight <= heightConstrainedHeight) {
    return { width: Math.max(0, widthConstrainedWidth), height: Math.max(0, widthConstrainedHeight) };
  }
  return { width: Math.max(0, heightConstrainedWidth), height: Math.max(0, heightConstrainedHeight) };
}
