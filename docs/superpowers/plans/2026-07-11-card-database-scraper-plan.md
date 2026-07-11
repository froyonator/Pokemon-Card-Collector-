# Card Database Scraper Implementation Plan — Phase 1 (tooling + single-set validation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline (non-AI) scraper tool against tcgcollector.com per the approved design (`docs/superpowers/specs/2026-07-11-self-hosted-card-database-design.md`), and validate it end-to-end against ONE real set before scaling to a full multi-region crawl. Phase 2 (scale to every set/region, GitHub assets-repo + jsDelivr wiring, app migration) is a separate, later plan — deliberately not attempted here, since running an untested crawler against tens of thousands of cards before confirming correctness on a small sample would risk baking a systematic bug into a huge amount of scraped data.

**Architecture:** tcgcollector.com blocks plain HTTP fetches (Cloudflare-style bot detection, confirmed during research), so the scraper drives a real headless browser (Playwright/Chromium) for every page load, then parses the rendered HTML with `cheerio` (a fast, dependency-light HTML parser — no need to re-run JS-driven DOM queries once the page has already rendered). The crawl unit is one page load per set's card-list view (renders every card in that set unpaginated) followed by one page load per card's detail page (name/HP/attacks/rarity/illustrator/Pokédex/image all live on that one page — this is what makes the "one fetch, one record" data-integrity rule from the design spec hold by construction). Output is written to a local `data/` directory in the shape the design spec calls for (Language → Set → Card), as the input the later GitHub-assets-repo-population step will consume — this plan does not push anything to GitHub itself.

