import { useRef, useState, type ChangeEvent } from 'react';
import {
  buildExportPayload,
  exportFileName,
  parseImportPayload,
  type ExportedUserData,
} from '../state/exportImport';
import { useAppStore } from '../state/store';
import { ImportConfirmDialog } from './ImportConfirmDialog';
import styles from './ExportImportControls.module.css';

export function ExportImportControls() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const groups = useAppStore((s) => s.groups);
  const owned = useAppStore((s) => s.owned);
  const wishlist = useAppStore((s) => s.wishlist);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const replaceUserData = useAppStore((s) => s.replaceUserData);
  const markChangesSaved = useAppStore((s) => s.markChangesSaved);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<ExportedUserData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    const payload = buildExportPayload({
      language,
      currency,
      activeGroupIds,
      groups,
      owned,
      wishlist,
      selectedGenerations,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(new Date());
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    // link.click() has no completion callback and never throws even if the
    // browser's save dialog is cancelled or the download is blocked, so this
    // marks the export as "attempted," not "confirmed written to disk." That
    // is an inherent limitation of the <a download> API, not something we
    // can detect from here.
    markChangesSaved();
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setPendingImport(parseImportPayload(text));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
      setPendingImport(null);
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    replaceUserData(pendingImport);
    setPendingImport(null);
  }

  return (
    <div className={styles.controls}>
      <button type="button" onClick={handleExport}>
        Export my collection
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        Import a backup
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className={styles.hiddenInput}
        onChange={handleFileSelected}
      />
      {error && <p role="alert">{error}</p>}
      {pendingImport && (
        <ImportConfirmDialog onConfirm={confirmImport} onCancel={() => setPendingImport(null)} />
      )}
    </div>
  );
}
