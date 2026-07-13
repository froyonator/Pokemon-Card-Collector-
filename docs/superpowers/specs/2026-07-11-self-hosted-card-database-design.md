# Self-Hosted Card Database Design

## Goal

Replace the app's current live-API-only card data (fetched from `api.tcgdex.net` on every session) with a bulk-harvested, self-hosted dataset — text/metadata plus images — covering every Pokémon generation and every language the app supports, hosted on GitHub instead of hit live. This removes the ~1,300+ request bulk auto-load the app currently does on every fresh install/refresh, decouples the app from TCGdex's uptime and rate-limit posture, and lets us curate richer per-card data (attacks, illustrator, variants, Pokédex links) than the live API currently exposes.

Not in scope for this spec: the binder-view redesign (separate spec), or the print-size image export feature (explicitly deferred by the user to a later date).

## Source decision

**Primary source: the reference catalog.** Of the three third-party sites investigated (pokedata.io, the reference catalog, and the official Pokémon Company galleries), the reference catalog has the richest per-card data and the best-curated images:

- Full card text: name, HP, supertype/stage, attacks (cost/damage/text), weakness, resistance, retreat cost, expansion, card number, rarity, illustrator, Pokédex number, competitive format, regulation mark.
- Variant modeling as distinct sub-entities with their own images: reverse holo, 1st edition, alt art, jumbo.
- Regions live today: International, Japan, China, Indonesia (Korea, Thailand, and Taiwan/Hong Kong are modeled in their schema but not yet populated).
- Images are already aggregated by the reference catalog's own maintainers from a mix of official Pokémon Card scans and top community contributors (Malie, the fallback source, Pokumon) — better curated than pulling from any single upstream ourselves.

**Known engineering wrinkle:** the reference catalog returned HTTP 403 to plain non-interactive HTTP fetches during research (Cloudflare-style bot detection). The harvester needs to drive a real headless browser (e.g. Playwright) rather than simple HTTP requests. Their `robots.txt` blocks `/api/` and paginated query patterns (`?page=`/`&page=`) on the global card search, but does **not** block individual set pages (`/sets/{id}/{slug}`) or card detail pages (`/cards/{id}/{slug}`) — and a set's card list renders unpaginated on one page, so the crawl unit is **one page fetch per set**, followed by **one page fetch per card** for full per-card detail. Even without treating their ToS's "personal projects will not be approved" API restriction as a hard blocker, the harvester should still be a well-behaved crawler technically: bounded concurrency, a real user-agent, and delays between requests — both because aggressive harvesting risks the crawling IP getting blocked regardless of the legal question, and because it's the same "don't be a jerk to a real server" discipline the app's own live-API code already follows (see `mapWithConcurrency` in `src/state/concurrency.ts`).

**Secondary/reference source: `tcgdex/cards-database`** (github.com/tcgdex, MIT-licensed). Not used for bulk ingestion into the primary dataset, but worth keeping as a cross-check during the AI QC pass (§5) for cards where the reference catalog's own data looks incomplete or inconsistent, since it's a second, independently-assembled dataset covering much of the same card population.

**Fallback for anything the primary dataset doesn't cover**: the app's existing live `api.tcgdex.net` calls plus the existing user-upload-image fallback stay exactly as they are today, unchanged, for any card/language/set the self-hosted dataset is missing. This is not a temporary stopgap — for languages with genuinely sparse upstream data (e.g. Korean, where no real official per-card image database currently exists at all), this is the permanent, correct behavior.

## Data-integrity principle

The user's explicit #1 priority: never let a card's image and its metadata get mismatched.

**Rule: one card record's image and metadata always come from the same page fetch.** The harvester never assembles a record by pairing an image pulled from one place with text pulled from another. the reference catalog's own card detail pages already bundle both together — the harvester reads both off that one fetched page and writes them as one atomic record. This holds regardless of which site is the source; it is an engineering discipline, not a legal one, and is unaffected by the ToS discussion above.

Beyond that:

1. **Snapshot, don't stream.** Each full harvest run is a versioned, immutable snapshot (e.g. a dated folder or tagged release), not an in-place mutation of the live dataset. A bad run gets rolled back to the previous snapshot rather than patched live.
2. **Validate every image fetch beyond HTTP status.** Reject anything under a sane byte-size floor, confirm content-type, and sanity-check decoded pixel dimensions.
3. **Hash every image at ingest** (SHA-256), stored alongside its record, so a future re-sync can detect unexpected changes to a previously-fetched image rather than silently overwriting it.
4. **Stratified spot-check sampling on every sync**, feeding into the AI QC pass below — random cards spread across sets, eras, languages, and rarities, not just the newest additions.

## Data model: Language → Set → Card

Matches the user's requested structure. Per language, per set, one record per card, carrying (at minimum) every field the current `CardRecord` type already needs (`id`, `name`, `dexNumber`, `setId`, `setName`, `localId`, `rarity`, `imageBase`, `language`) plus the richer the reference catalog-sourced fields worth keeping for future filtering/search: attack text, HP, stage, weakness/resistance/retreat, illustrator, Pokédex number, variant list. Exact file layout (one JSON per set vs. one JSON per language vs. a flat indexed store) is an implementation-plan decision, not a design decision — driven by whatever keeps the app's initial load fast without needing to parse a single enormous blob.

Full generation/dex scope: the harvest is not limited to Gen 1 — every set, every card, every one of the reference catalog's live regions, so future generation support only requires updating the app's own `dexEntries`/`generations` data, not another harvest.

## Storage architecture

- **The app's own repo** (the one GitHub Pages actually builds and deploys) stays small: code plus, at most, lightweight per-card JSON metadata. Never image binaries. This keeps GitHub Pages' ~1GB published-site cap irrelevant.
- **Images live in a separate, plain (non-Pages) GitHub repo**, organized by a stable path scheme (language/set/localId/variant), served through jsDelivr's GitHub CDN (`cdn.jsdelivr.net/gh/<user>/<repo>@<ref>/<path>`) rather than through GitHub Pages. No Git LFS — jsDelivr reads git blobs directly and LFS pointers would break that.
- The app constructs image URLs from a card's own id fields exactly the way it constructs `assets.tcgdex.net` URLs today — no giant bundled blob, no per-language zip, just per-card lazy fetches against the CDN.
- Open item, not yet researched: jsDelivr's own bandwidth/size/caching terms should be checked before finalizing on it as the CDN layer.

## AI QC pass

Per the user's own proposed workflow: the harvesting and data-assembly tooling itself should be offline/non-AI (deterministic, scriptable, re-runnable). A separate AI-agent pass then reviews a stratified random sample of the finished dataset each sync, shown the (image, metadata) pair together, and judged on whether the artwork plausibly matches the claimed Pokémon/set/rarity/card layout — this is a vision-based plausibility check, not a re-derivation of truth. Anything flagged routes to manual review before shipping; confirmed-bad records get logged so a future re-sync can be checked against that list instead of re-flagging the same known issue every time.

## Open risks / questions carried into the implementation plan

1. jsDelivr's own terms/limits — not yet researched.
2. Re-sync cadence (one-time snapshot vs. a periodic rebuild, e.g. a scheduled GitHub Action) — needs a decision before the tooling is built, since the snapshot/versioning approach above should support whichever is chosen.
3. Exact file-layout granularity for the metadata JSON (per-set vs. per-language vs. indexed) — implementation-plan decision.
4. Whether to bother bundling regions the reference catalog hasn't populated yet (Korea, Thailand, Taiwan/Hong Kong) at all, or leave them entirely on the live-API fallback until the reference catalog's own coverage improves.
