import { useRef, useState } from 'react';
import type { CustomSlotImage } from '../types';
import { clampCropOffset } from '../state/slotImageCrop';
import { MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';
import styles from './SlotImageEditor.module.css';

export interface SlotImageEditorProps {
  initialImage: CustomSlotImage | null;
  onSave: (image: CustomSlotImage) => void;
  onCancel: () => void;
}

const DEFAULT_TRANSFORM = { offsetX: 0, offsetY: 0, zoom: 1 };

export function SlotImageEditor({ initialImage, onSave, onCancel }: SlotImageEditorProps) {
  const [dataUri, setDataUri] = useState<string | null>(initialImage?.dataUri ?? null);
  const [offsetX, setOffsetX] = useState(initialImage?.offsetX ?? DEFAULT_TRANSFORM.offsetX);
  const [offsetY, setOffsetY] = useState(initialImage?.offsetY ?? DEFAULT_TRANSFORM.offsetY);
  const [zoom, setZoom] = useState(initialImage?.zoom ?? DEFAULT_TRANSFORM.zoom);
  const dragOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

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
    // Divides by a fixed 200px reference frame size so drag sensitivity is
    // independent of exactly how large the editor happens to render on
    // screen -- the stored offset is a fraction of the frame, not pixels.
    const dx = (event.clientX - dragOrigin.current.x) / 200;
    const dy = (event.clientY - dragOrigin.current.y) / 280;
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
        className={styles.frame}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={dataUri}
          alt="Crop preview"
          className={styles.previewImage}
          style={{
            transform: `translate(${offsetX * 200}px, ${offsetY * 280}px) scale(${zoom})`,
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
      <div className={styles.actions}>
        <button type="button" onClick={() => setDataUri(null)}>
          Remove image
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
