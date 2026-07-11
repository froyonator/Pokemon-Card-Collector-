# Card Database Scraper — Handoff Instructions

This document is a self-contained brief for continuing the card-database scraping work in this repo (`card collector`, aka "Collector's Ledger"). It's written so an agent with no prior context on this project can pick up exactly where the last session left off.

## What this project is

A Pokémon TCG collection tracker (React + TypeScript + Vite, deployed to GitHub Pages). It currently fetches card data live from `api.tcgdex.net` on every session. The goal of this scraping work is to replace that with a self-hosted, offline-scraped dataset — richer per-card data, no dependency on TCGdex's uptime/rate limits, and no ~1,300-request bulk load on every fresh install.

Full design rationale: [`docs/superpowers/specs/2026-07-11-self-hosted-card-database-design.md`](superpowers/specs/2026-07-11-self-hosted-card-database-design.md). Full Phase 1 implementation plan (task-by-task, already mostly executed): [`docs/superpowers/plans/2026-07-11-card-database-scraper-plan.md`](superpowers/plans/2026-07-11-card-database-scraper-plan.md).

## What's already built (working, tested, do not need to redo)

A standalone Node/TypeScript project at `scripts/scraper/` (its own `package.json`, separate from the React app's dependencies — Playwright/cheerio have no business in the shipped app bundle):

- `src/politeFetch.ts` — rate-limits any async function to a minimum delay between calls (750ms used in practice).
- `src/browserFetch.ts` — drives a real headless Chromium (Playwright) to fetch and render a URL's HTML. **Required**: the target site blocks plain HTTP fetches (see "The blocker" below), so every page load must go through a real browser.
- `src/parseSetCardList.ts` — parses a set's card-list page into `{cardId, cardSlug}[]` links.
- `src/parseCardDetail.ts` — parses one card's detail page into a full structured record (see schema below).
- `src/downloadImage.ts` — downloads a card image with content-type/size validation and SHA-256 hashing.
- `src/scrapeSet.ts` — end-to-end orchestration: fetch a set's card list → for each card, fetch its detail page + image → write JSON + image file to `data/<languageCode>/`.
- Fixtures under `src/fixtures/` — real captured HTML pages from the live site, used by the unit tests (not hand-written approximations).
- Full test suite: `cd scripts/scraper && npm test` → all passing (parsing logic is pure/testable without a browser).

Install once: `cd scripts/scraper && npm install && npx playwright install chromium`.

Run a scrape: `cd scripts/scraper && npm run scrape-set -- <region> <setId> <setSlug> <languageCode>`, e.g. `npm run scrape-set -- id 11921 shadowy-threats id`.

## The site to scrape

**Primary source: `tcgcollector.com`.** Chosen over alternatives (pokedata.io, official Pokémon galleries) for having the richest per-card text data and best-curated images (aggregated by their own maintainers from official scans + top community contributors).

- Regions live today: International (`intl`), Japan (`jp`), China (`cn`), Indonesia (`id`). Korea/Thailand/Taiwan-HK are modeled in their schema but not yet populated on the site.
- Set list page (per region): `https://www.tcgcollector.com/sets/{region}` — enumerate every set.
- Set card-list page (renders every card in the set, unpaginated, on one page load): `https://www.tcgcollector.com/sets/{setId}/{setSlug}?setCardCountMode=anyCardVariant&displayAs=list`
- Card detail page (name/HP/attacks/rarity/illustrator/Pokédex/image all on one page): `https://www.tcgcollector.com/cards/{cardId}/{cardSlug}`
- `robots.txt` blocks `/api/` and paginated query patterns (`?page=`/`&page=`) on the global card search, but does **not** block individual set pages or card detail pages, and a set's card list renders unpaginated — so the crawl unit is one page fetch per set, then one page fetch per card.

**Secondary/reference source** (not for bulk ingestion, only as a cross-check during QC): `tcgdex/cards-database` on GitHub (MIT-licensed) — a second, independently-assembled dataset covering much of the same cards.

## Data-integrity rule (non-negotiable)

**One card record's image and metadata must always come from the same page fetch.** Never assemble a record by pairing an image pulled from one place with text pulled from another — this is what makes a card's artwork silently drift out of sync with its claimed name/set/rarity. tcgcollector's card detail pages already bundle both on one page; read both off that one fetch and write them as one atomic record. `parseCardDetail.ts` already does this correctly — preserve this property in any new code.

If a field is missing from that one page (e.g. Pokédex number isn't always linked), backfill it via a **static reference table** (e.g. species name → dex number, sourced from PokeAPI), never by querying a second live site and joining on a guess.

## Full per-card data to capture

Exact shape already implemented in `parseCardDetail.ts`'s `CardRecord` interface:

```ts
interface CardRecord {
  cardId: string;
  name: string;
  supertype: string;        // "Pokémon" | "Trainer" | "Energy"
  hp: number | null;
  energyTypes: string[];
  stage: string | null;
  attacks: { name: string; damage: string; description: string; cost: string[] }[];
  weakness: { type: string; multiplier: string } | null;
  resistance: { type: string; multiplier: string } | null;
  retreatCost: number;
  expansionName: string;
  expansionCode: string;
  expansionId: string | null;
  cardNumber: string;
  rarity: string | null;
  illustrators: string[];
  pokedexNumber: number | null;
  imageUrl: string;         // highest-resolution srcset candidate, not the small inline default
}
```

Plus, at write time (`scrapeSet.ts`), each record also gets `imageSha256`, `sourceCardId`, `sourceCardSlug` attached before being written to disk.

Output layout (already implemented): one `.json` + one image file per card, under `data/<languageCode>/`, named `<expansionCode-or-slug>-<cardNumber>.<ext>`. This mirrors the design spec's **Language → Set → Card** data model — the app's existing `CardRecord` type (`src/types/index.ts`) needs at minimum `id, name, dexNumber, setId, setName, localId, rarity, imageBase, language`; the scraper's richer fields (attacks, HP, illustrator, etc.) are kept for future filtering/search even though the app doesn't consume them yet.

**Variant modeling** (reverse holo, 1st edition, alt art, jumbo) as distinct sub-entities with their own images is part of the target data model but not yet implemented in the parser — see "Not yet done" below.

## The blocker: Cloudflare Turnstile

`tcgcollector.com` sits behind Cloudflare. Plain HTTP fetches get blocked outright (confirmed during design research — hence the Playwright browser-driven approach already built). Beyond that, live validation runs (Task 7 of the implementation plan) hit a **Cloudflare Turnstile managed challenge**: `fetchRenderedHtml` against both a set-list URL and a card-detail URL reliably times out waiting for `networkidle`, and inspecting the actual served page shows a "Just a moment..." interstitial referencing `challenges.cloudflare.com`. This is a fingerprint-based automation block, not a slow-resolving proof-of-work or a parsing bug — raising the fetch timeout does not fix it. Confirmed reproducible on 2026-07-11.

**Do not attempt to work around this with stealth/fingerprint-spoofing automation** (e.g. `undetected-chromedriver`, `playwright-extra` + stealth plugin, SeleniumBase's undetected mode) or third-party "scraping API" services that do the same thing on your behalf. That's bot-detection evasion regardless of which tool implements it or who runs it, and it's out of scope for this project — this was already evaluated and explicitly declined in the prior session.

**Legitimate ways to actually get past this:**

1. **A human clears the Turnstile challenge once**, in their own ordinary browser, logged in as themselves — not automation. If the resulting session/cookie can be exported and handed to Playwright (e.g. via `storageState`), the scraper can reuse that session for a real run without itself needing to defeat the challenge.
2. **Accept the existing fixture-level validation as sufficient interim proof** that the parsing logic is correct (see below) and defer the full live-set run to whenever a session becomes available, rather than blocking all further scraper work on it.
3. Reasonable, non-evasive crawler politeness (bounded concurrency, a real user-agent, delays between requests — already implemented via `politeFetch.ts` at 750ms) is expected and fine; it's just not what's causing this particular block, so it won't fix it.

## Current validation status

Tasks 1-6 of the implementation plan are complete: the scraper's own test suite passes in full (parsers verified against real captured fixtures — a genuine set-list page and two genuine card-detail pages, ~588KB-1.89MB each, not hand-written approximations). Task 7 (a live `scrape-set` run against one full real set, plus a manual stratified spot-check of 10-15 results) has **not** happened — it's blocked exactly as described above. Don't treat Task 7 as done or skip re-attempting it once a session is available; the fixture-level validation is real but is not a substitute for seeing a full live run's actual success/failure rate and edge cases.

## Not yet done (Phase 2 scope, once Task 7 unblocks)

- Scaling the crawl to every set across all four live regions, enumerated via each region's `/sets/{region}` listing page.
- Handling parser edge cases a real full-set run will surface (Ability text blocks, multi-attack Pokémon, card variants like reverse holo/1st edition/alt art as distinct sub-entities with their own images — not modeled yet).
- Creating a separate plain (non-Pages) GitHub repo for images, organized by a stable `language/set/localId/variant` path scheme, served through jsDelivr's GitHub CDN (`cdn.jsdelivr.net/gh/<user>/<repo>@<ref>/<path>`) rather than GitHub Pages — no Git LFS, since jsDelivr reads git blobs directly. jsDelivr's own bandwidth/size/caching terms haven't been researched yet; check before committing to it.
- An AI vision QC pass over a stratified random sample of the finished dataset each sync (shown the image+metadata pair together, judged on plausibility, not re-derivation of truth) — flagged records route to manual review; confirmed-bad ones get logged so re-syncs don't re-flag them.
- Migrating the React app itself to read from this dataset instead of live `api.tcgdex.net` calls, while keeping the existing live-API + user-upload-image fallback for anything the dataset doesn't cover (this is permanent behavior for sparse-coverage languages like Korean, not a temporary stopgap).
- A decision on re-sync cadence (one-time snapshot vs. a scheduled rebuild).
- Backfilling missing Pokédex numbers via a static species name→dex-number reference table (PokeAPI is the natural source, already used elsewhere in this app for sprites) using the same whole-word name-matching approach already proven in this codebase (`src/api/tcgdex.ts`'s `fetchAllCardsForDex`, used for the "Ascended Heroes" fix) to correctly resolve decorated card names ("Mega Charizard X ex", "Dark Gengar", "Alolan Vulpix") down to their base species — not a second live-site join.
- Full generation/dex scope: the target scope is every set, every card, every live region — not just Gen 1. The app's own `src/data/gen1Dex.ts` only covers Gen 1 today; future generation support in the app is a separate, later change to that file, not something the scraper itself needs to gate on.

## Engineering discipline to preserve

- **Snapshot, don't stream.** Each full scrape run should be a versioned, immutable snapshot (e.g. a dated folder or tagged release), not an in-place mutation of a live dataset. A bad run gets rolled back to the previous snapshot rather than patched live.
- **Validate every image beyond HTTP status** — reject anything under a sane byte-size floor, confirm content-type, sanity-check decoded pixel dimensions (`downloadImage.ts` already does content-type/size validation).
- **Hash every image at ingest** (SHA-256, already implemented) so a future re-sync can detect an unexpected change to a previously-fetched image instead of silently overwriting it.
- **Stratified spot-check sampling on every sync** — random cards spread across sets, eras, languages, and rarities, not just the newest additions.
- Keep following TDD for new parser/logic code (write the failing test against a real captured fixture first) — this codebase's existing scraper tests are the pattern to match.
- `scripts/scraper/data/` is gitignored deliberately — scraped output doesn't belong in this repo; it's throwaway/local until the Phase 2 GitHub-assets-repo step defines where a full run's output actually goes.
