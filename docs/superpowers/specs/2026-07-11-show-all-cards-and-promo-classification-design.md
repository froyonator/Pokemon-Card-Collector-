# Show All Cards and Promo Classification: Design

**Status:** Approved
**Date:** 2026-07-11

## Problem

Two related gaps were found during manual QA of the shipped app:

1. The app only ever fetches cards matching the currently curated rarity groups (one TCGdex query per curated rarity tier per Pokemon). Any card whose rarity is not in the curated list is never downloaded at all, not just hidden. TCGdex tags every promo card with the single generic rarity string `"Promo"`, regardless of how the card actually looks, so promo cards are invisible today no matter how special they are. Confirmed live: Charmander's SVP-044 (Obsidian Flames ETB Promo) never appears anywhere in the app, even though it is a genuine full-bleed illustration card.
2. Not everyone collecting with this app only wants full art or special art cards. There is currently no way to see the complete print history of a Pokemon, or to browse cards outside the curated groups at all.

A third finding surfaced while investigating: there is no reliable, machine-checkable signal (rarity string, card stage, name pattern) that predicts whether a specific promo card is drawn in full-bleed illustration style. A visual check of SVP-044 Charmander (a plain Basic-stage Pokemon, no V/VMAX/ex/GX suffix) confirmed it is genuinely full art, which rules out any stage- or name-based heuristic. The only reliable way to know is to look at the card.

## Goals

- Every card TCGdex has for a Pokemon should be reachable somewhere in the app, promos included.
- Users who don't collect only full art/special art should be able to browse everything.
- Users should be able to permanently classify a specific card (most usefully a promo) into one of their rarity groups, so it behaves like any other curated card from then on: it counts toward tile availability, shows under normal filtering, and survives export/import.
- No attempt at automatic full-art detection for promos. The investigation confirmed this cannot be done reliably from available metadata; building a heuristic would trade one wrong-cards bug for a different, less predictable one.

## Design

### 1. "Show all cards" toggle (per Pokemon, in the picker)

- A toggle inside each Pokemon's picker, defaulting off. The curated view (today's behavior) is shown first.
- Toggling it on fetches, on first use only, the complete card list for that dex number from TCGdex with no rarity filter, then a detail lookup per card (the list endpoint does not include rarity, so a per-card detail call is needed to show a rarity label). Results are cached from then on; the toggle does not refetch on every open once cached.
- This is a real one-time wait for Pokemon with a long print history (Charizard has 122 printed cards, meaning 122 detail requests the first time). A loading state is shown during this fetch.
- Every card, in both curated and "show all" view, displays its rarity/set label so the user can see what tier and type it actually is.
- The main Dex Grid's tile coloring (available/owned/unavailable) is unaffected by this toggle. It only changes what a given Pokemon's picker offers once opened. (Tile coloring is affected by rarity groups and, per below, by manual card classification, not by this toggle.)
- Pokemon TCG Pocket cards remain excluded in "show all" mode, consistent with their exclusion everywhere else in the app (different game, not tracked here).
- Existing ownership/wishlist mechanics work identically on any card shown, curated or not.

### 2. Per-card manual classification (override)

- Any card can be manually assigned to one of the user's rarity groups, independent of its raw TCGdex `rarity` string. This is the mechanism that actually solves "promos that are full art should show up when I filter by Full Art": since there's no automatic way to detect this, the user (who can see the artwork) makes the call once per card, and the app remembers it.
- Stored as a new piece of user data: a map from card ID to group ID (`cardOverrides: Record<string, string>`), alongside `owned`/`wishlist`/`groups` in the existing Zustand store. Persisted the same way, included in export/import, validated the same way (shape-checked on import, following the precedent already established for `groups`/`owned`/`wishlist`).
- UI: a small classification control per card in the picker (both curated and "show all" views), letting the user pick a group or clear back to "use the card's own rarity." Implemented as a plain `<select>` per card for accessibility and testability, not a custom menu.
- A card with an override is treated as matching whichever group the override points to, for every purpose an ordinarily-curated card is used for: it counts toward that Pokemon's tile availability/coloring on the main grid, it shows up under the picker's curated (non-"show all") view whenever that group is active, and it round-trips through export/import.
- Clearing an override returns the card to being governed purely by its raw rarity string, same as before this feature existed.

### 3. Seed data

A small number of promo cards will be hand-verified by directly viewing their artwork and pre-populated as known full-art examples, so the classification mechanism ships with real, correct data rather than starting completely empty (Charmander SVP-044 is the first, already confirmed). This is explicitly a starting point, not an attempt at completeness, given the sheer number of promos across 151 Pokemon's history makes exhaustive manual review impractical to do in one pass.

## Non-goals

- Automatic/heuristic full-art detection for promos or any other under-classified card. Confirmed unreliable; not attempted.
- Exhaustive manual classification of every promo card that exists. The override mechanism is the durable answer; a full one-time audit of every promo is future work, not part of this change.
- Changing what counts as "available" for tile coloring purposes beyond what's described above (curated rarity groups plus manual overrides). "Show all cards" itself never changes tile coloring.

## Technical notes

- `src/state/selectors.ts`'s `availableCardsForDex` (and its callers, `DexGrid.tsx` and `Summary.tsx`) need to also accept the override map and active group ids, so a card can match via either its rarity string or a manual override into an active group.
- `src/api/tcgdex.ts` needs a new function to fetch a dex number's complete card list with no rarity filter (the existing `fetchCardsForDexAndRarity` always requires a rarity parameter).
- `src/storage/cardCache.ts`'s cache shape does not need to change; "all cards for a dex number" cards are stored the same way as curated ones, just fetched via a different query and, since the list endpoint omits rarity, backfilled with per-card detail lookups.
- Export/import: `ExportedUserData`/`ExportableState` (`src/state/store.ts`, `src/state/exportImport.ts`) gain a `cardOverrides` field, validated on import the same way `groups`/`owned`/`wishlist` already are.
