# Gen 1 Card Collector

A web app for tracking a personal collection of Gen 1 (Kanto, #001-151) Pokemon TCG special art and full art cards. Mark which cards you own, keep a wishlist, and see the current market value of your collection.

## Features

- All 151 Gen 1 Pokemon shown in dex order, with sprite and card view modes.
- Click any Pokemon to see every special art or full art card ever printed for it, sourced live from the TCGdex database.
- Mark a card as owned and record its condition for your own reference.
- Star a card to add it to your wishlist. Only one wishlist pick per Pokemon at a time.
- Filter which rarity tiers count as "special art" using editable groups, and choose which card language you collect.
- See market prices in USD, EUR, AUD, GBP, or CAD, with totals for your collection and your wishlist.
- Export your collection to a file and import it back later, so your data is never tied to one browser.
- A guided tutorial walks new users through every feature.

## Live site

https://froyonator.github.io/Pokemon-Card-Collector-/

## Local development

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open the printed local URL in your browser. The app talks to the TCGdex, PokeAPI, and Frankfurter APIs directly from the browser; no backend or API key is needed.

## Scripts

- `npm run dev`: start the local dev server.
- `npm run build`: type check and build the production bundle into `dist/`.
- `npm run preview`: preview the production build locally.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run the TypeScript compiler in check-only mode.
- `npm run test`: run the Vitest test suite.

## Data sources

- [TCGdex](https://tcgdex.dev): card data, images, and pricing.
- [PokeAPI sprites](https://github.com/PokeAPI/sprites): dex grid artwork.
- [Frankfurter](https://frankfurter.dev): currency conversion rates.

## License

A modified MIT license: free to use and modify for noncommercial purposes,
with attribution required on any modified version, and commercial use
requiring a separate agreement. See [LICENSE](LICENSE) for the full terms.