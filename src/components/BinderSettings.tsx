import { COVER_COLORS, DEFAULT_COVER_COLOR } from '../data/binderCovers';
import { GridSizePicker } from './GridSizePicker';
import { resizeImageForUpload } from '../state/imageResize';
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
  const setBinderCover = useAppStore((s) => s.setBinderCover);

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

      {/* How this binder's closed cover looks on the shelf (BinderShelf):
          leather color, spine lettering, and an optional picture mounted on
          the front. All cosmetic, all persisted with the binder itself. */}
      <h4 className={styles.subheading}>Cover</h4>
      <div className={styles.swatches} role="radiogroup" aria-label="Cover color">
        {COVER_COLORS.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: swatch.value }}
            aria-label={`${swatch.name} cover`}
            aria-pressed={(activeBinder.cover?.color ?? DEFAULT_COVER_COLOR) === swatch.value}
            onClick={() => setBinderCover(activeBinder.id, { color: swatch.value })}
          />
        ))}
      </div>
      <label className={styles.row}>
        Spine label
        <input
          type="text"
          maxLength={40}
          placeholder={activeBinder.name}
          value={activeBinder.cover?.spineText ?? ''}
          onChange={(event) => setBinderCover(activeBinder.id, { spineText: event.target.value })}
        />
      </label>
      <label className={styles.row}>
        Cover picture
        <input
          type="file"
          accept="image/*"
          aria-label="Upload cover picture"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Allow re-picking the same file later (change events only fire
            // when the value differs).
            event.target.value = '';
            if (!file) return;
            resizeImageForUpload(file)
              .then((dataUri) => setBinderCover(activeBinder.id, { coverImageUri: dataUri }))
              .catch(() => {
                /* an unreadable image file simply leaves the cover as-is */
              });
          }}
        />
      </label>
      {activeBinder.cover?.coverImageUri && (
        <button
          type="button"
          onClick={() => setBinderCover(activeBinder.id, { coverImageUri: undefined })}
        >
          Remove cover picture
        </button>
      )}
    </div>
  );
}
