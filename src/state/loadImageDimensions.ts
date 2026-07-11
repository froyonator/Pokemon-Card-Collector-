// Reads an uploaded image's own natural pixel width/height from its data
// URI -- needed by the split-image feature (see slotImageSplit.ts) before it
// can slice an aggregate crop into per-slot pieces, since
// computeSplitTransforms needs real source dimensions, not the small
// on-screen editor frame size.
//
// Kept as its own tiny module, separate from slotImageSplit.ts (which stays
// a pure function with no DOM dependency, unit-tested directly) -- exactly
// the same split slotImageExport.ts already draws between
// computeCoverCropRect (pure, tested) and renderCardSizedCanvas/
// downloadCardSizedImage (needs a real HTMLImageElement decode, unavailable
// in this project's jsdom test environment). BinderView's own tests mock
// this module the same way SlotImageEditor.test.tsx mocks
// downloadCardSizedImage; verified for real live in a browser instead.
export function loadImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Failed to load the image.'));
    image.src = dataUri;
  });
}
