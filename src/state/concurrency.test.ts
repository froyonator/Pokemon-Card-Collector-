import { describe, expect, it, vi } from 'vitest';
import { mapWithConcurrency } from './concurrency';

// Flushes several microtask ticks, giving async workers a chance to resume
// after a promise they're awaiting resolves.
async function flushMicrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of which call resolves first', async () => {
    // Three items, unlimited-enough concurrency that all three start at
    // once, but resolved completely out of order (2, then 0, then 1). If
    // results were assembled in resolution order rather than input order,
    // this would come back as ['result-2', 'result-0', 'result-1'].
    const resolvers: Record<number, (value: string) => void> = {};
    const items = [0, 1, 2];

    const promise = mapWithConcurrency(items, 3, (item) => {
      return new Promise<string>((resolve) => {
        resolvers[item] = resolve;
      });
    });

    await flushMicrotasks();
    expect(Object.keys(resolvers)).toHaveLength(3);

    resolvers[2](`result-${2}`);
    await flushMicrotasks();
    resolvers[0](`result-${0}`);
    await flushMicrotasks();
    resolvers[1](`result-${1}`);

    const results = await promise;
    expect(results).toEqual(['result-0', 'result-1', 'result-2']);
  });

  it('never has more than `limit` calls in flight at once', async () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const limit = 3;
    let inFlight = 0;
    let maxInFlight = 0;
    const pendingReleases: Record<number, () => void> = {};

    const promise = mapWithConcurrency(items, limit, (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<number>((resolve) => {
        pendingReleases[item] = () => {
          inFlight -= 1;
          resolve(item);
        };
      });
    });

    // After the initial synchronous ramp-up, exactly `limit` workers should
    // have started their calls (not fewer, not more).
    await flushMicrotasks();
    expect(Object.keys(pendingReleases)).toHaveLength(limit);
    expect(inFlight).toBe(limit);
    expect(maxInFlight).toBeLessThanOrEqual(limit);

    // Release the 8 jobs in a deliberately non-sequential order, checking
    // after every release (and the microtask churn it triggers, which lets a
    // new worker pick up the next queued item) that in-flight count never
    // exceeds the limit.
    const releaseOrder = [1, 0, 2, 4, 3, 6, 5, 7];
    for (const item of releaseOrder) {
      // Item may not have started yet if it's still queued; wait for it.
      while (!pendingReleases[item]) {
        await flushMicrotasks();
      }
      pendingReleases[item]();
      delete pendingReleases[item];
      await flushMicrotasks();
      expect(inFlight).toBeLessThanOrEqual(limit);
      expect(maxInFlight).toBeLessThanOrEqual(limit);
    }

    const results = await promise;
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Concurrency actually ramped up to the limit at some point, proving
    // this isn't a trivially-passing fully-sequential implementation.
    expect(maxInFlight).toBe(limit);
    expect(inFlight).toBe(0);
  });

  it('resolves immediately to [] for an empty items array without calling fn', async () => {
    const fn = vi.fn();
    const result = await mapWithConcurrency([], 5, fn);
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});
