import { useEffect } from 'react';
import { useAppStore } from './store';

export function useUnsavedChangesWarning(): void {
  const hasUnsavedChanges = useAppStore((s) => s.hasUnsavedChanges);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
