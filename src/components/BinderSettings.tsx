import { GridSizePicker } from './GridSizePicker';
import { useAppStore } from '../state/store';
import { SUPPORTED_LANGUAGES } from '../types';
import styles from './BinderSettings.module.css';

export interface BinderSettingsProps {
  isManualArrangeActive: boolean;
  onToggleManualArrange: () => void;
}

export function BinderSettings({
  isManualArrangeActive,
  onToggleManualArrange,
}: BinderSettingsProps) {
  const binders = useAppStore((s) => s.binders);
  const activeBinderId = useAppStore((s) => s.activeBinderId);
  const setActiveBinder = useAppStore((s) => s.setActiveBinder);
  const createBinder = useAppStore((s) => s.createBinder);
  const renameBinder = useAppStore((s) => s.renameBinder);
  const setBinderLanguage = useAppStore((s) => s.setBinderLanguage);
  const setBinderConfig = useAppStore((s) => s.setBinderConfig);
  const setBinderCustomOrder = useAppStore((s) => s.setBinderCustomOrder);

  const activeBinder = binders.find((b) => b.id === activeBinderId) ?? binders[0];

  return (
    <div className={styles.settings} role="group" aria-label="Binder settings">
      <h3 className={styles.heading}>Binder settings</h3>
      <label className={styles.row}>
        Switch binder
        <select
          aria-label="Switch binder"
          value={activeBinder.id}
          onChange={(event) => setActiveBinder(event.target.value)}
        >
          {binders.map((binder) => (
            <option key={binder.id} value={binder.id}>
              {binder.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => createBinder('New Binder', activeBinder.language)}>
        New binder
      </button>
      {/* Label changes while active instead of always reading "Manual
          arrange" -- confirmed live as a real point of confusion: nothing
          about a static label hints that clicking the SAME button again is
          how you leave the mode (Escape also exits it now, see BinderView's
          own keydown handler, but the button itself should say so too). */}
      <button type="button" aria-pressed={isManualArrangeActive} onClick={onToggleManualArrange}>
        {isManualArrangeActive ? 'Done arranging' : 'Manual arrange'}
      </button>
      {activeBinder.customOrder !== null && (
        <button type="button" onClick={() => setBinderCustomOrder(activeBinder.id, null)}>
          Reset arrangement
        </button>
      )}
      <label className={styles.row}>
        Binder name
        <input
          type="text"
          value={activeBinder.name}
          onChange={(event) => renameBinder(activeBinder.id, event.target.value)}
        />
      </label>
      <label className={styles.row}>
        Binder language
        <select
          aria-label="Binder language"
          value={activeBinder.language}
          onChange={(event) => setBinderLanguage(activeBinder.id, event.target.value)}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </label>
      <GridSizePicker
        rows={activeBinder.config.rows}
        columns={activeBinder.config.columns}
        onChange={({ rows, columns }) => setBinderConfig(activeBinder.id, { rows, columns })}
      />
      <label className={styles.row}>
        Page count
        <input
          type="number"
          min={1}
          value={activeBinder.config.pageCount}
          onChange={(event) => {
            const pageCount = Number(event.target.value);
            if (Number.isFinite(pageCount) && pageCount > 0) {
              setBinderConfig(activeBinder.id, { pageCount });
            }
          }}
        />
      </label>
      <div className={styles.directionToggle} role="radiogroup" aria-label="Fill direction">
        <button
          type="button"
          aria-pressed={activeBinder.config.fillDirection === 'horizontal'}
          onClick={() => setBinderConfig(activeBinder.id, { fillDirection: 'horizontal' })}
        >
          Horizontal
        </button>
        <button
          type="button"
          aria-pressed={activeBinder.config.fillDirection === 'vertical'}
          onClick={() => setBinderConfig(activeBinder.id, { fillDirection: 'vertical' })}
        >
          Vertical
        </button>
      </div>
    </div>
  );
}
