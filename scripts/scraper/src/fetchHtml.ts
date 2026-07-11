const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtmlWithRetry(
  url: string,
  options: { fetchImpl?: typeof fetch; attempts?: number; retryDelayMs?: number } = {}
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = options.attempts ?? 3;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'text/html', 'User-Agent': 'CollectorsLedgerDatasetBuilder/1.0' },
      });
      if (response.ok) return await response.text();
      const error = new Error(`HTML request failed with HTTP ${response.status}: ${url}`);
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts) throw lastError;
    }
    await wait((options.retryDelayMs ?? 750) * attempt);
  }
  throw lastError ?? new Error(`HTML request failed: ${url}`);
}
