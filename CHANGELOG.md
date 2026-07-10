# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Renamed the app from "Pokemon Card Collector" to "Collector's Ledger".

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