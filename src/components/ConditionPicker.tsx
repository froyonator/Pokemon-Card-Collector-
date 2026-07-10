import { CONDITIONS, type Condition } from '../types';
import styles from './ConditionPicker.module.css';

export interface ConditionPickerProps {
  cardName: string;
  onConfirm: (condition: Condition) => void;
  onCancel: () => void;
}

export function ConditionPicker({ cardName, onConfirm, onCancel }: ConditionPickerProps) {
  return (
    <div className={styles.panel}>
      <h3>What condition is your {cardName} in?</h3>
      <p className={styles.note}>
        This is for your own reference only. Displayed market prices are not adjusted by
        condition, since no free pricing source breaks prices out that way.
      </p>
      <div className={styles.options}>
        {CONDITIONS.map((condition) => (
          <button key={condition} type="button" onClick={() => onConfirm(condition)}>
            {condition}
          </button>
        ))}
      </div>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
