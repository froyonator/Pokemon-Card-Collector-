// A small bounded-concurrency worker pool: runs `fn` over `items`, never
// letting more than `limit` calls be in flight at once, while still
// returning results in the same order as `items` regardless of which call
// actually resolves first (each worker writes into its own `results[index]`
// slot rather than pushing in completion order).
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
