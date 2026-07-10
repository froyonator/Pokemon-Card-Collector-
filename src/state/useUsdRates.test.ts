import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUsdRates } from './useUsdRates';
import * as priceDisplay from './priceDisplay';

describe('useUsdRates', () => {
  it('populates rates once fetchUsdPivotRates resolves', async () => {
    const rates = { USD: 1, EUR: 0.87451, AUD: 1.441, GBP: 0.75, CAD: 1.35 };
    vi.spyOn(priceDisplay, 'fetchUsdPivotRates').mockResolvedValue(rates);

    const { result } = renderHook(() => useUsdRates());
    expect(result.current).toBeUndefined();

    await waitFor(() => {
      expect(result.current).toEqual(rates);
    });

    vi.restoreAllMocks();
  });

  it('does not throw or warn if unmounted before the fetch resolves', async () => {
    // A manually-resolved promise, not a real fetch or timer: lets the test
    // control exactly when the async work settles, so it can unmount first
    // and only then resolve, deterministically, without racing real I/O.
    //
    // Note: as of React 18, calling a state setter after unmount is a
    // silent no-op with no console warning either way (this differs from
    // React 16/17, where it logged "Can't perform a React state update on
    // an unmounted component"). Confirmed empirically by temporarily
    // removing the `cancelled` guard in useUsdRates.ts and rerunning this
    // suite: it still passed, with no warning printed. So this test cannot
    // by itself prove the guard is *why* nothing breaks — only that nothing
    // breaks. The guard is still correct to keep (it avoids a wasted
    // dispatch, and is defensive against runtimes where dropping is not
    // silent), it just isn't independently falsifiable through
    // renderHook's black-box surface on this React version.
    let resolvePromise: (rates: Record<string, number>) => void;
    const pending = new Promise<Record<string, number>>((resolve) => {
      resolvePromise = resolve;
    });
    vi.spyOn(priceDisplay, 'fetchUsdPivotRates').mockReturnValue(pending);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useUsdRates());
    unmount();
    resolvePromise!({ USD: 1, EUR: 0.9, AUD: 1.4, GBP: 0.75, CAD: 1.35 });

    // Flush the resolved promise's microtask queue.
    await pending;

    expect(result.current).toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
    vi.restoreAllMocks();
  });
});
