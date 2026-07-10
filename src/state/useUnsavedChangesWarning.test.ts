import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';
import { useAppStore } from './store';

beforeEach(() => {
  useAppStore.setState({ hasUnsavedChanges: false });
});

describe('useUnsavedChangesWarning', () => {
  it('does not register a beforeunload listener when there are no unsaved changes', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesWarning());
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addSpy.mockRestore();
  });

  it('registers a beforeunload listener that prevents the default close when there are unsaved changes', () => {
    useAppStore.setState({ hasUnsavedChanges: true });
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesWarning());
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    const handler = addSpy.mock.calls.find(([event]) => event === 'beforeunload')?.[1] as (
      e: Event
    ) => void;
    const event = new Event('beforeunload', { cancelable: true });
    handler(event);
    expect(event.defaultPrevented).toBe(true);
    addSpy.mockRestore();
  });

  it('removes the listener once hasUnsavedChanges flips back to false', () => {
    useAppStore.setState({ hasUnsavedChanges: true });
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(() => useUnsavedChangesWarning());
    useAppStore.setState({ hasUnsavedChanges: false });
    rerender();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeSpy.mockRestore();
  });
});
