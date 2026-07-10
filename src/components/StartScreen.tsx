import { useRef, useState, type ChangeEvent } from 'react';
import { parseImportPayload, type ExportedUserData } from '../state/exportImport';
import { useAppStore } from '../state/store';
import { ImportConfirmDialog } from './ImportConfirmDialog';
import styles from './StartScreen.module.css';

export interface StartScreenProps {
  onComplete: () => void;
}

export function StartScreen({ onComplete }: StartScreenProps) {
  const replaceUserData = useAppStore((s) => s.replaceUserData);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<ExportedUserData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    onComplete();
  }

  return (
    <div className={styles.screen}>
      <h1>Welcome to Collector's Ledger</h1>
      <div className={styles.choices}>
        <button type="button" onClick={onComplete}>
          Start a New Collection
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import a Backup File
        </button>
      </div>
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
