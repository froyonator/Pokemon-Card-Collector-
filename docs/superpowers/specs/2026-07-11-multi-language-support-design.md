# Multi-Select Language Support: Design

**Status:** Approved
**Date:** 2026-07-11

## Problem

The app currently supports exactly one active card language at a time (a single `language: string` in the store, defaulting to English). A user building parallel collections across languages, for example a Japanese collection and a Chinese collection at once, cannot see cards from both without repeatedly switching the language dropdown and losing sight of the other language's options.

## Confirmed technical fact

Card ids are entirely independent per language. Querying TCGdex confirms Japanese Charizard cards use ids like `M2-013`, `S12a-015`, structurally unrelated to English ids like `sv03.5-199`; the English id does not even resolve under the Japanese language path (404). Regions release different sets on different schedules with different set codes, so there is no id collision risk when combining results from multiple languages, and no shared "same card, different language" record to reconcile. Each language is effectively an independent print catalog for a given Pokemon.

## Confirmed scope decision

Ownership stays exactly as it is today: one owned card per Pokemon overall, not tracked per language. The language selector controls what is browsable and fetched, not a second ownership dimension. A user who wants genuinely separate collections per language uses separate projects (via export/import's existing "start a new collection" flow), not this feature. This significantly simplifies the design: `owned`/`wishlist` records do not need a language field.

## Design

- `language: string` becomes `selectedLanguages: string[]`, defaulting to `['en']`. A `toggleLanguage(code)` store action, mirroring `toggleActiveGroup`/`toggleGeneration`.
- The filter bar's language control changes from a single `<select>` dropdown to a multi-select checkbox fieldset, matching the existing Rarity Groups and Generations checkbox pattern (not a native `<select multiple>`, which would be inconsistent with the rest of the filter bar and worse to use).
- Deselecting every language is allowed (consistent with how deselecting every generation is already handled) and shows an equivalent "select at least one language" empty state in the Dex Grid, rather than being blocked outright.
- Fetching and caching stay per-language, exactly as today (cache key `language:dexNumber` is unchanged). The orchestration layer (the Dex Grid's auto-load effect, its "Refresh Data" handler, and the picker's "Show all cards" fetch) loops over every selected language instead of a single one, and merges the resulting cards per dex number. Since ids never collide across languages, this merge is a plain concatenation, not a conflict-resolution merge like the one "Show all cards" already has for curated-versus-full-history within a single language.
- The Collection, Wishlist, and Summary tabs must keep resolving an owned or wishlisted card's metadata (image, set name, rarity) correctly even if the user later deselects the language that card happened to be fetched under, consistent with the existing principle that these tabs always show the user's actual saved records regardless of current filter state. This needs a new lookup that searches every language ever cached for a dex number, not only the currently selected ones.
- Export and import: `selectedLanguages: string[]` replaces `language: string` in the exported/imported user data shape. A backup file from before this feature (a single `language` string, no `selectedLanguages` array) is defaulted to `[oldValue]` on import, or `['en']` if even the old field is somehow missing, following the same backward-compatibility precedent already used for `selectedGenerations` and `cardOverrides`.

## Non-goals

- Per-language ownership tracking. Explicitly ruled out; a second project covers that use case.
- Any change to how a single language's own data is fetched, cached, or displayed. This is purely about allowing more than one language to be active at once.

## Scope note

This touches the store, the filter bar, the Dex Grid's fetch orchestration, the picker's "Show all cards" fetch, the Collection/Wishlist/Summary lookup logic, and export/import, plus every test fixture across the codebase that currently seeds a single `language: 'en'` into the store (a wide, mostly mechanical rename, not a redesign of those tests). Comparable in size to the show-all-cards and promo-classification feature.
