// scripts/scraper/src/browserFetch.ts
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { STORAGE_STATE_ENV_VAR, validateStorageStatePath } from './sessionState';

let browserPromise: Promise<Browser> | null = null;
let contextPromise: Promise<BrowserContext> | null = null;
let configuredStorageStatePath: string | undefined;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export function configureBrowserSession(storageStatePath?: string): void {
  if (browserPromise || contextPromise) {
    throw new Error('Browser session must be configured before the first page fetch.');
  }
  configuredStorageStatePath = storageStatePath;
}

function getContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = (async () => {
      const browser = await getBrowser();
      const requestedPath = configuredStorageStatePath ?? process.env[STORAGE_STATE_ENV_VAR];
      const storageState = requestedPath
        ? await validateStorageStatePath(requestedPath)
        : undefined;
      return browser.newContext(storageState ? { storageState } : undefined);
    })();
  }
  return contextPromise;
}

// A real, honest user agent (not a spoofed one masquerading as a
// non-automated browser) -- Playwright's default Chromium UA already
// includes "HeadlessChrome", which this leaves as-is rather than hiding.
export async function fetchRenderedHtml(url: string): Promise<string> {
  const context = await getContext();
  const page: Page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  const pendingContext = contextPromise;
  const pendingBrowser = browserPromise;
  contextPromise = null;
  browserPromise = null;
  configuredStorageStatePath = undefined;

  if (pendingContext) {
    try {
      const context = await pendingContext;
      await context.close();
    } catch {
      // Browser initialization failures are surfaced by the fetch that triggered them.
    }
  }
  if (pendingBrowser) {
    try {
      const browser = await pendingBrowser;
      await browser.close();
    } catch {
      // Browser launch/close failures are surfaced by the initiating operation.
    }
  }
}
