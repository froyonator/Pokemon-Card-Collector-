# Gen 1 Special/Full Art Card Collector: Design

**Status:** Approved
**Repo:** https://github.com/froyonator/Pokemon-Card-Collector-
**Date:** 2026-07-10

## Overview

A web app for tracking a personal collection of Gen 1 (Kanto, #001-151) Pokémon TCG special-art / full-art cards. Shows all 151 Pokémon in dex order, lets the collector mark which specific card printing they own (with condition), track a wishlist, and see market value in their preferred currency. Deployed as a static site on GitHub Pages, built via GitHub Actions on every push to `main`.

## Goals / non-goals

- Goal: comprehensive tracker across the *entire* history of full-art/special-art style cards for Gen 1, not just the current era.
- Goal: works with live, free, no-API-key data sources only (no harvesting, no paid feeds).
- Goal: visually polished, custom UI with real animation. Not a generic templated look.
- Goal: friendly and approachable for a first-time user, with a guided tutorial.
- Non-goal: real per-condition (graded) pricing. Not available from free sources; condition is a reference-only label.
- Non-goal: sales-volume ("units sold/month") data. Not available from free sources; dropped from scope.
- Non-goal: tracking Mega/Gmax/regional forms as separate grid tiles. Their cards still surface under the base Pokémon's picker.

## Writing style

All UI copy (labels, tooltips, empty states, tutorial text, error/warning messages) and all project documentation should read as clear, natural, well-written text. No em dashes anywhere, in the app or in the docs; use commas, periods, or parentheses instead.

## Data sources

| Source | Used for | Notes |
|---|---|---|
| [TCGdex API](https://tcgdex.dev) (`api.tcgdex.net/v2/{lang}/cards`) | Card metadata, images, rarity, pricing | Query per dex number: `dexId=eq:N&rarity=eq:<tier>`. Supports per-language paths (`en`, `ja`, `fr`, `de`, ...), which naturally excludes region-exclusive prints when querying a different language. Pricing comes embedded on the card detail endpoint (`pricing.cardmarket` EUR, `pricing.tcgplayer` USD). |
| PokeAPI sprites (`raw.githubusercontent.com/PokeAPI/sprites`) | Dex grid sprite images (official artwork) | Static, stable, keyed by national dex number. |
| [Frankfurter API](https://frankfurter.dev) | Currency conversion (USD/EUR to AUD/GBP/CAD/etc.) | Free, no key, ECB-sourced daily rates. Conversions are clearly labeled as estimates. |

All three are called client-side at runtime; no backend/server component.

## Rarity scope & grouping

"Special/full art" spans decades of different TCG eras and rarity names. The app fetches and caches **every** rarity tier that plausibly qualifies, then groups them for display/filtering rather than hard-coding a fixed list.

Default groups (seeded, editable):
1. **Full Art**: Rare Ultra, Ultra Rare (V/EX/VMAX/VSTAR/ex full-art prints)
2. **Alt Art / Illustration Rare**: Special Illustration Rare, Illustration Rare, Trainer Gallery Rare Holo, Classic Collection
3. **Rainbow / Gold Secret**: Rare Rainbow, Rare Secret, Hyper Rare, Mega Hyper Rare
4. **Vintage Specials**: Rare Holo Star, Rare Shining, Rare Shiny GX (special but not full-bleed art)

A **Manage Groups** panel lets the user rename groups, move any rarity tier between groups, or create new groups. Every distinct rarity string TCGdex has ever returned (across all fetched dex numbers) is listed there. Group membership persists in localStorage.

## Filters

- **Rarity group checkboxes** (from the groupings above): control what counts as "available" for the picker and the red/unavailable tile state.
- **Language selector**: dropdown of TCGdex-supported languages, default English. Switching language re-scopes which cards exist (region exclusives naturally drop out) and triggers a fetch if that language isn't cached yet.
- **Currency picker**: USD / EUR (native) plus AUD / GBP / CAD (converted via Frankfurter), applies to all displayed prices and totals.

Filters affect the Dex Grid screen (availability and picker contents) only. They never retroactively hide or un-mark something already recorded as owned or wishlisted, and the Collection/Wishlist/Summary tabs always show the user's actual saved records regardless of filter state.

## Screens

### 1. Dex Grid (main screen)
- 151 tiles, strict national dex order, one tile per Pokémon (no separate form tiles).
- Toggle: **Sprite view** and **Card view** (compact thumbnail size in both, no oversized or blurry card renders).
- Tile states:
  - **Available, not owned**: full color sprite, or empty dashed card-shaped placeholder.
  - **Owned**: desaturated/dulled sprite with a checkmark badge, or the owned card's thumbnail.
  - **Unavailable**: red-tinted sprite or red-tinted placeholder, tooltip explains no cards match current filters.
- Click a tile to open the **picker**: thumbnail grid of every card matching current filters for that dex number.
  - Each picker card has a star icon (top right) that toggles that card as the dex number's wishlist pick. Only one wishlist pick per dex number is allowed; attempting a second while one exists shows a warning and is blocked (must un-star first).
  - Clicking the card body (not the star) marks it owned: opens a small condition-select step (Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged), confirms, closes the picker, dulls the tile, and clears any wishlist entry for that dex number.
  - Clicking an already-owned tile reopens the picker with the current pick highlighted, offering a change or unmark option.

### 2. My Collection
Table of owned cards: thumbnail, name, set, condition, price (selected currency). Sortable by price, dex number, name. Rows removable.

### 3. Wishlist
Same table shape for starred cards, plus a running total of price needed to complete the wishlist.

### 4. Summary
Total owned out of 151, total collection value, owned-vs-available progress bar under current filters.

## Onboarding tutorial

A persistent "Tutorial" button, anchored in the bottom corner of the app, launches a guided walkthrough for first-time (and returning) users. It steps through the main flows in plain, friendly language: what the grid states mean, how to open the picker and mark a card owned, how to set condition, how to use the star for wishlisting, what the filters and currency picker do, where the Collection, Wishlist and Summary tabs are, and how export/import works. Each step highlights the relevant part of the UI and can be skipped or dismissed at any point, and can be relaunched from the same button at any time. Implemented with a lightweight guided-tour library (for example, `react-joyride`) rather than hand-rolled tooltip logic.

## Pricing & refresh

- Card pricing (Cardmarket EUR, TCGplayer USD) is cached alongside card metadata with its own last-updated timestamp.
- **Refresh Data**: full rescan of all 151 dex numbers across rarity tiers and the selected language. Used when new sets release.
- **Refresh Market Prices**: lighter action that re-fetches pricing only for cards currently owned or wishlisted.
- Condition does not adjust price, since no free data source breaks pricing out by condition. The UI notes this explicitly next to price displays.

## Resilience / offline behavior

- Card metadata cached in localStorage; the app renders from cache even if TCGdex is unreachable.
- Sprite and card images cached as blobs in IndexedDB on first successful load and served from there afterward, so a dead upstream link doesn't break already-viewed images.
- Internet is required for first-time loads of new data/images and for refresh actions; previously-viewed content survives outages.

## Tech stack

- **React + TypeScript + Vite**: component structure for the tabs, picker, grid, and settings state; fast dev/build.
- **Animation**: Framer Motion for grid tile transitions, picker modal open/close, and tab switches.
- **Styling**: deferred to implementation. The visual design pass must avoid a generic, templated look; it should feel smooth, custom, and deliberate. The `frontend-design` skill should be invoked during implementation for the visual design pass.
- **Testing**: Vitest for pure logic (rarity grouping, dex-number mapping, currency conversion, wishlist/ownership rules). No end-to-end framework for v1; manual browser verification for UI flows.

### Suggested structure
```
src/
  api/          tcgdex.ts, pokeapi.ts, fx.ts
  storage/      localStorage + IndexedDB wrappers
  data/         gen1-dex.ts (static #001-151 name/number list)
  state/        app state (filters, groups, collection, wishlist)
  components/   DexGrid, Tile, Picker, ConditionPicker, CollectionTable,
                WishlistTable, Summary, FilterBar, ManageGroupsPanel, Tutorial
  types/
```

## Export / import (backup)

Since all user data lives in the browser's localStorage/IndexedDB, it's tied to that one browser/device and can be lost (cleared cache, new machine, etc). To guard against that:

- **Export**: a button serializes just the user-generated data (ownership records including condition, wishlist, custom rarity groupings, filter/currency/language/generation settings) to a downloaded JSON file, for example `pokemon-collection-export-YYYY-MM-DD.json`. Re-fetchable data (cached card metadata, cached image blobs, price cache) is excluded to keep the file small and portable.
- **Import**: a file picker reads a previously exported JSON file. Importing shows a confirmation warning that it will overwrite current local data, then fully replaces local state with the imported file's contents (no merge). After import, the card/image/price cache is left as is and will simply be re-validated or re-fetched against the newly-imported ownership/wishlist records as needed. Backup files exported before multi-generation support existed lack a generation field entirely; importing one defaults it to Gen 1 only, since that's all such a file ever covered.
- Both actions live in the app header, alongside a shared confirmation dialog also used by the start screen's import path (below), so there is exactly one reviewed overwrite-confirmation flow rather than two.

## Data-loss protections

- **Unsaved-changes warning**: the app tracks whether the collection (owned cards, wishlist, custom rarity groups) has changed since the last successful export. If so, closing or reloading the browser tab triggers the browser's native "leave site?" confirmation (`beforeunload`). Filter/view preferences (language, currency, active rarity groups, selected generations) don't count toward this, since they're trivially reconfigurable and not irreplaceable collection data. This flag persists across reloads (it's part of the same localStorage-backed state as the collection itself), so it isn't lost to a background-tab discard/restore.
- **Start screen**: on a genuinely first-ever visit (no prior onboarding flag and no existing collection data), the app shows a landing screen offering "Start a New Collection" or "Import a Backup File" before showing the main tabs. This never reappears once dismissed, even over an empty collection. If the onboarding flag is somehow missing while real collection data exists, the app treats that as already onboarded (self-healing the flag) rather than risking the start screen's import path silently overwriting live data.

## Multi-generation support

The app is built to extend beyond Gen 1: a "Generations" multi-select filter in the filter bar controls which National Dex ranges are shown, backed by a small registry (one entry per generation, each just a label and its list of Pokemon) that today contains only the hand-verified Generation 1 (Kanto) entry. Adding a future generation is meant to be a pure data addition to that registry once someone has verified that generation's dex list the same way Gen 1's was verified here; no other part of the app should need to change. New generations are opt-in, not auto-selected, once added: an existing user's filter selection doesn't silently change (and doesn't silently trigger a large new background fetch) just because the registry grew. The app's header and general UI copy are written to be generation-neutral ("Pokemon Card Collector," not "Gen 1 Card Collector") for this reason, even though only Gen 1 is populated at launch.

## CI/CD

- GitHub Actions workflow on push to `main`: install deps, typecheck, lint, test, build.
- Deploy step publishes `dist/` to GitHub Pages via the official `actions/deploy-pages` flow.
- PRs get the build/test/lint checks without deploying.

## Versioning & repo hygiene

- `package.json` semantic version, bumped manually per notable change.
- `CHANGELOG.md` in Keep a Changelog format.
- `LICENSE`: MIT.
- `README.md`: project description, features, live Pages link, local dev instructions.
- Git tag per release matching `package.json` version.

## Open items for implementation planning

- Exact list of rarity strings to pre-seed into each default group, to be enumerated by querying TCGdex live during implementation, since the taxonomy may have entries not yet observed in this design's spot-checks.
- Whether Pages deployment uses a custom domain (default: `froyonator.github.io/Pokemon-Card-Collector-`).
