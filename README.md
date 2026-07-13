# Collector's Ledger

A binder-first web app for tracking a physical Pokémon TCG collection. Pick the Pokémon you collect, choose the exact printing you own, and page through your collection in a binder that looks and turns like the real thing.

**Live app:** https://froyonator.github.io/Pokemon-Card-Collector-/

## About

Collector's Ledger is built around how card collectors actually think: one slot per Pokémon (or form), one chosen card per slot, arranged in binders. It runs entirely in the browser with no backend and no account. Your collection lives on your device and travels with you through export files.

The app ships with a built-in card database covering more than 100,000 physical TCG cards across twelve languages (English, Japanese, French, German, Spanish, Italian, Portuguese, Traditional and Simplified Chinese, Thai, Indonesian, and Korean), with card images included. Covered languages load instantly with zero live lookups; anything outside the built-in set falls back to a live source automatically. Digital-only card games are excluded by design: if it exists in the ledger, it exists in print.

## Features

### The dex grid

- Every generation, Kanto through Paldea (National Dex #1 to #1025), with a true multi-select generation filter.
- Form tabs alongside the generations: Mega Evolution (all 96 forms, X/Y/Z variants tracked separately), VMAX (all 81 forms, wearing Gigantamax artwork where those forms exist), and the Alolan, Galarian, Hisuian, and Paldean regional families. Each form has its own tile, its own sprite, and its own card pool: a Mega Charizard X tile offers only Mega Charizard X prints, an Alolan Vulpix tile only Alolan Vulpix prints, and the regular Vulpix tile shows no regional cards at all.
- Animated sprites, self-hosted: a Pokémon you can still hunt shows a lively animated sprite, one you own shows the same animation heavily greyed, and one with no released cards shows a plain still. Systems with reduced motion get still art everywhere.

### Cards

- Click any Pokémon to browse its printings, filtered through editable rarity groups, including cross-cutting groups that collect every Mega or every VMAX print regardless of rarity.
- Selecting the Mega or VMAX tab switches the active card group to match, and switches back when you leave, unless you chose your own groups meanwhile.
- Enlarging a card plays a full flip that grows into place, shows a card back mid-turn, and flips back down when dismissed. The enlarged view opens instantly on the grid thumbnail and upgrades to full resolution as it loads.
- Cards without an image on record offer a marketplace search shortcut and a custom image upload that survives export and import.

### Binders

- A bookshelf home screen of 3D binder volumes that lean with your cursor, each with a customizable cover color, spine text, and a full-bleed cover picture.
- Real page-flip physics on a spine hinge, a page scrubber, and jump-to-page controls.
- Manual arrange mode: drag and drop to reorder, keep slots intentionally empty, or give a slot its own filler image, matching a physical binder exactly.
- Per-binder card language, grid size, page count, and fill order. Create as many binders as you like and delete the ones you no longer need.

### Your data

- Ownership, wishlist (one pick per Pokémon), and binder layouts persist locally.
- One-file export and import moves everything between browsers and devices.
- A guided tutorial covers every feature.

## Local development

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open the printed local URL. No backend or API key is needed.

### Scripts

- `npm run dev`: start the local dev server.
- `npm run build`: type check and build the production bundle into `dist/`.
- `npm run preview`: preview the production build locally.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run the TypeScript compiler in check-only mode.
- `npm run test`: run the Vitest test suite.

The data pipeline that produces the built-in database lives in `scripts/carddata` as its own package with its own test suite.

## Built with

React 18, TypeScript, Vite, Zustand, framer-motion, and Vitest, deployed to GitHub Pages by CI on every push to `main`.

## Credits

- [TCGdex](https://tcgdex.dev): live card lookup API.
- [PokeAPI sprites](https://github.com/PokeAPI/sprites): dex artwork.

Pokémon and Pokémon character names are trademarks of Nintendo. This is a fan-made tool, unaffiliated with Nintendo, The Pokémon Company, or Creatures Inc.

## License

A modified MIT license: free to use and modify for noncommercial purposes,
with attribution required on any modified version, and commercial use
requiring a separate agreement. See [LICENSE](LICENSE) for the full terms.
