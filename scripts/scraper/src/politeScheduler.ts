export function createPoliteScheduler(delayMs: number) {
  let tail: Promise<void> = Promise.resolve();
  let lastStartedAt = 0;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(async () => {
      const remaining = delayMs - (Date.now() - lastStartedAt);
      if (lastStartedAt && remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      lastStartedAt = Date.now();
      return task();
    });
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
