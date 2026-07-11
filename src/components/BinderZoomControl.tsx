import styles from './BinderZoomControl.module.css';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export interface BinderZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  isZoomModeActive: boolean;
}

export function BinderZoomControl({ zoom, onZoomChange, isZoomModeActive }: BinderZoomControlProps) {
  return (
    <div className={styles.zoomControl}>
      <input
        type="range"
        aria-label="Zoom"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.05}
        value={zoom}
        onChange={(event) => onZoomChange(Number(event.target.value))}
      />
      <span className={styles.percent}>{Math.round(zoom * 100)}%</span>
      {isZoomModeActive && (
        <span className={styles.hint} role="status">
          Scroll to zoom · Esc or click to exit
        </span>
      )}
    </div>
  );
}
