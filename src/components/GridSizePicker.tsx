import { useState } from 'react';
import styles from './GridSizePicker.module.css';

const MAX_SIZE = 10;

export interface GridSizePickerProps {
  rows: number;
  columns: number;
  onChange: (size: { rows: number; columns: number }) => void;
}

export function GridSizePicker({ rows, columns, onChange }: GridSizePickerProps) {
  const [hovered, setHovered] = useState<{ row: number; column: number } | null>(null);
  const highlightRows = hovered ? hovered.row + 1 : 0;
  const highlightColumns = hovered ? hovered.column + 1 : 0;

  return (
    <div className={styles.picker}>
      <div className={styles.grid} onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: MAX_SIZE }, (_, r) =>
          Array.from({ length: MAX_SIZE }, (_, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={[
                styles.cell,
                r < highlightRows && c < highlightColumns ? styles.highlighted : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${c + 1} x ${r + 1}`}
              onMouseEnter={() => setHovered({ row: r, column: c })}
              onClick={() => onChange({ rows: r + 1, columns: c + 1 })}
            />
          ))
        )}
      </div>
      <span className={styles.label}>{`${columns} x ${rows}`}</span>
    </div>
  );
}
