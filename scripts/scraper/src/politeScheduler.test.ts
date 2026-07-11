import { describe, expect, it } from 'vitest';
import { createPoliteScheduler } from './politeScheduler';

describe('createPoliteScheduler', () => {
  it('serializes concurrent work and spaces every network start', async () => {
    const starts: number[] = [];
    const schedule = createPoliteScheduler(40);
    await Promise.all(
      [1, 2, 3].map(() =>
        schedule(async () => {
          starts.push(Date.now());
        })
      )
    );
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(35);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(35);
  });
});
