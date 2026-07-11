// scripts/scraper/src/browserFetch.ts
import { chromium, type Browser, type Page } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

// A real, honest user agent (not a spoofed one masquerading as a
// non-automated browser) -- Playwright's default Chromium UA already
// includes "HeadlessChrome", which this leaves as-is rather than hiding.
export async function fetchRenderedHtml(url: string): Promise<string> {
  const browser = await getBrowser();
  const page: Page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}
