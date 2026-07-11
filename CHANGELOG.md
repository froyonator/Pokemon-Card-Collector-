# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A "Search" button and an "Upload image" control on the "no image available" placeholder for cards TCGdex has no image for. Search opens a TCGplayer site search for the card in a new tab; an uploaded image is resized and saved into your export/backup file, so it survives across devices.
- Binder view: a page-spread layout of your collection, sized and shaped like a real trading card binder. Supports multiple named binders, each with its own card language (e.g. a Japanese binder alongside an English one), independent grid size and page count, and horizontal or vertical fill order.
- Manual arrange mode in Binder view: drag and drop to reorder Pokemon, or mark a slot "Keep empty" to leave a gap, matching how you've actually organized a physical binder.
- A persistent sidebar holding every Dex Grid control (generation, rarity group, and language filters, view mode, Refresh Data) plus, while Binder view is active, all binder settings — replacing the old top toolbar.
- A "Not Usable" rarity group, off by default, plus a multi-select mode in the picker ("Select cards") to bulk-assign several cards to it at once. Cards in this group are hidden from the picker's available options until you turn the group back on.
- Cards from sets where TCGdex has no Pokedex-number link on record (e.g. Ascended Heroes) are now found by "Show all cards", via a name-based fallback search alongside the usual dex-number lookup.

### Changed

- Renamed the app from "Pokemon Card Collector" to "Collector's Ledger".
- The Dex Grid's "owned" and "no card released yet" tile colors were gold and red, which read as too similar at a glance. Owned is now a distinct green; unavailable is now a neutral grey.
- Fixed the Manage Groups panel rendering behind the Dex Grid instead of on top of it after the sidebar was introduced.

### Removed

- Market price display and currency conversion (the "Refresh Market Prices" action, price columns, and the currency selector). May return in a future release; removed for now to focus on core collection-tracking features.

### Fixed

- A user-uploaded replacement image for a card with no real TCGdex image now shows up in Card view, not just inside the picker.

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