**Tech Stack:** Node.js + TypeScript, Playwright (headless Chromium), cheerio (HTML parsing), Vitest (the scraper's own unit tests — the parsing/mapping functions are pure and testable without a real browser).

**Verified against the live site during design research** (2026-07-11): a card-list page at `https://www.tcgcollector.com/sets/{setId}/{slug}?setCardCountMode=anyCardVariant&displayAs=list` renders every card in that set as `<a href="/cards/{cardId}/{cardSlug}">` links, unpaginated, in one page load — confirmed on set 11921 ("Shadowy Threats", Indonesian region), which rendered all 238 of its cards' links on a single page load, matching its own card count exactly. A card detail page at `https://www.tcgcollector.com/cards/{cardId}/{cardSlug}` contains the exact DOM structure used throughout this plan's parsing code below, captured directly from that same live page.

---

### Task 1: Scaffold the scraper tool

**Files:**
- Create: `scripts/scraper/package.json`
- Create: `scripts/scraper/tsconfig.json`
- Create: `scripts/scraper/vitest.config.ts`
- Create: `scripts/scraper/src/politeFetch.ts`
- Create: `scripts/scraper/src/politeFetch.test.ts`
- Create: `scripts/scraper/.gitignore`

A standalone Node/TypeScript project under `scripts/scraper/`, separate from the React app's own `package.json`/dependencies, since Playwright and cheerio have no business being in the shipped app's bundle.

- [ ] **Step 1: Create the scraper's own `package.json`**

```json
{
  "name": "card-database-scraper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "scrape-set": "tsx src/scrapeSet.ts"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "cheerio": "^1.0.0",
    "playwright": "^1.45.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
data/
```

(`data/` — the scraped output — is gitignored here deliberately: Phase 2's GitHub-assets-repo population step is what actually commits scraped output somewhere, and that's a different repo per the design spec, not this tooling repo.)

- [ ] **Step 5: Install dependencies and Playwright's browser binary**

Run: `cd scripts/scraper && npm install && npx playwright install chromium`
Expected: installs cleanly. (Playwright's Chromium download is large — expect this to take a few minutes.)

- [ ] **Step 6: Write the failing test for the politeness-bounded page-fetch helper**

```ts
// scripts/scraper/src/politeFetch.test.ts
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
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd scripts/scraper && npm test -- politeFetch`
Expected: FAIL — `./politeFetch` doesn't exist yet.

- [ ] **Step 8: Implement `politeFetch.ts`**

```ts
// scripts/scraper/src/politeFetch.ts
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
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd scripts/scraper && npm test -- politeFetch`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add scripts/scraper/package.json scripts/scraper/tsconfig.json scripts/scraper/vitest.config.ts scripts/scraper/.gitignore scripts/scraper/src/politeFetch.ts scripts/scraper/src/politeFetch.test.ts
git commit -m "Scaffold the card database scraper tool"
```

---

### Task 2: Playwright page-fetch wrapper

**Files:**
- Create: `scripts/scraper/src/browserFetch.ts`

A thin wrapper around a single shared Playwright browser instance, returning rendered HTML for a URL. No unit test here (it drives a real browser against a real network) — verified live in Task 4's end-to-end run instead, matching this project's own established pattern of skipping automated tests for things that fundamentally require live verification.

- [ ] **Step 1: Implement `browserFetch.ts`**

```ts
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
```

- [ ] **Step 2: Manual verification**

Run a throwaway script (not committed) to confirm this actually fetches a real tcgcollector.com page without hitting the 403 that plain `fetch()` got during research:

```ts
// throwaway, run with: cd scripts/scraper && npx tsx -e "..."
import { fetchRenderedHtml, closeBrowser } from './src/browserFetch.ts';
const html = await fetchRenderedHtml('https://www.tcgcollector.com/sets/id');
console.log(html.includes('Pokémon TCG sets') ? 'OK: got real page content' : 'FAILED: unexpected content');
await closeBrowser();
```

Expected: prints `OK: got real page content`.

- [ ] **Step 3: Commit**

```bash
git add scripts/scraper/src/browserFetch.ts
git commit -m "Add a Playwright-backed page-fetch wrapper for the scraper"
```

---

### Task 3: Parse a set's card-list page into card links

**Files:**
- Create: `scripts/scraper/src/parseSetCardList.ts`
- Create: `scripts/scraper/src/parseSetCardList.test.ts`
- Create: `scripts/scraper/src/fixtures/set-card-list.html` (a saved real HTML sample, see Step 1)

- [ ] **Step 1: Save a real fixture**

Using the browser tool (or the manual verification script from Task 2), fetch `https://www.tcgcollector.com/sets/11921/shadowy-threats?setCardCountMode=anyCardVariant&displayAs=list` and save its full rendered HTML to `scripts/scraper/src/fixtures/set-card-list.html`. This is a real page snapshot, not a hand-written approximation — the parser test below runs against it directly.

- [ ] **Step 2: Write the failing test**

```ts
// scripts/scraper/src/parseSetCardList.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSetCardList } from './parseSetCardList';

const fixtureHtml = readFileSync(
  fileURLToPath(new URL('./fixtures/set-card-list.html', import.meta.url)),
  'utf-8'
);

describe('parseSetCardList', () => {
  it('extracts every card id/slug link on the page, deduplicated', () => {
    const cards = parseSetCardList(fixtureHtml);
    expect(cards.length).toBeGreaterThan(0);
    const ids = cards.map((c) => c.cardId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it('extracts the known first card correctly', () => {
    const cards = parseSetCardList(fixtureHtml);
    const weedle = cards.find((c) => c.cardId === '70354');
    expect(weedle).toEqual({ cardId: '70354', cardSlug: 'weedle-shadowy-threats-001-164' });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd scripts/scraper && npm test -- parseSetCardList`
Expected: FAIL — `./parseSetCardList` doesn't exist yet.

- [ ] **Step 4: Implement `parseSetCardList.ts`**

```ts
// scripts/scraper/src/parseSetCardList.ts
import * as cheerio from 'cheerio';

export interface SetCardLink {
  cardId: string;
  cardSlug: string;
}

// A set's card-list page (fetched with ?displayAs=list) renders every card
// in the set as one <a href="/cards/{id}/{slug}"> link, unpaginated -- this
// is what makes a single page load enough to enumerate an entire set,
// confirmed live against set 11921 ("Shadowy Threats") during design
// research, where this pattern matched the set's own reported card count
// exactly.
export function parseSetCardList(html: string): SetCardLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, SetCardLink>();

  $('a[href^="/cards/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const match = href.match(/^\/cards\/(\d+)\/([a-z0-9-]+)/);
    if (!match) return;
    const [, cardId, cardSlug] = match;
    if (!seen.has(cardId)) {
      seen.set(cardId, { cardId, cardSlug });
    }
  });

  return Array.from(seen.values());
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd scripts/scraper && npm test -- parseSetCardList`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/scraper/src/parseSetCardList.ts scripts/scraper/src/parseSetCardList.test.ts scripts/scraper/src/fixtures/set-card-list.html
git commit -m "Parse a set's card-list page into card id/slug links"
```

---

### Task 4: Parse a card detail page into a structured record

**Files:**
- Create: `scripts/scraper/src/parseCardDetail.ts`
- Create: `scripts/scraper/src/parseCardDetail.test.ts`
- Create: `scripts/scraper/src/fixtures/card-detail-pokemon.html`

This is the core of the "one fetch, one record" data-integrity rule: both the card's metadata and its image URL come out of parsing this SAME fetched page, never assembled from two different fetches.

- [ ] **Step 1: Save a real fixture**

Fetch `https://www.tcgcollector.com/cards/70354/weedle-shadowy-threats-001-164` and save its rendered HTML to `scripts/scraper/src/fixtures/card-detail-pokemon.html`.

- [ ] **Step 2: Write the failing test**

```ts
// scripts/scraper/src/parseCardDetail.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCardDetail } from './parseCardDetail';

const pokemonFixtureHtml = readFileSync(
  fileURLToPath(new URL('./fixtures/card-detail-pokemon.html', import.meta.url)),
  'utf-8'
);

describe('parseCardDetail', () => {
  it('extracts a Pokemon card\'s full record from a real detail page', () => {
    const record = parseCardDetail(pokemonFixtureHtml, { cardId: '70354' });
    expect(record).toMatchObject({
      cardId: '70354',
      name: 'Weedle',
      supertype: 'Pokémon',
      hp: 50,
      stage: 'Basic',
      cardNumber: '001/164',
      expansionName: 'Shadowy Threats',
      expansionCode: 'MA5',
      rarity: 'Common (C)',
      illustrators: ['sowsow'],
      pokedexNumber: 13,
    });
    expect(record.attacks).toEqual([
      { name: 'Surprise Attack', damage: '30', description: 'Flip a coin. If tails, this attack does nothing.', cost: ['Grass'] },
    ]);
    expect(record.weakness).toEqual({ type: 'Fire', multiplier: '×2' });
    expect(record.resistance).toBeNull();
    expect(record.imageUrl).toMatch(/^https:\/\/static\.tcgcollector\.com\/.*\.webp$/);
  });

  it('picks the HIGHEST resolution image URL from the srcset, not the default (lowest) src', () => {
    const record = parseCardDetail(pokemonFixtureHtml, { cardId: '70354' });
    // The fixture's srcset includes a 320w, 640w, and 868w candidate --
    // this must pick the 868w one, not the plain `src` attribute (which is
    // the 320w default shown before srcset is considered).
    expect(record.imageUrl).toContain('6fbabb5298db92700e022b509530cf66c508cee07e909495dbc0b6a3e23cdfb6');
  });
});
```

(Adjust the exact expected hash substring in the second test if your saved fixture's actual srcset URLs differ from the ones captured during design research — copy the real highest-width URL straight out of your own saved fixture file rather than assuming the value above is still current, since tcgcollector may re-process/re-host images between when this plan was written and when it's implemented.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd scripts/scraper && npm test -- parseCardDetail`
Expected: FAIL — `./parseCardDetail` doesn't exist yet.

- [ ] **Step 4: Implement `parseCardDetail.ts`**

```ts
// scripts/scraper/src/parseCardDetail.ts
import * as cheerio from 'cheerio';

export interface CardAttack {
  name: string;
  damage: string;
  description: string;
  cost: string[];
}

export interface CardTypeAmount {
  type: string;
  multiplier: string;
}

export interface CardRecord {
  cardId: string;
  name: string;
  supertype: string; // "Pokémon" | "Trainer" | "Energy"
  hp: number | null;
  energyTypes: string[];
  stage: string | null;
  attacks: CardAttack[];
  weakness: CardTypeAmount | null;
  resistance: CardTypeAmount | null;
  retreatCost: number;
  expansionName: string;
  expansionCode: string;
  expansionId: string | null;
  cardNumber: string;
  rarity: string | null;
  illustrators: string[];
  pokedexNumber: number | null;
  imageUrl: string;
}

// Picks the highest-resolution candidate out of an <img>'s srcset (a
// space-separated "url widthw, url widthw, ..." list) rather than its
// plain `src`, which tcgcollector serves at a smaller default size intended
// for the page's own inline display, not for archival.
function highestResolutionSrc($img: ReturnType<ReturnType<typeof cheerio.load>>): string {
  const srcset = $img.attr('srcset');
  const src = $img.attr('src') ?? '';
  if (!srcset) return src;
  const candidates = srcset.split(',').map((entry) => {
    const [url, width] = entry.trim().split(/\s+/);
    return { url, width: parseInt(width, 10) || 0 };
  });
  candidates.sort((a, b) => b.width - a.width);
  return candidates[0]?.url ?? src;
}

function footerItemText($: ReturnType<typeof cheerio.load>, title: string): ReturnType<typeof cheerio.load> | null {
  const item = $('.card-info-footer-item')
    .filter((_, el) => $(el).find('.card-info-footer-item-title').text().trim() === title)
    .first();
  return item.length ? item : null;
}

export function parseCardDetail(html: string, context: { cardId: string }): CardRecord {
  const $ = cheerio.load(html);

  const name = $('#card-info-title a').text().trim();
  const supertype = $('.card-type-container').first().text().trim();
  const hpText = $('#card-hit-points-value').text().trim();
  const hp = hpText ? parseInt(hpText, 10) : null;
  const energyTypes = $('#card-hit-points-energy-types .energy-type-symbol')
    .map((_, el) => $(el).attr('alt') ?? '')
    .get()
    .filter(Boolean);
  const stageText = $('#card-evolution-status a').first().text().trim();
  const stage = stageText || null;
  const imageUrl = highestResolutionSrc($('#card-image-container img').first());

  const attacks: CardAttack[] = $('.card-attack')
    .map((_, el) => {
      const $attack = $(el);
      const cost = $attack
        .find('.card-attack-energies .energy-type-symbol')
        .map((_i, img) => $(img).attr('alt') ?? '')
        .get()
        .filter(Boolean);
      return {
        name: $attack.find('.card-attack-name').text().trim(),
        damage: $attack.find('.card-attack-damage').text().trim(),
        description: $attack.find('.card-attack-description').text().trim(),
        cost,
      };
    })
    .get();

  function parseTypeAmount(title: string): CardTypeAmount | null {
    const item = footerItemText($, title);
    if (!item) return null;
    const type = item.find('.energy-type-symbol').first().attr('alt');
    const multiplier = item.find('.card-info-footer-item-entry-text').first().text().trim();
    if (!type) return null; // "—" (none) renders with no energy-type-symbol at all
    return { type, multiplier };
  }

  const weakness = parseTypeAmount('Weakness');
  const resistance = parseTypeAmount('Resistance');
  const retreatCost = footerItemText($, 'Retreat Cost')?.find('.card-info-footer-item-entry').length ?? 0;

  const expansionItem = footerItemText($, 'Expansion');
  const expansionName = expansionItem?.find('#card-info-footer-item-text-expansion-name').text().trim() ?? '';
  const expansionCode = expansionItem?.find('#card-info-footer-item-text-expansion-code').text().trim() ?? '';
  const expansionHref = expansionItem?.find('a[href^="/sets/"]').attr('href') ?? '';
  const expansionIdMatch = expansionHref.match(/^\/sets\/(\d+)\//);
  const expansionId = expansionIdMatch ? expansionIdMatch[1] : null;

  const cardNumber = footerItemText($, 'Card number')?.find('.card-info-footer-item-text').text().trim() ?? '';

  const rarityItem = footerItemText($, 'Rarity');
  const rarity = rarityItem?.find('.card-info-footer-item-text').first().text().trim() || null;

  const illustrators = (footerItemText($, 'Illustrators')?.find('.card-info-footer-item-text a') ?? $())
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const pokedexHref = footerItemText($, 'Pokédex')?.find('a[href^="/pokedex/"]').attr('href') ?? '';
  const pokedexMatch = pokedexHref.match(/^\/pokedex\/(\d+)\//);
  const pokedexNumber = pokedexMatch ? parseInt(pokedexMatch[1], 10) : null;

  return {
    cardId: context.cardId,
    name,
    supertype,
    hp,
    energyTypes,
    stage,
    attacks,
    weakness,
    resistance,
    retreatCost,
    expansionName,
    expansionCode: expansionCode.trim(),
    expansionId,
    cardNumber,
    rarity,
    illustrators,
    pokedexNumber,
    imageUrl,
  };
}
```

- [ ] **Step 5: Run the test, and reconcile against the real fixture**

Run: `cd scripts/scraper && npm test -- parseCardDetail`
Expected: The structural fields (name, hp, stage, attacks, expansion, cardNumber, rarity, illustrators, pokedexNumber) should PASS as written, since they're transcribed directly from the real DOM captured during research. If any field's exact selector doesn't match your own freshly-saved fixture (the site may have changed slightly, or your fixture capture may differ in some detail), open the fixture file, find the actual surrounding markup for that field, and adjust the selector in `parseCardDetail.ts` to match — do not adjust the TEST to match broken output; the test's expected values are the ground truth captured from the live page.

- [ ] **Step 6: Add a second fixture and test for a non-Pokémon card (Trainer or Energy), which has no HP/attacks/weakness/stage**

Navigate to any Trainer or Energy card in the same set (browse `https://www.tcgcollector.com/sets/11921/shadowy-threats?displayAs=list` for one, e.g. a Trainer card near the end of the set), save its HTML as `scripts/scraper/src/fixtures/card-detail-trainer.html`, and add:

```ts
// scripts/scraper/src/parseCardDetail.test.ts — add this test
it('handles a Trainer/Energy card with no HP, attacks, weakness, or stage', () => {
  const trainerFixtureHtml = readFileSync(
    fileURLToPath(new URL('./fixtures/card-detail-trainer.html', import.meta.url)),
    'utf-8'
  );
  const record = parseCardDetail(trainerFixtureHtml, { cardId: 'PLACEHOLDER' });
  expect(record.hp).toBeNull();
  expect(record.attacks).toEqual([]);
  expect(record.weakness).toBeNull();
  expect(record.stage).toBeNull();
  expect(record.name).not.toBe('');
  expect(record.imageUrl).toMatch(/^https:\/\/static\.tcgcollector\.com\//);
});
```

Replace `'PLACEHOLDER'` with the real card id from whichever Trainer/Energy card you fetched, and adjust `parseCardDetail.ts` if any of its selectors throw or behave unexpectedly on this fixture's different DOM shape (e.g. confirm `.card-type-container` correctly reads "Trainer" or "Energy" instead of "Pokémon", and that the footer-item lookups for Weakness/Resistance/Retreat Cost/Pokédex simply return `null`/empty when those sections don't exist for this card type, rather than throwing).

- [ ] **Step 7: Run the full scraper test suite to confirm everything passes**

Run: `cd scripts/scraper && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add scripts/scraper/src/parseCardDetail.ts scripts/scraper/src/parseCardDetail.test.ts scripts/scraper/src/fixtures/card-detail-pokemon.html scripts/scraper/src/fixtures/card-detail-trainer.html
git commit -m "Parse a card detail page into a structured record, image URL included"
```

---

### Task 5: Image download with integrity validation

**Files:**
- Create: `scripts/scraper/src/downloadImage.ts`
- Create: `scripts/scraper/src/downloadImage.test.ts`

Per the design spec's integrity rules: validate every image fetch beyond HTTP status (content-type, byte-size floor), and hash every image at ingest.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/scraper/src/downloadImage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { validateImageResponse } from './downloadImage';

describe('validateImageResponse', () => {
  it('accepts a plausible webp image response', () => {
    const result = validateImageResponse({
      contentType: 'image/webp',
      byteLength: 45_000,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects a response with the wrong content-type', () => {
    const result = validateImageResponse({ contentType: 'text/html', byteLength: 45_000 });
    expect(result).toEqual({ ok: false, reason: 'unexpected content-type: text/html' });
  });

  it('rejects a suspiciously tiny response (likely a placeholder/error image)', () => {
    const result = validateImageResponse({ contentType: 'image/webp', byteLength: 200 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too small/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd scripts/scraper && npm test -- downloadImage`
Expected: FAIL — `./downloadImage` doesn't exist yet.

- [ ] **Step 3: Implement `downloadImage.ts`**

```ts
// scripts/scraper/src/downloadImage.ts
import { createHash } from 'node:crypto';

const MIN_BYTE_SIZE = 2_000; // A real card image is tens of KB at minimum; anything under ~2KB is almost certainly a placeholder/error graphic, not real art.
const ACCEPTED_CONTENT_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);

export type ImageValidationResult = { ok: true } | { ok: false; reason: string };

export function validateImageResponse(input: { contentType: string; byteLength: number }): ImageValidationResult {
  if (!ACCEPTED_CONTENT_TYPES.has(input.contentType)) {
    return { ok: false, reason: `unexpected content-type: ${input.contentType}` };
  }
  if (input.byteLength < MIN_BYTE_SIZE) {
    return { ok: false, reason: `image too small (${input.byteLength} bytes)` };
  }
  return { ok: true };
}

export interface DownloadedImage {
  bytes: Buffer;
  sha256: string;
  contentType: string;
}

// Downloads via the same Playwright browser context (not a plain fetch),
// consistent with every other network call this scraper makes -- tested
// live for HTML pages already in Task 2; images are served from a separate
// static.tcgcollector.com host and were not independently confirmed to also
// require a browser context during design research, so verify this against
// a plain `fetch()` first when implementing (it may work without a browser,
// since it's a static asset CDN rather than the main site's Cloudflare
// front) and fall back to a Playwright-driven request only if a plain fetch
// gets blocked.
export async function downloadAndValidateImage(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ image: DownloadedImage } | { error: string }> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }
  const contentType = res.headers.get('content-type') ?? '';
  const arrayBuffer = await res.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const validation = validateImageResponse({ contentType, byteLength: bytes.byteLength });
  if (!validation.ok) {
    return { error: validation.reason };
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { image: { bytes, sha256, contentType } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd scripts/scraper && npm test -- downloadImage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/src/downloadImage.ts scripts/scraper/src/downloadImage.test.ts
git commit -m "Add image download with content-type/size validation and SHA-256 hashing"
```

---

### Task 6: End-to-end single-set orchestration script

**Files:**
- Create: `scripts/scraper/src/scrapeSet.ts`

Ties Tasks 1-5 together into a runnable script: fetch a set's card list, then each card's detail page and image, writing output to `data/{language}/{expansionCode}/{cardNumber}.json` plus `data/{language}/{expansionCode}/{cardNumber}.{ext}` for the image, with bounded concurrency and the politeness delay from Task 1. No unit test (this is an orchestration script driving real network calls) — Task 7 is its live validation run.

- [ ] **Step 1: Implement `scrapeSet.ts`**

```ts
// scripts/scraper/src/scrapeSet.ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchRenderedHtml, closeBrowser } from './browserFetch';
import { parseSetCardList } from './parseSetCardList';
import { parseCardDetail } from './parseCardDetail';
import { downloadAndValidateImage } from './downloadImage';
import { withPoliteDelay } from './politeFetch';

const POLITE_DELAY_MS = 750;
const politeFetchHtml = withPoliteDelay(fetchRenderedHtml, POLITE_DELAY_MS);
const politeDownloadImage = withPoliteDelay(downloadAndValidateImage, POLITE_DELAY_MS);

async function main() {
  const [, , region, setId, setSlug, languageCode] = process.argv;
  if (!region || !setId || !setSlug || !languageCode) {
    console.error('Usage: npm run scrape-set -- <region> <setId> <setSlug> <languageCode>');
    console.error('Example: npm run scrape-set -- id 11921 shadowy-threats id');
    process.exit(1);
  }

  const setListUrl = `https://www.tcgcollector.com/sets/${setId}/${setSlug}?setCardCountMode=anyCardVariant&displayAs=list`;
  console.log(`Fetching set card list: ${setListUrl}`);
  const listHtml = await politeFetchHtml(setListUrl);
  const cardLinks = parseSetCardList(listHtml);
  console.log(`Found ${cardLinks.length} cards in this set.`);

  const outDir = path.join('data', languageCode);
  await mkdir(outDir, { recursive: true });

  let succeeded = 0;
  let failed = 0;

  for (const link of cardLinks) {
    const detailUrl = `https://www.tcgcollector.com/cards/${link.cardId}/${link.cardSlug}`;
    try {
      const detailHtml = await politeFetchHtml(detailUrl);
      const record = parseCardDetail(detailHtml, { cardId: link.cardId });

      const imageResult = await politeDownloadImage(record.imageUrl);
      if ('error' in imageResult) {
        console.error(`  Image failed for ${record.name} (${link.cardId}): ${imageResult.error}`);
        failed++;
        continue;
      }

      const safeCardNumber = record.cardNumber.replace(/\//g, '-');
      const baseName = `${record.expansionCode || setSlug}-${safeCardNumber || link.cardId}`;
      const ext = imageResult.image.contentType.split('/')[1] ?? 'webp';

      await writeFile(
        path.join(outDir, `${baseName}.json`),
        JSON.stringify({ ...record, imageSha256: imageResult.image.sha256, sourceCardId: link.cardId, sourceCardSlug: link.cardSlug }, null, 2)
      );
      await writeFile(path.join(outDir, `${baseName}.${ext}`), imageResult.image.bytes);

      console.log(`  OK: ${record.name} (${baseName})`);
      succeeded++;
    } catch (err) {
      console.error(`  Failed ${link.cardId}/${link.cardSlug}:`, err);
      failed++;
    }
  }

  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
  await closeBrowser();
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/scraper/src/scrapeSet.ts
git commit -m "Add the end-to-end single-set scraping orchestration script"
```

---

### Task 7: Validation run against one real set

**Files:** none (this is a live run + manual review, not a code change)

- [ ] **Step 1: Run the scraper against the same set used for the fixtures**

Run: `cd scripts/scraper && npm run scrape-set -- id 11921 shadowy-threats id`
Expected: completes with a success count close to the set's known card count (238 for Shadowy Threats), a low/zero failure count, and populated `.json`/image file pairs under `scripts/scraper/data/id/`.

- [ ] **Step 2: Spot-check a stratified sample by hand**

Open 10-15 of the resulting JSON files spread across the set (first, middle, last cards; at least one Trainer/Energy card if the set has any) alongside their paired images, and confirm: the image genuinely matches the named Pokémon/card, HP/attacks/rarity/illustrator look plausible, and the `imageSha256` field is present and non-empty on every record.

- [ ] **Step 3: Report findings**

Document, in this plan file or a follow-up note: the actual success/failure count, any parsing edge cases discovered (e.g. a card type this plan's fixtures didn't cover — Pokémon ex/GX/V cards often have two attacks or an Ability block above the attacks, which `parseCardDetail.ts` may not yet handle; check for an `.card-ability` or similarly-named block in a fixture from such a card if the set contains one, and extend the parser + add a fixture/test for it if so), and whether the ~750ms politeness delay felt reasonable for a set this size (238 cards × ~1.5s per card round-trip including both the detail page and image fetch ≈ 6 minutes for one set — extrapolate this rate against the full multi-region card count from the design spec's TCGdex-based estimate when scoping Phase 2's timeline).

- [ ] **Step 4: Do NOT commit `scripts/scraper/data/`** (already gitignored per Task 1) — this is throwaway validation output, not the final dataset. Phase 2 defines where a full run's output actually goes (the separate GitHub assets repo from the design spec).

---

## What Phase 2 covers (not in this plan)

- Scaling the crawl to every set across all four regions (`intl`, `jp`, `cn`, `id`), enumerated via each region's `/sets/{region}` listing page.
- Handling the parser edge cases found during Task 7's validation run (Ability blocks, multi-attack Pokémon, card variants like reverse holo/1st edition/alt art as the design spec's data model calls for).
- Creating the separate plain GitHub repo for images and populating it, wired through jsDelivr per the design spec's storage architecture.
- The AI vision QC pass over a stratified sample of the full dataset.
- Migrating the React app itself to read from this dataset instead of live `api.tcgdex.net` calls, while preserving the existing live-API + user-upload fallback for anything the dataset doesn't cover.
- A decision on re-sync cadence (one-time vs. a scheduled rebuild).
- **Backfilling missing Pokédex numbers via name lookup, not a second live site.** `parseCardDetail.ts`'s `pokedexNumber` comes from tcgcollector's own `/pokedex/{n}/...` link on the card page, but that link is absent on some cards (the site hasn't linked every card to its species entry, similar to TCGdex's own `dexId: null` gap this app already worked around this session). The fix does NOT reintroduce a cross-source join: every card record already carries its own `name` field from that same page fetch, so a missing `pokedexNumber` should be backfilled by looking that name up against a canonical, static Pokémon name→dex-number table — a fixed reference list, not a second live data source that could disagree about which artwork belongs to which card. That table doesn't fully exist in this app yet (`src/data/gen1Dex.ts` only covers Gen 1); Phase 2 needs to source a complete one (PokeAPI, already used in this app for sprites, is the natural candidate) and reuse the whole-word name-matching approach already proven this session for the Ascended Heroes fix (`src/api/tcgdex.ts`'s `fetchAllCardsForDex`) to correctly resolve decorated card names ("Mega Charizard X ex", "Dark Gengar", "Alolan Vulpix") down to their base species.
