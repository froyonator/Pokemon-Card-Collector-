// Wraps an async function so consecutive calls are spaced at least
// `delayMs` apart. This is the scraper's core "don't hammer the server"
// discipline -- tcgcollector.com's ToS don't sanction bulk automated use
// (see docs/superpowers/specs/2026-07-11-self-hosted-card-database-design.md),
// but regardless of that, an aggressive crawl risks getting the crawling IP
// blocked and is simply bad behavior toward a real server run by real
// people. Every network call this scraper makes should go through this.
export function withPoliteDelay<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  delayMs: number
): (...args: Args) => Promise<Result> {
  let lastCallAt = 0;
  return async (...args: Args) => {
    const now = Date.now();
    const elapsed = now - lastCallAt;
    if (lastCallAt !== 0 && elapsed < delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
    }
    lastCallAt = Date.now();
    return fn(...args);
  };
}
