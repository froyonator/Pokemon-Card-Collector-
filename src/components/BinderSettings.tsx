import { useRef } from 'react';
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

  // The native file input's own "Choose file" chrome overflows the sidebar
  // at its natural width, so it's visually hidden and driven by a styled
  // button instead (see .hiddenInput below and CardImage.tsx / StartScreen
  // for the same established pattern elsewhere in this app).
  const coverPictureInputRef = useRef<HTMLInputElement>(null);

  return (
    // The whole panel folds behind one summary row, exactly like the
    // Filters section above it: fully expanded, this panel alone pushed
    // the sidebar past a typical viewport's height and forced an internal
    // scrollbar -- explicitly unacceptable for this sidebar (reported,
    // sternly, twice). Open by default would defeat that, so it starts
    // closed; everything inside is a set-and-forget control or one click
    // away.
    <details className={styles.settingsGroup}>
      <summary>Binder settings</summary>
      <div className={styles.settings} role="group" aria-label="Binder settings">
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
      {/* Layout and Cover fold away by default, same as FilterBar's own
          Generations / Card rarity groups sections: expanded, this panel's
          full control set overran a typical viewport and forced the sidebar
          into an internal scrollbar -- explicitly unacceptable for this
          sidebar (reported, sternly). Both are set-and-forget settings, not
          per-visit controls, so collapsed-by-default costs nothing. */}
      <details className={styles.group}>
        <summary>Layout</summary>
        <div className={styles.groupBody}>
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
      </details>

      {/* How this binder's closed cover looks on the shelf (BinderShelf):
          leather color, spine lettering, and an optional picture mounted on
          the front. All cosmetic, all persisted with the binder itself. */}
      <details className={styles.group}>
        <summary>Cover</summary>
        <div className={styles.groupBody}>
      <div className={styles.swatches} role="radiogroup" aria-label="Cover color">
        {COVER_COLORS.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: swatch.value }}
            title={swatch.name}
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
      {/* A plain span, not a wrapping <label> -- a <label> wrapping a
          <button> gives the BUTTON that label's own text as its accessible
          name (native HTML labelling wins over the button's own visible
          text), which would announce it as "Cover picture" instead of
          "Choose picture...". The other rows above get away with <label>
          because they wrap a bare <input>/<select>, which has no name of
          its own to clobber. */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>Cover picture</span>
        <button type="button" onClick={() => coverPictureInputRef.current?.click()}>
          Choose picture...
        </button>
      </div>
      <input
        ref={coverPictureInputRef}
        type="file"
        accept="image/*"
        aria-label="Upload cover picture"
        className={styles.hiddenInput}
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
      {activeBinder.cover?.coverImageUri && (
        <div className={styles.coverPreview}>
          <img
            src={activeBinder.cover.coverImageUri}
            alt=""
            className={styles.coverThumb}
          />
          <span className={styles.coverPreviewText}>Picture set</span>
          <button
            type="button"
            onClick={() => setBinderCover(activeBinder.id, { coverImageUri: undefined })}
          >
            Remove cover picture
          </button>
        </div>
      )}
        </div>
      </details>
      </div>
    </details>
  );
}
