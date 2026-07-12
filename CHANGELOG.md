# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- All nine generations (Kanto through Paldea, dex #1 to #1025) are now selectable, not just Kanto. The generation filter is a true multi-select: pick any combination and the grid shows exactly those Pokemon. Existing collections are unaffected and keep showing Kanto only until you opt in to more.

### Fixed

- Around 2,500 French, German, Spanish, Italian, and Portuguese cards that showed a "no image available" placeholder now display their card art. The artwork of a given print is identical across languages, so these cards now borrow the already-hosted English scan of the exact same card.
- "Refresh Data" was extremely slow for languages already covered by the built-in card database: it always re-fetched every Pokemon from the live source instead of reusing the fast local path the app already uses on startup. Refresh now re-checks the local database first and only falls back to the live source for languages it doesn't cover, matching the speed of the initial load.
- The binder bookshelf had lost its 3D feel: each binder just sat flat instead of leaning toward you as you moved the cursor over it. Volumes now tilt in real 3D following your cursor, easing back to their resting angle when you look away, and still keep their original cover-flip effect on hover. Anyone with reduced motion turned on still gets a simple hover highlight instead of the tilt.
- A binder's uploaded cover picture showed up as a small framed plate instead of covering the whole front of the binder. It now fills the entire cover edge to edge, with the binder name still readable on top thanks to a subtle shading behind the text.

## [0.2.0] - 2026-07-12

### Added

- A self-hosted static card database that loads your collection almost instantly, with full coverage for 12 card languages. Anything not yet in the static set falls back to the live lookup automatically, so nothing goes missing.
- Self-hosted card images alongside the static database, with a graceful fallback to the live image source if a hosted image is ever missing.
- A "Standard prints" rarity group, making base-rarity cards viewable for languages that previously had no viewable group at all: both Chinese variants, Thai, Indonesian, and Korean. Existing settings are migrated automatically, no action needed on your part.
- A major expansion of the Japanese and Traditional Chinese card databases (roughly 1,565 to 3,831 and 432 to 1,811 Gen 1 cards respectively), with card images sourced from official catalogs.
- Binder view: a page-spread layout of your collection, sized and shaped like a real trading card binder. Supports multiple named binders, each with its own card language (e.g. a Japanese binder alongside an English one), independent grid size and page count, and horizontal or vertical fill order.
- A binder bookshelf home screen with 3D binder covers you can customize (color, spine, and a picture), plus one-click creation of new binders.
- Real page-flip physics in Binder view: pages turn on a spine hinge like a real binder, and a lone trailing page now displays alone instead of pairing awkwardly with a blank.
- A page scrubber and jump-to-page control for quickly navigating long binders.
- Manual arrange mode in Binder view: drag and drop to reorder Pokemon, mark a slot "Keep empty" to leave a gap, or give an empty slot its own custom filler image, matching how you've actually organized a physical binder.
- Click to enlarge any owned card in Card view or the picker, with a subtle glint, sheen, and parallax shadow effect, plus a caption.
- A corner dock consolidating export, import, the repo link, and the tutorial into one tidy control cluster.
- A "Search" button and an "Upload image" control on the "no image available" placeholder for cards with no image on record. Search opens a card marketplace search for the card in a new tab; an uploaded image is resized and saved into your export/backup file, so it survives across devices.
- A "Not Usable" rarity group, off by default, plus a multi-select mode in the picker ("Select cards") to bulk-assign several cards to it at once. Cards in this group are hidden from the picker's available options until you turn the group back on.
- Cards from sets with no Pokedex-number link on record (e.g. Ascended Heroes) are now found by "Show all cards", via a name-based fallback search alongside the usual dex-number lookup.

### Changed

- A full visual redesign: one dark "collector's study" theme in place of the earlier light/dark split, with new typography and card-stock textures throughout.
- The sidebar was redesigned with labelled tabs, chip-style filters, a true icon-only collapsed rail, no more internal scrollbar, and Binder settings folded in alongside everything else.
- Renamed the app from "Pokemon Card Collector" to "Collector's Ledger".
- The Dex Grid's "owned" and "no card released yet" tile colors were gold and red, which read as too similar at a glance. Owned is now a distinct green; unavailable is now a neutral grey.

### Removed

- Market price display and currency conversion (the "Refresh Market Prices" action, price columns, and the currency selector). May return in a future release; removed for now to focus on core collection-tracking features.

### Fixed

- Zoom in Binder view and the card enlarge overlay is now contained to the card itself, Escape resets it, and the maximum zoom level is more sensible.
- Dropdown menus and tile-state colors now have enough contrast to read clearly in every case.
- The per-tile loading flash during Refresh Data is back, now a small Poke Ball animation that catches its tile's color.
- Fixed the Manage Groups panel rendering behind the Dex Grid instead of on top of it after the sidebar was introduced.
- A user-uploaded replacement image for a card with no other image now shows up in Card view, not just inside the picker.
- Sixteen smaller reliability fixes: binders with corrupted or invalid settings no longer crash the app, Refresh Data no longer silently drops cards you own or wishlist that fall outside the current catalog, your saved collection is now protected with a backup copy if it's ever found corrupted, a language change mid-search in the picker can no longer show the wrong results, and general performance tuning cuts unnecessary re-rendering across the grid and binder.

## [0.1.0] - 2026-07-11

### Added

- All 151 Gen 1 Pokemon shown in dex order, with sprite view and card view modes, sourced from PokeAPI sprites and TCGdex card data.
- A picker showing every special art and full art card for a Pokemon, filtered by editable rarity groups and by card language.
- Ownership tracking with a recorded condition for each card, and a wishlist limited to one card per Pokemon.
- My Collection, Wishlist, and Summary tabs with sorting and market value totals in USD, EUR, AUD, GBP, or CAD.
- Manual "Refresh Data" and "Refresh Market Prices" actions, backed by card and pricing caches so the app keeps working from cache when the network is unavailable.
- Export and import of your collection, wishlist, groups, and settings as a JSON backup file.
- A guided onboarding tutorial covering every major feature.
- A close and reload warning when you have unsaved collection changes since your last export.
- A start screen on first visit offering "Start a New Collection" or "Import a Backup File."
- Multi-generation support with a Generations filter. Only Gen 1 (Kanto) is populated today, but the data model is built to extend to future generations as pure data additions.
- A "Show all cards" toggle in the picker, letting you browse every card ever printed for a Pokemon instead of only the ones matching your curated rarity groups.
- A per-card classification control, letting you manually assign any specific card into one of your rarity groups. This is most useful for promos, since TCGdex does not distinguish full art promos from plain ones in its own data.
- A real visual design pass, with Framer Motion animations, a custom color palette and typography, light and dark mode support, and reduced motion support for users who prefer it.
- Continuous integration and automatic deployment to GitHub Pages.