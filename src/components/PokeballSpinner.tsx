import styles from './PokeballSpinner.module.css';

export interface PokeballSpinnerProps {
  // Rendered diameter in pixels.
  size?: number;
  // Accessible loading text, announced to screen readers and findable by
  // tests, but visually replaced by the animation itself.
  label?: string;
}

// The app's loading animation: a Poke Ball rocking gently while it cycles
// from grey to full color -- "catching its color" -- used anywhere data is
// still on its way (loading dex tiles, the Picker's full-print-history
// fetch). Pure CSS; respects prefers-reduced-motion via the global
// transition/animation collapse in global.css.
export function PokeballSpinner({ size = 36, label = 'Loading' }: PokeballSpinnerProps) {
  return (
    <span className={styles.wrapper} role="status">
      <span
        className={styles.ball}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span className={styles.button} />
      </span>
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
