import { useRef, useState } from 'react';
import type { CustomSlotImage } from '../types';
import { clampCropOffset } from '../state/slotImageCrop';
import { downloadCardSizedImage } from '../state/slotImageExport';
import { MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';
import styles from './SlotImageEditor.module.css';

export interface SlotImageEditorProps {
  initialImage: CustomSlotImage | null;
  onSave: (image: CustomSlotImage) => void;
  onCancel: () => void;
  // The crop frame's own shape, in "how many normal 5:7 cards wide/tall"
  // units -- e.g. a 1-row-by-2-column split-image block (see
  // slotImageSplit.ts) is frameWidthUnits=10, frameHeightUnits=7. Both
  // default to a single card's own 5:7 ratio, so every existing single-slot
  // caller (which never passes either) renders and behaves exactly as
  // before this prop existed.
  frameWidthUnits?: number;
  frameHeightUnits?: number;
}

const DEFAULT_TRANSFORM = { offsetX: 0, offsetY: 0, zoom: 1 };

const SINGLE_CARD_WIDTH_UNITS = 5;
const SINGLE_CARD_HEIGHT_UNITS = 7;

// Fallback frame pixel size for the drag-sensitivity math below, used only
// when the frame hasn't been measured yet (its very first render, or
// jsdom's tests, which never perform real layout and always report a 0x0
// rect) -- matches this component's own previous hardcoded 200x280
// reference exactly, so drag feel for the common single-card case is
// unchanged even without a real measurement.
const FALLBACK_FRAME_WIDTH_PX = 200;
const FALLBACK_FRAME_HEIGHT_PX = 280;

export function SlotImageEditor({
  initialImage,
  onSave,
  onCancel,
  frameWidthUnits = SINGLE_CARD_WIDTH_UNITS,
  frameHeightUnits = SINGLE_CARD_HEIGHT_UNITS,
}: SlotImageEditorProps) {
  const [dataUri, setDataUri] = useState<string | null>(initialImage?.dataUri ?? null);
  const [offsetX, setOffsetX] = useState(initialImage?.offsetX ?? DEFAULT_TRANSFORM.offsetX);
  const [offsetY, setOffsetY] = useState(initialImage?.offsetY ?? DEFAULT_TRANSFORM.offsetY);
  const [zoom, setZoom] = useState(initialImage?.zoom ?? DEFAULT_TRANSFORM.zoom);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  // Measures the frame's OWN current rendered pixel size for the drag
  // sensitivity math in handlePointerMove below -- needed now that the
  // frame's shape is dynamic (see frameWidthUnits/frameHeightUnits above)
  // rather than always a fixed 200x280 constant; percentage-based offset
  // math still needs a REAL pixel size to convert a pointer's screen-space
  // delta into a fraction of the frame.
  const frameRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!dataUri) return;
    setDownloadError(null);
    try {
      await downloadCardSizedImage({ dataUri, offsetX, offsetY, zoom });
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Failed to download the image.');
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setDataUri(reader.result as string);
      setOffsetX(DEFAULT_TRANSFORM.offsetX);
      setOffsetY(DEFAULT_TRANSFORM.offsetY);
      setZoom(DEFAULT_TRANSFORM.zoom);
    };
    reader.readAsDataURL(file);
  }

  function handleZoomChange(nextZoom: number) {
    setZoom(nextZoom);
    setOffsetX((x) => clampCropOffset(x, nextZoom));
    setOffsetY((y) => clampCropOffset(y, nextZoom));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragOrigin.current = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return;
    // Divides by the frame's own REAL rendered pixel size (falling back to
    // the old fixed 200x280 reference when unmeasured) so drag sensitivity
    // is independent of exactly how large the editor happens to render on
    // screen -- the stored offset is a fraction of the frame, not pixels.
    // A fixed constant only worked back when the frame was always a single
    // card's 200x280px box; now that its shape varies (see
    // frameWidthUnits/frameHeightUnits above), the actual current size has
    // to be read off the DOM instead of assumed.
    const rect = frameRef.current?.getBoundingClientRect();
    const frameWidthPx = rect?.width || FALLBACK_FRAME_WIDTH_PX;
    const frameHeightPx = rect?.height || FALLBACK_FRAME_HEIGHT_PX;
    const dx = (event.clientX - dragOrigin.current.x) / frameWidthPx;
    const dy = (event.clientY - dragOrigin.current.y) / frameHeightPx;
    setOffsetX(clampCropOffset(dragOrigin.current.offsetX + dx, zoom));
    setOffsetY(clampCropOffset(dragOrigin.current.offsetY + dy, zoom));
  }

  function handlePointerUp() {
    dragOrigin.current = null;
  }

  if (!dataUri) {
    return (
      <div className={styles.editor}>
        <label className={styles.uploadPrompt}>
          Upload an image
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div
        ref={frameRef}
        className={styles.frame}
        // aspectRatio (not a fixed width/height) so the frame's own shape
        // matches whatever block of slots is being filled -- a single card's
        // 5:7 by default, or a wider/taller aggregate for the split-image
        // feature (see slotImageSplit.ts). .frame's own fixed width in
        // SlotImageEditor.module.css combined with this ratio reproduces
        // the exact old 200x280px box for the untouched default case.
        style={{ aspectRatio: `${frameWidthUnits} / ${frameHeightUnits}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={dataUri}
          alt="Crop preview"
          className={styles.previewImage}
          style={{
            // Percentage units (not a hardcoded 200x280px reference) --
            // relative to THIS image's own rendered box, which is always
            // the frame's own current size (see .previewImage's
            // width/height: 100% in SlotImageEditor.module.css). Mirrors
            // BinderSlot's own customImageStyle exactly, and stays correct
            // regardless of frameWidthUnits/frameHeightUnits, unlike a
            // fixed pixel reference would once the frame's shape varies.
            transform: `translate(${offsetX * 100}%, ${offsetY * 100}%) scale(${zoom})`,
          }}
          draggable={false}
        />
      </div>
      <input
        type="range"
        aria-label="Zoom"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.05}
        value={zoom}
        onChange={(event) => handleZoomChange(Number(event.target.value))}
      />
      {downloadError && <p role="alert">{downloadError}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={() => setDataUri(null)}>
          Remove image
        </button>
        {/* Renders the CURRENT crop (whether or not it's been Saved yet) at
            full print resolution and downloads it -- the "download this
            image in the pokemon card size so I can print it and cut it out
            to add to my actual binder" feature. See slotImageExport.ts for
            why the CustomSlotImage type already stores the original,
            uncropped image plus this transform rather than a baked-in
            preview-resolution raster. */}
        <button type="button" onClick={handleDownload}>
          Download for printing
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={() => onSave({ dataUri, offsetX, offsetY, zoom })}>
          Save
        </button>
      </div>
    </div>
  );
}
