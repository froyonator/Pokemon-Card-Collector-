import { describe, expect, it, vi } from 'vitest';
import { withPoliteDelay } from './politeFetch';

describe('withPoliteDelay', () => {
  it('waits at least the given delay between consecutive calls', async () => {
    const timestamps: number[] = [];
    const politeFn = withPoliteDelay(async () => {
      timestamps.push(Date.now());
    }, 50);

    await politeFn();
    await politeFn();
    await politeFn();

    expect(timestamps).toHaveLength(3);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(45); // small tolerance for timer jitter
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(45);
  });

  it('does not delay the very first call', async () => {
    const start = Date.now();
    const politeFn = withPoliteDelay(async () => {}, 500);
    await politeFn();
    expect(Date.now() - start).toBeLessThan(100);
  });
});
