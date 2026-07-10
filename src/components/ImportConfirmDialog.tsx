import styles from './ImportConfirmDialog.module.css';

export interface ImportConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportConfirmDialog({ onConfirm, onCancel }: ImportConfirmDialogProps) {
  return (
    <div role="dialog" aria-label="Confirm import" className={styles.confirm}>
      <p>
        Importing this file will overwrite your current collection, wishlist, and settings on
        this device. This cannot be undone. Continue?
      </p>
      <button type="button" onClick={onConfirm}>
        Overwrite and import
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
