import styles from './BinderZoomControl.module.css';

export const MIN_ZOOM = 0.5;
// 2x, down from 3x: at 3x even a modest binder blew up past every other
// piece of UI (pre-containment, the scale sat on the binder shell itself
// and painted right over the sidebar and nav -- reported live as "enlarged
// to full screen, everything else gone"). The scale is contained to the
// binder shell now, but 3x is still far past any useful inspection zoom.
export const MAX_ZOOM = 2;

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
