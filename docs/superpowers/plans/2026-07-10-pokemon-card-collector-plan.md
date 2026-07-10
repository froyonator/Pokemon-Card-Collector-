# Gen 1 Special/Full Art Card Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a React/TypeScript web app that tracks ownership of Gen 1 Pokemon TCG special-art and full-art cards, with a wishlist, market pricing, and a guided tutorial, live on GitHub Pages.

**Architecture:** Vite + React + TypeScript SPA. Pure logic (data, API clients, storage, state) is unit tested with Vitest. UI components are built on top of that logic and manually verified in a browser. Zustand holds and persists user data (ownership, wishlist, groups, settings) to localStorage; a separate localStorage cache holds re-fetchable card/pricing data; IndexedDB caches image blobs. GitHub Actions builds and deploys to GitHub Pages on push to `main`.

**Tech Stack:** React 18, TypeScript, Vite, Zustand, Framer Motion, react-joyride, Vitest, @testing-library/react, fake-indexeddb, ESLint, Prettier.

**Repo:** https://github.com/froyonator/Pokemon-Card-Collector- (local working copy: `C:\dev\card collector`, already cloned and tracking `main`)

---

## Before you start

This repo requires the `froyonator` GitHub account (the default active `gh` account only has read access). Every task that pushes must first confirm this.

- [ ] **Step 1: Confirm environment**

Run:
```bash
cd "C:/dev/card collector"
gh auth switch --user froyonator
git config user.name
git config user.email
git remote -v
```
Expected: `git config user.name` prints `froyonator`, `git config user.email` prints `276264696+froyonator@users.noreply.github.com`, and `git remote -v` shows `origin` pointing at `https://github.com/froyonator/Pokemon-Card-Collector-`. If the git config values are missing (for example because this plan is being executed from a fresh clone or worktree), set them:

```bash
git config user.name "froyonator"
git config user.email "276264696+froyonator@users.noreply.github.com"
```

---

## Task 1: Scaffold the Vite + React + TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "pokemon-card-collector",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "framer-motion": "^12.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-joyride": "^2.9.3",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "@vitejs/plugin-react": "^4.3.2",
    "eslint": "^9.12.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.12",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "prettier": "^3.3.3",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: Write `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `vite.config.ts`**

> **Note added after Task 14 shipped:** the `test.css.modules.classNameStrategy: 'non-scoped'` line below was not part of the original scaffold; it was added when Task 14's test (`toHaveClass('tile--unavailable')`) failed against Vitest's default hashed/scoped CSS Modules class names (e.g. `_tile--unavailable_542b3e` instead of the literal `tile--unavailable`). It's included here now so a from-scratch execution of this plan doesn't hit the same failure. It only affects how class names resolve under Vitest; `vite build` still hashes/scopes class names normally in production (verified). Because it disables per-file scoping in tests, two `*.module.css` files that reuse the same class name (several already do later in this plan, e.g. `.overlay`/`.panel`/`.header` in both `Picker.module.css` and `ManageGroupsPanel.module.css`) will produce identical literal class strings under test. This is fine as long as tests keep querying by role/text/label first and only checking `.toHaveClass(...)` on an already-uniquely-resolved element (the pattern every test in this plan uses); avoid adding class-selector-based DOM queries (`querySelector('.foo')`, `getComputedStyle`, etc.) to future tests, since those could become ambiguous.

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Pokemon-Card-Collector-/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gen 1 Card Collector</title>
    <meta name="description" content="Track your collection of Gen 1 Pokemon special art and full art trading cards." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 9: Write a placeholder `src/App.tsx`**

```tsx
export default function App() {
  return (
    <main>
      <h1>Gen 1 Card Collector</h1>
    </main>
  );
}
```

- [ ] **Step 10: Write a placeholder `src/styles/global.css`**

```css
:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 11: Update `.gitignore`**

Add these lines to the existing `.gitignore` (created during brainstorming):

```
node_modules/
dist/
.superpowers/
*.log
.DS_Store
```

(These lines already exist from the design phase; confirm the file still contains them and skip re-adding duplicates.)

- [ ] **Step 12: Install dependencies**

Run:
```bash
cd "C:/dev/card collector"
npm install
```
Expected: installs succeed and create `package-lock.json` and `node_modules/`.

- [ ] **Step 13: Verify the dev server starts**

Run:
```bash
npx vite --port 5183 &
sleep 3
curl -s http://localhost:5183 | grep -o "<title>.*</title>"
kill %1
```
Expected: prints `<title>Gen 1 Card Collector</title>`.

- [ ] **Step 14: Commit**

```bash
git add package.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html src/main.tsx src/App.tsx src/vite-env.d.ts src/styles/global.css .gitignore package-lock.json
git commit -m "Scaffold Vite + React + TypeScript project"
```

---

## Task 2: Lint, format, and test tooling

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `src/test/setup.ts`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  }
);
```

Note: `eslint.config.js` uses `@eslint/js` and `typescript-eslint`, which are not yet in `package.json`. Add them:

```bash
npm install --save-dev @eslint/js typescript-eslint
```

- [ ] **Step 2: Write `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

- [ ] **Step 3: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

- [ ] **Step 4: Write `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /gen 1 card collector/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test suite**

Run:
```bash
npm run test
```
Expected: `1 passed` (the App render test).

- [ ] **Step 6: Run lint and typecheck**

Run:
```bash
npm run lint
npm run typecheck
```
Expected: both exit with no errors.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc.json src/test/setup.ts src/App.test.tsx package.json package-lock.json
git commit -m "Add lint, format, and test tooling"
```

---

## Task 3: License, changelog, and README skeleton

**Files:**
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Write `LICENSE`**

```
MIT License

Copyright (c) 2026 froyonator

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffold with Vite, React, and TypeScript.
```

- [ ] **Step 3: Write `README.md`**

```markdown
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

MIT. See [LICENSE](LICENSE).
```

- [ ] **Step 4: Commit**

```bash
git add LICENSE CHANGELOG.md README.md
git commit -m "Add MIT license, changelog, and README"
```

---

## Task 4: Core types and the Gen 1 dex list

**Files:**
- Create: `src/types/index.ts`
- Create: `src/data/gen1Dex.ts`
- Test: `src/data/gen1Dex.test.ts`

- [ ] **Step 1: Write `src/types/index.ts`**

```ts
export type RarityTier = string;

export interface CardRecord {
  id: string;
  name: string;
  dexNumber: number;
  setId: string;
  setName: string;
  localId: string;
  rarity: RarityTier;
  imageBase: string;
  language: string;
}

export interface CardPricing {
  cardId: string;
  cardmarketEurAvg: number | null;
  tcgplayerUsdMarket: number | null;
  fetchedAt: string;
}

export type Condition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

export const CONDITIONS: Condition[] = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

export interface OwnedRecord {
  dexNumber: number;
  cardId: string;
  condition: Condition;
  addedAt: string;
}

export interface WishlistRecord {
  dexNumber: number;
  cardId: string;
  addedAt: string;
}

export interface RarityGroup {
  id: string;
  name: string;
  rarities: RarityTier[];
}

export type Currency = 'USD' | 'EUR' | 'AUD' | 'GBP' | 'CAD';

export const CURRENCIES: Currency[] = ['USD', 'EUR', 'AUD', 'GBP', 'CAD'];

export interface Language {
  code: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-tw', label: 'Chinese (Traditional)' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'id', label: 'Indonesian' },
  { code: 'th', label: 'Thai' },
];
```

- [ ] **Step 2: Write `src/data/gen1Dex.ts`**

```ts
export interface DexEntry {
  number: number;
  name: string;
}

export const GEN1_DEX: DexEntry[] = [
  { number: 1, name: 'Bulbasaur' },
  { number: 2, name: 'Ivysaur' },
  { number: 3, name: 'Venusaur' },
  { number: 4, name: 'Charmander' },
  { number: 5, name: 'Charmeleon' },
  { number: 6, name: 'Charizard' },
  { number: 7, name: 'Squirtle' },
  { number: 8, name: 'Wartortle' },
  { number: 9, name: 'Blastoise' },
  { number: 10, name: 'Caterpie' },
  { number: 11, name: 'Metapod' },
  { number: 12, name: 'Butterfree' },
  { number: 13, name: 'Weedle' },
  { number: 14, name: 'Kakuna' },
  { number: 15, name: 'Beedrill' },
  { number: 16, name: 'Pidgey' },
  { number: 17, name: 'Pidgeotto' },
  { number: 18, name: 'Pidgeot' },
  { number: 19, name: 'Rattata' },
  { number: 20, name: 'Raticate' },
  { number: 21, name: 'Spearow' },
  { number: 22, name: 'Fearow' },
  { number: 23, name: 'Ekans' },
  { number: 24, name: 'Arbok' },
  { number: 25, name: 'Pikachu' },
  { number: 26, name: 'Raichu' },
  { number: 27, name: 'Sandshrew' },
  { number: 28, name: 'Sandslash' },
  { number: 29, name: 'Nidoran-F' },
  { number: 30, name: 'Nidorina' },
  { number: 31, name: 'Nidoqueen' },
  { number: 32, name: 'Nidoran-M' },
  { number: 33, name: 'Nidorino' },
  { number: 34, name: 'Nidoking' },
  { number: 35, name: 'Clefairy' },
  { number: 36, name: 'Clefable' },
  { number: 37, name: 'Vulpix' },
  { number: 38, name: 'Ninetales' },
  { number: 39, name: 'Jigglypuff' },
  { number: 40, name: 'Wigglytuff' },
  { number: 41, name: 'Zubat' },
  { number: 42, name: 'Golbat' },
  { number: 43, name: 'Oddish' },
  { number: 44, name: 'Gloom' },
  { number: 45, name: 'Vileplume' },
  { number: 46, name: 'Paras' },
  { number: 47, name: 'Parasect' },
  { number: 48, name: 'Venonat' },
  { number: 49, name: 'Venomoth' },
  { number: 50, name: 'Diglett' },
  { number: 51, name: 'Dugtrio' },
  { number: 52, name: 'Meowth' },
  { number: 53, name: 'Persian' },
  { number: 54, name: 'Psyduck' },
  { number: 55, name: 'Golduck' },
  { number: 56, name: 'Mankey' },
  { number: 57, name: 'Primeape' },
  { number: 58, name: 'Growlithe' },
  { number: 59, name: 'Arcanine' },
  { number: 60, name: 'Poliwag' },
  { number: 61, name: 'Poliwhirl' },
  { number: 62, name: 'Poliwrath' },
  { number: 63, name: 'Abra' },
  { number: 64, name: 'Kadabra' },
  { number: 65, name: 'Alakazam' },
  { number: 66, name: 'Machop' },
  { number: 67, name: 'Machoke' },
  { number: 68, name: 'Machamp' },
  { number: 69, name: 'Bellsprout' },
  { number: 70, name: 'Weepinbell' },
  { number: 71, name: 'Victreebel' },
  { number: 72, name: 'Tentacool' },
  { number: 73, name: 'Tentacruel' },
  { number: 74, name: 'Geodude' },
  { number: 75, name: 'Graveler' },
  { number: 76, name: 'Golem' },
  { number: 77, name: 'Ponyta' },
  { number: 78, name: 'Rapidash' },
  { number: 79, name: 'Slowpoke' },
  { number: 80, name: 'Slowbro' },
  { number: 81, name: 'Magnemite' },
  { number: 82, name: 'Magneton' },
  { number: 83, name: "Farfetch'd" },
  { number: 84, name: 'Doduo' },
  { number: 85, name: 'Dodrio' },
  { number: 86, name: 'Seel' },
  { number: 87, name: 'Dewgong' },
  { number: 88, name: 'Grimer' },
  { number: 89, name: 'Muk' },
  { number: 90, name: 'Shellder' },
  { number: 91, name: 'Cloyster' },
  { number: 92, name: 'Gastly' },
  { number: 93, name: 'Haunter' },
  { number: 94, name: 'Gengar' },
  { number: 95, name: 'Onix' },
  { number: 96, name: 'Drowzee' },
  { number: 97, name: 'Hypno' },
  { number: 98, name: 'Krabby' },
  { number: 99, name: 'Kingler' },
  { number: 100, name: 'Voltorb' },
  { number: 101, name: 'Electrode' },
  { number: 102, name: 'Exeggcute' },
  { number: 103, name: 'Exeggutor' },
  { number: 104, name: 'Cubone' },
  { number: 105, name: 'Marowak' },
  { number: 106, name: 'Hitmonlee' },
  { number: 107, name: 'Hitmonchan' },
  { number: 108, name: 'Lickitung' },
  { number: 109, name: 'Koffing' },
  { number: 110, name: 'Weezing' },
  { number: 111, name: 'Rhyhorn' },
  { number: 112, name: 'Rhydon' },
  { number: 113, name: 'Chansey' },
  { number: 114, name: 'Tangela' },
  { number: 115, name: 'Kangaskhan' },
  { number: 116, name: 'Horsea' },
  { number: 117, name: 'Seadra' },
  { number: 118, name: 'Goldeen' },
  { number: 119, name: 'Seaking' },
  { number: 120, name: 'Staryu' },
  { number: 121, name: 'Starmie' },
  { number: 122, name: 'Mr. Mime' },
  { number: 123, name: 'Scyther' },
  { number: 124, name: 'Jynx' },
  { number: 125, name: 'Electabuzz' },
  { number: 126, name: 'Magmar' },
  { number: 127, name: 'Pinsir' },
  { number: 128, name: 'Tauros' },
  { number: 129, name: 'Magikarp' },
  { number: 130, name: 'Gyarados' },
  { number: 131, name: 'Lapras' },
  { number: 132, name: 'Ditto' },
  { number: 133, name: 'Eevee' },
  { number: 134, name: 'Vaporeon' },
  { number: 135, name: 'Jolteon' },
  { number: 136, name: 'Flareon' },
  { number: 137, name: 'Porygon' },
  { number: 138, name: 'Omanyte' },
  { number: 139, name: 'Omastar' },
  { number: 140, name: 'Kabuto' },
  { number: 141, name: 'Kabutops' },
  { number: 142, name: 'Aerodactyl' },
  { number: 143, name: 'Snorlax' },
  { number: 144, name: 'Articuno' },
  { number: 145, name: 'Zapdos' },
  { number: 146, name: 'Moltres' },
  { number: 147, name: 'Dratini' },
  { number: 148, name: 'Dragonair' },
  { number: 149, name: 'Dragonite' },
  { number: 150, name: 'Mewtwo' },
  { number: 151, name: 'Mew' },
];
```

- [ ] **Step 3: Write `src/data/gen1Dex.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { GEN1_DEX } from './gen1Dex';

describe('GEN1_DEX', () => {
  it('has exactly 151 entries', () => {
    expect(GEN1_DEX).toHaveLength(151);
  });

  it('is numbered sequentially from 1 to 151', () => {
    GEN1_DEX.forEach((entry, index) => {
      expect(entry.number).toBe(index + 1);
    });
  });

  it('has unique names', () => {
    const names = new Set(GEN1_DEX.map((entry) => entry.name));
    expect(names.size).toBe(151);
  });

  it('starts with Bulbasaur and ends with Mew', () => {
    expect(GEN1_DEX[0].name).toBe('Bulbasaur');
    expect(GEN1_DEX[150].name).toBe('Mew');
  });
});
```

- [ ] **Step 4: Run the test**

Run:
```bash
npm run test -- gen1Dex
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/data/gen1Dex.ts src/data/gen1Dex.test.ts
git commit -m "Add core types and the Gen 1 dex list"
```

---

## Task 5: Default rarity groups

**Context:** Live verification against the real TCGdex API (done during design/planning, not repeated here) confirmed the following. TCGdex's `rarity` field includes several tiers exclusive to Pokemon TCG Pocket (a mobile-only game, not the physical card game this app tracks): tiers named `One Diamond`, `Two Diamond`, `Three Diamond`, `Four Diamond`, `One Star`, `Two Star`, `Three Star`, `Crown`, and `None` only ever appear on cards whose `image` URL contains `/tcgp/`. Those tiers are excluded entirely. The remaining tiers below were confirmed to belong to real physical sets (checked via card `set.id` and `image` path, for example `Shiny rare` belongs to the physical "Paldean Fates" set, and `Black White Rare` belongs to the physical "Black Bolt"/"White Flare" sets).

**Files:**
- Create: `src/data/defaultRarityGroups.ts`
- Test: `src/data/defaultRarityGroups.test.ts`

- [ ] **Step 1: Write `src/data/defaultRarityGroups.ts`**

```ts
import type { RarityGroup } from '../types';

export const DEFAULT_RARITY_GROUPS: RarityGroup[] = [
  {
    id: 'full-art',
    name: 'Full Art',
    rarities: ['Ultra Rare'],
  },
  {
    id: 'alt-art',
    name: 'Alt Art / Illustration Rare',
    rarities: [
      'Special illustration rare',
      'Illustration rare',
      'Classic Collection',
      'Full Art Trainer',
    ],
  },
  {
    id: 'rainbow-gold',
    name: 'Rainbow / Gold Secret',
    rarities: ['Secret Rare', 'Hyper rare', 'Mega Hyper Rare', 'Amazing Rare', 'Black White Rare'],
  },
  {
    id: 'vintage-special',
    name: 'Vintage Specials',
    rarities: ['Shiny rare', 'Shiny rare V', 'Shiny rare VMAX', 'Shiny Ultra Rare'],
  },
];

export function fetchRarityList(groups: RarityGroup[] = DEFAULT_RARITY_GROUPS): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const rarity of group.rarities) {
      set.add(rarity);
    }
  }
  return Array.from(set);
}

export function isKnownPocketRarity(rarity: string): boolean {
  const pocketOnly = new Set([
    'One Diamond',
    'Two Diamond',
    'Three Diamond',
    'Four Diamond',
    'One Star',
    'Two Star',
    'Three Star',
    'Crown',
  ]);
  return pocketOnly.has(rarity);
}
```

- [ ] **Step 2: Write `src/data/defaultRarityGroups.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_RARITY_GROUPS, fetchRarityList, isKnownPocketRarity } from './defaultRarityGroups';

describe('DEFAULT_RARITY_GROUPS', () => {
  it('has 4 groups with unique ids', () => {
    expect(DEFAULT_RARITY_GROUPS).toHaveLength(4);
    const ids = new Set(DEFAULT_RARITY_GROUPS.map((g) => g.id));
    expect(ids.size).toBe(4);
  });

  it('has no duplicate rarity across groups', () => {
    const all = DEFAULT_RARITY_GROUPS.flatMap((g) => g.rarities);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('fetchRarityList', () => {
  it('flattens all group rarities into one deduplicated list', () => {
    const list = fetchRarityList(DEFAULT_RARITY_GROUPS);
    expect(list).toContain('Ultra Rare');
    expect(list).toContain('Special illustration rare');
    expect(list.length).toBe(new Set(list).size);
  });
});

describe('isKnownPocketRarity', () => {
  it('flags Pocket-only rarity tiers', () => {
    expect(isKnownPocketRarity('Crown')).toBe(true);
    expect(isKnownPocketRarity('Two Diamond')).toBe(true);
  });

  it('does not flag physical rarity tiers', () => {
    expect(isKnownPocketRarity('Ultra Rare')).toBe(false);
    expect(isKnownPocketRarity('Shiny rare')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run:
```bash
npm run test -- defaultRarityGroups
```
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add src/data/defaultRarityGroups.ts src/data/defaultRarityGroups.test.ts
git commit -m "Add default rarity group seed data"
```

---

## Task 6: TCGdex API client

**Files:**
- Create: `src/api/tcgdex.ts`
- Test: `src/api/tcgdex.test.ts`

- [ ] **Step 1: Write the failing test `src/api/tcgdex.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  cardImageUrl,
  deriveSetId,
  extractCardmarketAvgPrice,
  extractTcgplayerMarketPrice,
  fetchCardDetail,
  fetchCardsForDexAndRarity,
  fetchSets,
} from './tcgdex';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchCardsForDexAndRarity', () => {
  it('queries dexId and rarity with eq filters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl);
    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/v2/en/cards');
    expect(calledUrl.searchParams.get('dexId')).toBe('eq:6');
    expect(calledUrl.searchParams.get('rarity')).toBe('eq:Ultra Rare');
  });

  it('filters out Pokemon TCG Pocket cards by image path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: 'https://assets.tcgdex.net/en/sv/sv03.5/199' },
        { id: 'A1a-086', localId: '086', name: 'Mew ex', image: 'https://assets.tcgdex.net/en/tcgp/A1a/086' },
      ])
    );
    const cards = await fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('sv03.5-199');
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl)).rejects.toThrow(
      'TCGdex request failed with status 500'
    );
  });
});

describe('fetchCardDetail', () => {
  it('fetches a single card by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ id: 'sv03.5-199', localId: '199', name: 'Charizard ex', set: { id: 'sv03.5', name: '151' } })
    );
    const card = await fetchCardDetail('sv03.5-199', 'en', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.tcgdex.net/v2/en/cards/sv03.5-199',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(card.set.name).toBe('151');
  });
});

describe('cardImageUrl', () => {
  it('appends quality and extension to the base image path', () => {
    expect(cardImageUrl('https://assets.tcgdex.net/en/sv/sv03.5/199')).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
    );
    expect(cardImageUrl('https://assets.tcgdex.net/en/sv/sv03.5/199', 'high', 'png')).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });
});

describe('extractTcgplayerMarketPrice', () => {
  it('reads the market price from the first variant that has one', () => {
    const price = extractTcgplayerMarketPrice({
      tcgplayer: {
        updated: '2026-07-09',
        'unlimited-holofoil': { marketPrice: 570.67 },
      },
    });
    expect(price).toBe(570.67);
  });

  it('returns null when there is no tcgplayer pricing', () => {
    expect(extractTcgplayerMarketPrice(undefined)).toBeNull();
    expect(extractTcgplayerMarketPrice({})).toBeNull();
  });
});

describe('extractCardmarketAvgPrice', () => {
  it('reads the cardmarket average', () => {
    expect(extractCardmarketAvgPrice({ cardmarket: { avg: 372.8 } })).toBe(372.8);
  });

  it('returns null when there is no cardmarket pricing', () => {
    expect(extractCardmarketAvgPrice(undefined)).toBeNull();
  });
});

describe('fetchSets', () => {
  it('fetches the id/name list of sets for a language', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'sv03.5', name: '151' },
        { id: 'sv03', name: 'Obsidian Flames' },
      ])
    );
    const sets = await fetchSets('en', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.tcgdex.net/v2/en/sets',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(sets).toEqual([
      { id: 'sv03.5', name: '151' },
      { id: 'sv03', name: 'Obsidian Flames' },
    ]);
  });
});

describe('deriveSetId', () => {
  it('strips the trailing -localId suffix from a card id', () => {
    expect(deriveSetId('sv03.5-199', '199')).toBe('sv03.5');
    expect(deriveSetId('sv10.5b-165', '165')).toBe('sv10.5b');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- tcgdex
```
Expected: FAIL, `Cannot find module './tcgdex'`.

- [ ] **Step 3: Write `src/api/tcgdex.ts`**

```ts
export interface TcgdexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexPricingTcgplayerVariant {
  marketPrice?: number | null;
}

export interface TcgdexPricing {
  cardmarket?: {
    avg?: number | null;
    updated?: string;
  };
  tcgplayer?: {
    updated?: string;
    [variant: string]: TcgdexPricingTcgplayerVariant | string | undefined;
  };
}

export interface TcgdexCardDetail extends TcgdexCardBrief {
  rarity?: string;
  dexId?: number[];
  set: { id: string; name: string };
  pricing?: TcgdexPricing;
}

const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

function isPocketCard(card: TcgdexCardBrief): boolean {
  return card.image ? card.image.includes('/tcgp/') : false;
}

export async function fetchCardsForDexAndRarity(
  dexNumber: number,
  rarity: string,
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexCardBrief[]> {
  const url = new URL(`${TCGDEX_BASE}/${language}/cards`);
  url.searchParams.set('dexId', `eq:${dexNumber}`);
  url.searchParams.set('rarity', `eq:${rarity}`);
  const res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  const cards: TcgdexCardBrief[] = await res.json();
  return cards.filter((card) => !isPocketCard(card));
}

export async function fetchCardDetail(
  cardId: string,
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexCardDetail> {
  const res = await fetchImpl(`${TCGDEX_BASE}/${language}/cards/${cardId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  return res.json();
}

export function cardImageUrl(
  baseImage: string,
  quality: 'high' | 'low' = 'low',
  ext: 'png' | 'webp' = 'webp'
): string {
  return `${baseImage}/${quality}.${ext}`;
}

export function extractTcgplayerMarketPrice(pricing: TcgdexPricing | undefined): number | null {
  if (!pricing?.tcgplayer) return null;
  for (const [key, value] of Object.entries(pricing.tcgplayer)) {
    if (key === 'updated') continue;
    if (value && typeof value === 'object' && typeof value.marketPrice === 'number') {
      return value.marketPrice;
    }
  }
  return null;
}

export function extractCardmarketAvgPrice(pricing: TcgdexPricing | undefined): number | null {
  return pricing?.cardmarket?.avg ?? null;
}

export interface TcgdexSetBrief {
  id: string;
  name: string;
}

export async function fetchSets(
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexSetBrief[]> {
  const res = await fetchImpl(`${TCGDEX_BASE}/${language}/sets`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  return res.json();
}

export function deriveSetId(cardId: string, localId: string): string {
  return cardId.slice(0, cardId.length - localId.length - 1);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- tcgdex
```
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/tcgdex.ts src/api/tcgdex.test.ts
git commit -m "Add TCGdex API client"
```

---

## Task 7: PokeAPI sprite URL helper

**Files:**
- Create: `src/api/pokeapi.ts`
- Test: `src/api/pokeapi.test.ts`

- [ ] **Step 1: Write the failing test `src/api/pokeapi.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { spriteUrl } from './pokeapi';

describe('spriteUrl', () => {
  it('builds the official artwork URL for a dex number', () => {
    expect(spriteUrl(6)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png'
    );
  });

  it('works for the last Gen 1 entry', () => {
    expect(spriteUrl(151)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/151.png'
    );
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- pokeapi
```
Expected: FAIL, `Cannot find module './pokeapi'`.

- [ ] **Step 3: Write `src/api/pokeapi.ts`**

```ts
export function spriteUrl(dexNumber: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNumber}.png`;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- pokeapi
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/pokeapi.ts src/api/pokeapi.test.ts
git commit -m "Add PokeAPI sprite URL helper"
```

---

## Task 8: Currency conversion client

**Files:**
- Create: `src/api/fx.ts`
- Test: `src/api/fx.test.ts`

- [ ] **Step 1: Write the failing test `src/api/fx.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { convertAmount, fetchRates } from './fx';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('fetchRates', () => {
  it('requests the given base and symbols', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ amount: 1, base: 'USD', date: '2026-07-09', rates: { AUD: 1.441, EUR: 0.87451 } })
    );
    const rates = await fetchRates('USD', ['AUD', 'EUR'], fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD,EUR'
    );
    expect(rates.rates.AUD).toBe(1.441);
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchRates('USD', ['AUD'], fetchImpl)).rejects.toThrow(
      'Frankfurter request failed with status 500'
    );
  });
});

describe('convertAmount', () => {
  it('multiplies and rounds to 2 decimal places', () => {
    expect(convertAmount(699.99, 1.441)).toBe(1008.69);
  });

  it('returns the same amount for a rate of 1', () => {
    expect(convertAmount(100, 1)).toBe(100);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- fx
```
Expected: FAIL, `Cannot find module './fx'`.

- [ ] **Step 3: Write `src/api/fx.ts`**

```ts
export interface FxRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

export async function fetchRates(
  base: string,
  symbols: string[],
  fetchImpl: typeof fetch = fetch
): Promise<FxRates> {
  const url = `${FRANKFURTER_BASE}/latest?base=${base}&symbols=${symbols.join(',')}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Frankfurter request failed with status ${res.status}`);
  }
  return res.json();
}

export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- fx
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/fx.ts src/api/fx.test.ts
git commit -m "Add currency conversion client"
```

---

## Task 9: Card and pricing cache (localStorage)

**Files:**
- Create: `src/storage/cardCache.ts`
- Test: `src/storage/cardCache.test.ts`

- [ ] **Step 1: Write the failing test `src/storage/cardCache.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCardCache,
  getCachedCards,
  getCachedPricing,
  hasCachedDataForLanguage,
  setCachedCards,
  setCachedPricing,
} from './cardCache';
import type { CardPricing, CardRecord } from '../types';

const sampleCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const samplePricing: CardPricing = {
  cardId: 'sv03.5-199',
  cardmarketEurAvg: 372.8,
  tcgplayerUsdMarket: 699.99,
  fetchedAt: '2026-07-09T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

describe('card cache', () => {
  it('returns undefined for a dex number that has not been cached', () => {
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('round-trips a card list for a language and dex number', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('en', 6)).toEqual([sampleCard]);
  });

  it('keeps caches for different languages separate', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('ja', 6)).toBeUndefined();
  });

  it('clearCardCache empties the cache', () => {
    setCachedCards('en', 6, [sampleCard]);
    clearCardCache();
    expect(getCachedCards('en', 6)).toBeUndefined();
  });
});

describe('hasCachedDataForLanguage', () => {
  it('returns false when nothing has been cached for a language', () => {
    expect(hasCachedDataForLanguage('en')).toBe(false);
  });

  it('returns true once at least one dex number has been cached for that language', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(hasCachedDataForLanguage('en')).toBe(true);
    expect(hasCachedDataForLanguage('ja')).toBe(false);
  });
});

describe('pricing cache', () => {
  it('returns undefined for a card that has not been priced', () => {
    expect(getCachedPricing('sv03.5-199')).toBeUndefined();
  });

  it('round-trips pricing for a card id', () => {
    setCachedPricing('sv03.5-199', samplePricing);
    expect(getCachedPricing('sv03.5-199')).toEqual(samplePricing);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- cardCache
```
Expected: FAIL, `Cannot find module './cardCache'`.

- [ ] **Step 3: Write `src/storage/cardCache.ts`**

```ts
import type { CardPricing, CardRecord } from '../types';

const CARD_CACHE_KEY = 'pcc:cardCache:v1';
const PRICE_CACHE_KEY = 'pcc:priceCache:v1';

interface CardCacheShape {
  [key: string]: CardRecord[];
}

interface PriceCacheShape {
  [cardId: string]: CardPricing;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function cardCacheKey(language: string, dexNumber: number): string {
  return `${language}:${dexNumber}`;
}

export function getCachedCards(language: string, dexNumber: number): CardRecord[] | undefined {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  return cache[cardCacheKey(language, dexNumber)];
}

export function setCachedCards(language: string, dexNumber: number, cards: CardRecord[]): void {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  cache[cardCacheKey(language, dexNumber)] = cards;
  writeJson(CARD_CACHE_KEY, cache);
}

export function getCachedPricing(cardId: string): CardPricing | undefined {
  const cache = readJson<PriceCacheShape>(PRICE_CACHE_KEY, {});
  return cache[cardId];
}

export function setCachedPricing(cardId: string, pricing: CardPricing): void {
  const cache = readJson<PriceCacheShape>(PRICE_CACHE_KEY, {});
  cache[cardId] = pricing;
  writeJson(PRICE_CACHE_KEY, cache);
}

export function clearCardCache(): void {
  localStorage.removeItem(CARD_CACHE_KEY);
}

export function hasCachedDataForLanguage(language: string): boolean {
  const cache = readJson<CardCacheShape>(CARD_CACHE_KEY, {});
  return Object.keys(cache).some((key) => key.startsWith(`${language}:`));
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- cardCache
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/storage/cardCache.ts src/storage/cardCache.test.ts
git commit -m "Add card and pricing cache backed by localStorage"
```

---

## Task 10: Image blob cache (IndexedDB)

**Files:**
- Create: `src/storage/imageCache.ts`
- Test: `src/storage/imageCache.test.ts`

- [ ] **Step 1: Write the failing test `src/storage/imageCache.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { fetchImageWithCache, getCachedImage, setCachedImage } from './imageCache';

beforeEach(async () => {
  indexedDB = new IDBFactory();
});

describe('image cache', () => {
  it('returns undefined for an uncached URL', async () => {
    const result = await getCachedImage('https://example.com/a.png');
    expect(result).toBeUndefined();
  });

  it('round-trips a blob for a URL', async () => {
    const blob = new Blob(['fake image bytes'], { type: 'image/png' });
    await setCachedImage('https://example.com/a.png', blob);
    const cached = await getCachedImage('https://example.com/a.png');
    expect(cached).toBeDefined();
    expect(cached?.type).toBe('image/png');
  });
});

describe('fetchImageWithCache', () => {
  it('fetches and caches on a cache miss', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob } as Response);
    const objectUrl = await fetchImageWithCache('https://example.com/b.png', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(objectUrl).toMatch(/^blob:/);
  });

  it('skips the network on a cache hit', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' });
    await setCachedImage('https://example.com/c.png', blob);
    const fetchImpl = vi.fn();
    await fetchImageWithCache('https://example.com/c.png', fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws when the network request fails and there is no cache entry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(fetchImageWithCache('https://example.com/d.png', fetchImpl)).rejects.toThrow(
      'Image request failed with status 404'
    );
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- imageCache
```
Expected: FAIL, `Cannot find module './imageCache'`.

- [ ] **Step 3: Write `src/storage/imageCache.ts`**

```ts
const DB_NAME = 'pcc-image-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedImage(url: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(url);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function setCachedImage(url: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function fetchImageWithCache(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const cached = await getCachedImage(url);
  if (cached) {
    return URL.createObjectURL(cached);
  }
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Image request failed with status ${res.status}`);
  }
  const blob = await res.blob();
  await setCachedImage(url, blob);
  return URL.createObjectURL(blob);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- imageCache
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/storage/imageCache.ts src/storage/imageCache.test.ts
git commit -m "Add IndexedDB image blob cache"
```

---

## Task 11: App state store (Zustand)

> **Amended** after Tasks 1-10 shipped, to add: a `hasUnsavedChanges` flag (feeds a browser close/reload warning, Task 22a) and `selectedGenerations`/`toggleGeneration` (feeds a multi-select generation filter, Task 17). Both additions were adversarially reviewed against the rest of the plan before being written in here. See the reasoning inline in the code comments below, particularly why `selectedGenerations` defaults to a literal `[1]` rather than deriving from a canonical list the way `activeGroupIds` does, and why `hasUnsavedChanges` must be added to `partialize`.

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

- [ ] **Step 1: Write the failing test `src/state/store.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

function resetStore() {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  resetStore();
});

describe('markOwned', () => {
  it('records ownership and clears any wishlist entry for the same dex number', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    const state = useAppStore.getState();
    expect(state.owned[6]).toMatchObject({ dexNumber: 6, cardId: 'sv03-223', condition: 'Near Mint' });
    expect(state.wishlist[6]).toBeUndefined();
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('unmarkOwned', () => {
  it('removes an ownership record', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.getState().unmarkOwned(6);
    expect(useAppStore.getState().owned[6]).toBeUndefined();
  });

  it('sets hasUnsavedChanges when it removes a real entry', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().unmarkOwned(6);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('does not set hasUnsavedChanges for a no-op unmark of a nonexistent entry', () => {
    useAppStore.getState().unmarkOwned(999);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('toggleWishlist', () => {
  it('adds a wishlist entry when none exists for that dex number', () => {
    const result = useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ dexNumber: 6, cardId: 'sv03.5-199' });
  });

  it('removes the wishlist entry when the same card is toggled again', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    const result = useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().wishlist[6]).toBeUndefined();
  });

  it('blocks a second wishlist card for the same dex number with a reason', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    const result = useAppStore.getState().toggleWishlist(6, 'sv03-223');
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: 'sv03.5-199' });
  });

  it('sets hasUnsavedChanges on add and on remove, but not when blocked', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);

    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().toggleWishlist(6, 'sv03-223');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('removeWishlist', () => {
  it('does not set hasUnsavedChanges for a no-op removal of a nonexistent entry', () => {
    useAppStore.getState().removeWishlist(999);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('toggleActiveGroup', () => {
  it('removes an active group id when toggled off, and re-adds it when toggled on', () => {
    const groupId = DEFAULT_RARITY_GROUPS[0].id;
    useAppStore.getState().toggleActiveGroup(groupId);
    expect(useAppStore.getState().activeGroupIds).not.toContain(groupId);
    useAppStore.getState().toggleActiveGroup(groupId);
    expect(useAppStore.getState().activeGroupIds).toContain(groupId);
  });
});

describe('setGroups', () => {
  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().setGroups([]);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('toggleGeneration', () => {
  it('adds a generation id when toggled on, and removes it when toggled off', () => {
    useAppStore.getState().toggleGeneration(2);
    expect(useAppStore.getState().selectedGenerations).toContain(2);
    useAppStore.getState().toggleGeneration(2);
    expect(useAppStore.getState().selectedGenerations).not.toContain(2);
  });

  it('does not set hasUnsavedChanges (it is a view filter, not collection data)', () => {
    useAppStore.getState().toggleGeneration(2);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('bumpPriceVersion', () => {
  it('increments the price version counter', () => {
    const before = useAppStore.getState().priceVersion;
    useAppStore.getState().bumpPriceVersion();
    expect(useAppStore.getState().priceVersion).toBe(before + 1);
  });
});

describe('markChangesSaved', () => {
  it('resets hasUnsavedChanges to false', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.getState().markChangesSaved();
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('replaceUserData', () => {
  it('overwrites the full user data slice, including selectedGenerations', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    });
    const state = useAppStore.getState();
    expect(state.language).toBe('ja');
    expect(state.currency).toBe('EUR');
    expect(state.owned[6]).toBeUndefined();
  });

  it('resets hasUnsavedChanges to false, regardless of what was pending before', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });

  it('running a mutator right after replaceUserData correctly flips hasUnsavedChanges back on', () => {
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- state/store
```
Expected: FAIL, `Cannot find module './store'`.

- [ ] **Step 3: Write `src/state/store.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { Condition, Currency, OwnedRecord, RarityGroup, WishlistRecord } from '../types';

export interface ExportedUserData {
  version: 1;
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
}

export interface ToggleWishlistResult {
  ok: boolean;
  reason?: string;
}

export interface AppState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  hasUnsavedChanges: boolean;

  setLanguage: (language: string) => void;
  setCurrency: (currency: Currency) => void;
  toggleActiveGroup: (groupId: string) => void;
  setGroups: (groups: RarityGroup[]) => void;
  toggleGeneration: (id: number) => void;

  markOwned: (dexNumber: number, cardId: string, condition: Condition) => void;
  unmarkOwned: (dexNumber: number) => void;

  toggleWishlist: (dexNumber: number, cardId: string) => ToggleWishlistResult;
  removeWishlist: (dexNumber: number) => void;

  priceVersion: number;
  bumpPriceVersion: () => void;

  markChangesSaved: () => void;
  replaceUserData: (data: ExportedUserData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      language: 'en',
      currency: 'USD',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      // Deliberately a literal, NOT GENERATIONS.map((g) => g.id). New generations
      // added to src/data/generations.ts later are opt-in, not auto-selected: a
      // brand-new user today gets Gen 1 only, and an existing user who updates
      // their app after Gen 2 data ships keeps seeing exactly what they had
      // yesterday, rather than being silently opted into a large new data fetch
      // and a changed grid. Unlike activeGroupIds (a filter over data that's
      // always fully loaded already, so toggling one on/off costs nothing extra),
      // selecting a generation triggers fetching and caching a large new batch of
      // card data, so auto-including newly-added generations would mean a routine
      // data update silently changes what an existing user sees and silently
      // triggers a big background fetch on their next visit. This is a deliberate
      // product choice, not an oversight.
      selectedGenerations: [1],
      priceVersion: 0,
      hasUnsavedChanges: false,

      setLanguage: (language) => set({ language }),
      setCurrency: (currency) => set({ currency }),
      toggleActiveGroup: (groupId) =>
        set((state) => ({
          activeGroupIds: state.activeGroupIds.includes(groupId)
            ? state.activeGroupIds.filter((id) => id !== groupId)
            : [...state.activeGroupIds, groupId],
        })),
      setGroups: (groups) => set({ groups, hasUnsavedChanges: true }),
      toggleGeneration: (id) =>
        set((state) => ({
          selectedGenerations: state.selectedGenerations.includes(id)
            ? state.selectedGenerations.filter((gid) => gid !== id)
            : [...state.selectedGenerations, id],
        })),

      markOwned: (dexNumber, cardId, condition) =>
        set((state) => {
          const wishlist = { ...state.wishlist };
          delete wishlist[dexNumber];
          return {
            owned: {
              ...state.owned,
              [dexNumber]: { dexNumber, cardId, condition, addedAt: new Date().toISOString() },
            },
            wishlist,
            hasUnsavedChanges: true,
          };
        }),

      unmarkOwned: (dexNumber) =>
        set((state) => {
          if (!(dexNumber in state.owned)) return {};
          const owned = { ...state.owned };
          delete owned[dexNumber];
          return { owned, hasUnsavedChanges: true };
        }),

      toggleWishlist: (dexNumber, cardId) => {
        const state = get();
        const existing = state.wishlist[dexNumber];
        if (existing && existing.cardId === cardId) {
          const wishlist = { ...state.wishlist };
          delete wishlist[dexNumber];
          set({ wishlist, hasUnsavedChanges: true });
          return { ok: true };
        }
        if (existing && existing.cardId !== cardId) {
          return {
            ok: false,
            reason: 'Only one wishlist card is allowed per Pokemon. Remove the current pick first.',
          };
        }
        set({
          wishlist: {
            ...state.wishlist,
            [dexNumber]: { dexNumber, cardId, addedAt: new Date().toISOString() },
          },
          hasUnsavedChanges: true,
        });
        return { ok: true };
      },

      removeWishlist: (dexNumber) =>
        set((state) => {
          if (!(dexNumber in state.wishlist)) return {};
          const wishlist = { ...state.wishlist };
          delete wishlist[dexNumber];
          return { wishlist, hasUnsavedChanges: true };
        }),

      bumpPriceVersion: () => set((state) => ({ priceVersion: state.priceVersion + 1 })),

      markChangesSaved: () => set({ hasUnsavedChanges: false }),

      replaceUserData: (data) =>
        set({
          language: data.language,
          currency: data.currency,
          activeGroupIds: data.activeGroupIds,
          groups: data.groups,
          owned: data.owned,
          wishlist: data.wishlist,
          selectedGenerations: data.selectedGenerations,
          hasUnsavedChanges: false,
        }),
    }),
    {
      name: 'pcc:userData:v1',
      partialize: (state) => ({
        language: state.language,
        currency: state.currency,
        activeGroupIds: state.activeGroupIds,
        groups: state.groups,
        owned: state.owned,
        wishlist: state.wishlist,
        selectedGenerations: state.selectedGenerations,
        hasUnsavedChanges: state.hasUnsavedChanges,
      }),
    }
  )
);
```

`hasUnsavedChanges` is included in `partialize` deliberately: without this, the flag would silently reset to `false` on every reload or background-tab discard/restore (Chrome reloads discarded tabs without firing `beforeunload`), defeating the whole point of Task 22a's close-warning feature. It is NOT included in `ExportedUserData`/the JSON export shape (Task 22), since it's ephemeral UI state describing the relationship between the store and the filesystem, not collection data, so it has no business round-tripping through a backup file. `replaceUserData` always sets it to `false` explicitly regardless of what's in the imported file.

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- state/store
```
Expected: 19 passed.

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts
git commit -m "Add Zustand app store for user data"
```

---

## Task 12: Availability selectors

**Files:**
- Create: `src/state/selectors.ts`
- Test: `src/state/selectors.test.ts`

- [ ] **Step 1: Write the failing test `src/state/selectors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { activeRarities, availableCardsForDex, computeTileState } from './selectors';
import type { CardRecord, RarityGroup } from '../types';

const groups: RarityGroup[] = [
  { id: 'a', name: 'A', rarities: ['Ultra Rare'] },
  { id: 'b', name: 'B', rarities: ['Secret Rare'] },
];

const cards: CardRecord[] = [
  {
    id: '1',
    name: 'Card 1',
    dexNumber: 6,
    setId: 's1',
    setName: 'Set 1',
    localId: '1',
    rarity: 'Ultra Rare',
    imageBase: 'https://x/1',
    language: 'en',
  },
  {
    id: '2',
    name: 'Card 2',
    dexNumber: 6,
    setId: 's2',
    setName: 'Set 2',
    localId: '2',
    rarity: 'Secret Rare',
    imageBase: 'https://x/2',
    language: 'en',
  },
];

describe('activeRarities', () => {
  it('collects rarities only from active groups', () => {
    const set = activeRarities(groups, ['a']);
    expect(set.has('Ultra Rare')).toBe(true);
    expect(set.has('Secret Rare')).toBe(false);
  });
});

describe('availableCardsForDex', () => {
  it('filters cards to only those in the active rarity set', () => {
    const set = activeRarities(groups, ['a']);
    const result = availableCardsForDex(cards, set);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

describe('computeTileState', () => {
  it('returns owned when the Pokemon has an owned record, regardless of availability', () => {
    expect(computeTileState(true, 0)).toBe('owned');
    expect(computeTileState(true, 3)).toBe('owned');
  });

  it('returns unavailable when not owned and there are zero available cards', () => {
    expect(computeTileState(false, 0)).toBe('unavailable');
  });

  it('returns available when not owned and there is at least one available card', () => {
    expect(computeTileState(false, 1)).toBe('available');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- state/selectors
```
Expected: FAIL, `Cannot find module './selectors'`.

- [ ] **Step 3: Write `src/state/selectors.ts`**

```ts
import type { CardRecord, RarityGroup } from '../types';

export function activeRarities(groups: RarityGroup[], activeGroupIds: string[]): Set<string> {
  const set = new Set<string>();
  for (const group of groups) {
    if (activeGroupIds.includes(group.id)) {
      for (const rarity of group.rarities) {
        set.add(rarity);
      }
    }
  }
  return set;
}

export function availableCardsForDex(allCards: CardRecord[], activeSet: Set<string>): CardRecord[] {
  return allCards.filter((card) => activeSet.has(card.rarity));
}

export type TileState = 'available' | 'owned' | 'unavailable';

export function computeTileState(hasOwned: boolean, availableCount: number): TileState {
  if (hasOwned) return 'owned';
  if (availableCount === 0) return 'unavailable';
  return 'available';
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- state/selectors
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/state/selectors.ts src/state/selectors.test.ts
git commit -m "Add availability selectors"
```

---

## Task 13: Card data loading orchestration

**Files:**
- Create: `src/state/loadCardData.ts`
- Test: `src/state/loadCardData.test.ts`

- [ ] **Step 1: Write the failing test `src/state/loadCardData.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllCachedCardsForDex, loadAllCardData } from './loadCardData';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadAllCardData', () => {
  it('fetches sets once, fetches cards per dex number and rarity, and caches the merged result', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return jsonResponse([
          {
            id: 'sv03.5-199',
            localId: '199',
            name: 'Charizard ex',
            image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
          },
        ]);
      }
      return jsonResponse([]);
    });

    await loadAllCardData('en', {
      dexEntries: [{ number: 6, name: 'Charizard' }],
      rarities: ['Ultra Rare'],
      fetchImpl,
    });

    const cached = getAllCachedCardsForDex('en', 6);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({
      id: 'sv03.5-199',
      dexNumber: 6,
      setId: 'sv03.5',
      setName: '151',
      rarity: 'Ultra Rare',
    });
  });

  it('reports progress as each dex number completes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const progressCalls: { completed: number; total: number }[] = [];
    await loadAllCardData('en', {
      dexEntries: [
        { number: 1, name: 'Bulbasaur' },
        { number: 2, name: 'Ivysaur' },
      ],
      rarities: ['Ultra Rare'],
      onProgress: (p) => progressCalls.push(p),
      fetchImpl,
    });
    expect(progressCalls).toEqual([
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);
  });

  it('caches an empty array for a dex number with no matching cards', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await loadAllCardData('en', {
      dexEntries: [{ number: 11, name: 'Metapod' }],
      rarities: ['Ultra Rare'],
      fetchImpl,
    });
    expect(getAllCachedCardsForDex('en', 11)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- loadCardData
```
Expected: FAIL, `Cannot find module './loadCardData'`.

- [ ] **Step 3: Write `src/state/loadCardData.ts`**

```ts
import { DEFAULT_RARITY_GROUPS, fetchRarityList } from '../data/defaultRarityGroups';
import { GEN1_DEX, type DexEntry } from '../data/gen1Dex';
import { deriveSetId, fetchCardsForDexAndRarity, fetchSets } from '../api/tcgdex';
import { getCachedCards, setCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';

export interface LoadProgress {
  completed: number;
  total: number;
}

export interface LoadAllCardDataOptions {
  dexEntries?: DexEntry[];
  rarities?: string[];
  onProgress?: (progress: LoadProgress) => void;
  // Declared with method-shorthand syntax, not `fetchImpl?: typeof fetch`. Under
  // this project's `strict: true`, a property typed as a plain function type is
  // checked contravariantly, and the test above's mock (`vi.fn(async (url: string)
  // => {...})`, which needs to branch on the URL, so it can't use the untyped
  // `vi.fn().mockResolvedValue(...)` pattern other tests use) has a narrower `url:
  // string` parameter than `typeof fetch`'s `input: RequestInfo | URL`, which fails
  // that check. Method-shorthand members use TypeScript's bivariant method check
  // instead, which accepts it, with no change to runtime behavior.
  fetchImpl?(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export async function loadAllCardData(
  language: string,
  options: LoadAllCardDataOptions = {}
): Promise<void> {
  const {
    dexEntries = GEN1_DEX,
    rarities = fetchRarityList(DEFAULT_RARITY_GROUPS),
    onProgress,
    fetchImpl = fetch,
  } = options;

  const sets = await fetchSets(language, fetchImpl);
  const setNameById = new Map(sets.map((s) => [s.id, s.name]));

  const total = dexEntries.length;
  let completed = 0;

  for (const entry of dexEntries) {
    const perDex: CardRecord[] = [];
    for (const rarity of rarities) {
      const briefs = await fetchCardsForDexAndRarity(entry.number, rarity, language, fetchImpl);
      for (const brief of briefs) {
        const setId = deriveSetId(brief.id, brief.localId);
        perDex.push({
          id: brief.id,
          name: brief.name,
          dexNumber: entry.number,
          setId,
          setName: setNameById.get(setId) ?? setId,
          localId: brief.localId,
          rarity,
          imageBase: brief.image ?? '',
          language,
        });
      }
    }
    setCachedCards(language, entry.number, perDex);
    completed += 1;
    onProgress?.({ completed, total });
  }
}

export function getAllCachedCardsForDex(language: string, dexNumber: number): CardRecord[] {
  return getCachedCards(language, dexNumber) ?? [];
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- loadCardData
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/state/loadCardData.ts src/state/loadCardData.test.ts
git commit -m "Add card data loading orchestration"
```

---

## Task 14: Tile component

**Files:**
- Create: `src/components/Tile.tsx`
- Create: `src/components/Tile.module.css`
- Test: `src/components/Tile.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/Tile.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tile } from './Tile';

describe('Tile', () => {
  it('renders the dex number and name', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteUrl="https://example.com/6.png"
        state="available"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByText('#006')).toBeInTheDocument();
    expect(screen.getByText('Charizard')).toBeInTheDocument();
  });

  it('applies a state-specific class name', () => {
    render(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteUrl="https://example.com/11.png"
        state="unavailable"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).toHaveClass('tile--unavailable');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(
      <Tile
        dexNumber={25}
        name="Pikachu"
        spriteUrl="https://example.com/25.png"
        state="owned"
        view="sprite"
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the owned card image in card view when one is provided', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteUrl="https://example.com/6.png"
        state="owned"
        view="card"
        ownedCardImageUrl="https://example.com/card.png"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Charizard card')).toBeInTheDocument();
  });

  it('falls back to the sprite image in card view when no owned card image is provided', () => {
    render(
      <Tile
        dexNumber={1}
        name="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        state="available"
        view="card"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Bulbasaur')).toBeInTheDocument();
    expect(screen.queryByAltText('Bulbasaur card')).not.toBeInTheDocument();
  });

  it('applies the available state class name', () => {
    render(
      <Tile
        dexNumber={1}
        name="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        state="available"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).toHaveClass('tile--available');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- Tile.test
```
Expected: FAIL, `Cannot find module './Tile'`.

- [ ] **Step 3: Write `src/components/Tile.module.css`**

```css
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.tile img {
  width: 72px;
  height: 72px;
  object-fit: contain;
}

.tile--available {
  /* "available" is the default/undecorated look; no visual override needed.
     background-color is restated (matches .tile) purely so this selector
     survives CSS minification and stays a valid, discoverable class hook.
     A truly empty rule gets stripped by esbuild's CSS minifier in the
     production build, which would silently drop this class key. */
  background-color: transparent;
}

.tile--owned img {
  filter: grayscale(1) brightness(0.7);
  opacity: 0.6;
}

.tile--unavailable {
  background: rgba(220, 60, 60, 0.1);
}

.tile--unavailable img {
  filter: saturate(0.4);
  opacity: 0.7;
}

.number {
  font-size: 11px;
  opacity: 0.6;
}

.name {
  font-size: 12px;
}
```

- [ ] **Step 4: Write `src/components/Tile.tsx`**

```tsx
import type { TileState } from '../state/selectors';
import styles from './Tile.module.css';

export interface TileProps {
  dexNumber: number;
  name: string;
  spriteUrl: string;
  state: TileState;
  view: 'sprite' | 'card';
  ownedCardImageUrl?: string;
  onClick: () => void;
}

export function Tile({
  dexNumber,
  name,
  spriteUrl,
  state,
  view,
  ownedCardImageUrl,
  onClick,
}: TileProps) {
  const title =
    state === 'unavailable'
      ? `No special or full art cards have been released yet for ${name}.`
      : state === 'owned'
        ? `You own a card for ${name}. Click to change or remove it.`
        : `Click to see the special art card options for ${name}.`;

  const showCardImage = view === 'card' && ownedCardImageUrl;

  return (
    <button
      type="button"
      className={[styles.tile, styles[`tile--${state}`]].filter(Boolean).join(' ')}
      onClick={onClick}
      title={title}
    >
      <span className={styles.number}>#{String(dexNumber).padStart(3, '0')}</span>
      {showCardImage ? (
        <img src={ownedCardImageUrl} alt={`${name} card`} loading="lazy" />
      ) : (
        <img src={spriteUrl} alt={name} loading="lazy" />
      )}
      <span className={styles.name}>{name}</span>
    </button>
  );
}
```

The class list is built with `[styles.tile, styles[\`tile--${state}\`]].filter(Boolean).join(' ')` rather than a plain template string. `styles[...]` returns `undefined` for any key that has no matching CSS Modules rule (a real bug: without this guard, an "available"-state tile would render `class="tile undefined"` in production, since CSS Modules doesn't error on a missing key, it just resolves to `undefined`, and Vitest's CSS Modules test mock silently accepts any key so the bug is invisible to tests without an explicit assertion). `.filter(Boolean)` drops any such `undefined` entry instead of stringifying it into the DOM.

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- Tile.test
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/Tile.tsx src/components/Tile.module.css src/components/Tile.test.tsx
git commit -m "Add Tile component with sprite/card view and state styling"
```

---

## Task 15: Picker and condition selection

**Files:**
- Create: `src/components/ConditionPicker.tsx`
- Create: `src/components/ConditionPicker.module.css`
- Create: `src/components/Picker.tsx`
- Create: `src/components/Picker.module.css`
- Test: `src/components/Picker.test.tsx`

- [ ] **Step 1: Write `src/components/ConditionPicker.module.css`**

```css
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  max-width: 360px;
}

.note {
  font-size: 12px;
  opacity: 0.7;
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cancel {
  align-self: flex-start;
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}
```

- [ ] **Step 2: Write `src/components/ConditionPicker.tsx`**

```tsx
import { CONDITIONS, type Condition } from '../types';
import styles from './ConditionPicker.module.css';

export interface ConditionPickerProps {
  cardName: string;
  onConfirm: (condition: Condition) => void;
  onCancel: () => void;
}

export function ConditionPicker({ cardName, onConfirm, onCancel }: ConditionPickerProps) {
  return (
    <div className={styles.panel}>
      <h3>What condition is your {cardName} in?</h3>
      <p className={styles.note}>
        This is for your own reference only. Displayed market prices are not adjusted by
        condition, since no free pricing source breaks prices out that way.
      </p>
      <div className={styles.options}>
        {CONDITIONS.map((condition) => (
          <button key={condition} type="button" onClick={() => onConfirm(condition)}>
            {condition}
          </button>
        ))}
      </div>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/Picker.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.panel {
  background: var(--panel-bg, #fff);
  color: var(--panel-fg, #111);
  border-radius: 16px;
  padding: 20px;
  max-width: 640px;
  width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.warning {
  color: #c0392b;
  font-size: 13px;
}

.unmark {
  background: none;
  border: 1px solid currentColor;
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  align-self: flex-start;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.card {
  position: relative;
}

.star {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.4);
  color: #ffd700;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  z-index: 1;
}

.cardBody,
.cardBodySelected {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  background: none;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 4px;
  cursor: pointer;
  font-size: 10.5px;
}

.cardBodySelected {
  border-color: #4a9eff;
}

.cardBody img,
.cardBodySelected img {
  width: 100%;
  border-radius: 6px;
}
```

- [ ] **Step 4: Write the failing test `src/components/Picker.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { CardRecord } from '../types';

const cardA: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const cardB: CardRecord = {
  ...cardA,
  id: 'sv03-223',
  setId: 'sv03',
  setName: 'Obsidian Flames',
  localId: '223',
};

function resetStore() {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  resetStore();
});

describe('Picker', () => {
  it('shows a message when there are no matching cards', () => {
    render(<Picker dexNumber={11} pokemonName="Metapod" cards={[]} onClose={() => {}} />);
    expect(screen.getByText(/no special or full art cards match/i)).toBeInTheDocument();
  });

  it('stars a card to add it to the wishlist', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /add charizard ex to wishlist/i }));
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: cardA.id });
  });

  it('warns instead of switching when a second card is starred for the same dex number', async () => {
    render(
      <Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />
    );
    const stars = screen.getAllByRole('button', { name: /add charizard ex to wishlist/i });
    await userEvent.click(stars[0]);
    const starsAfter = screen.getAllByRole('button', { name: /add charizard ex to wishlist/i });
    await userEvent.click(starsAfter[starsAfter.length - 1]);
    expect(screen.getByRole('alert')).toHaveTextContent(/only one wishlist card/i);
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: cardA.id });
  });

  it('clicking a card body opens the condition picker, and confirming marks it owned and closes', async () => {
    const onClose = vi.fn();
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={onClose} />);
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(screen.getByText(/what condition/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Near Mint' }));
    expect(useAppStore.getState().owned[6]).toMatchObject({ cardId: cardA.id, condition: 'Near Mint' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run the test to see it fail**

Run:
```bash
npm run test -- Picker.test
```
Expected: FAIL, `Cannot find module './Picker'`.

- [ ] **Step 6: Write `src/components/Picker.tsx`**

```tsx
import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import { useAppStore } from '../state/store';
import type { CardRecord, Condition } from '../types';
import { ConditionPicker } from './ConditionPicker';
import styles from './Picker.module.css';

export interface PickerProps {
  dexNumber: number;
  pokemonName: string;
  cards: CardRecord[];
  onClose: () => void;
}

export function Picker({ dexNumber, pokemonName, cards, onClose }: PickerProps) {
  const owned = useAppStore((s) => s.owned[dexNumber]);
  const wishlist = useAppStore((s) => s.wishlist[dexNumber]);
  const markOwned = useAppStore((s) => s.markOwned);
  const unmarkOwned = useAppStore((s) => s.unmarkOwned);
  const toggleWishlist = useAppStore((s) => s.toggleWishlist);

  const [pendingCard, setPendingCard] = useState<CardRecord | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleStarClick(card: CardRecord, event: React.MouseEvent) {
    event.stopPropagation();
    const result = toggleWishlist(dexNumber, card.id);
    setWarning(result.ok ? null : (result.reason ?? 'That card could not be added.'));
  }

  function handleConditionConfirm(condition: Condition) {
    if (!pendingCard) return;
    markOwned(dexNumber, pendingCard.id, condition);
    setPendingCard(null);
    onClose();
  }

  if (pendingCard) {
    return (
      <div
        className={styles.overlay}
        role="dialog"
        aria-label={`Choose condition for ${pendingCard.name}`}
      >
        <div className={styles.panel}>
          <ConditionPicker
            cardName={pendingCard.name}
            onConfirm={handleConditionConfirm}
            onCancel={() => setPendingCard(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label={`Card options for ${pokemonName}`}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>{pokemonName}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {owned && (
          <button type="button" className={styles.unmark} onClick={() => unmarkOwned(dexNumber)}>
            Remove owned card
          </button>
        )}
        {warning && (
          <p role="alert" className={styles.warning}>
            {warning}
          </p>
        )}
        {cards.length === 0 ? (
          <p>No special or full art cards match your current filters for {pokemonName} yet.</p>
        ) : (
          <div className={styles.grid}>
            {cards.map((card) => {
              const isOwned = owned?.cardId === card.id;
              const isWishlisted = wishlist?.cardId === card.id;
              return (
                <div key={card.id} className={styles.card}>
                  <button
                    type="button"
                    className={styles.star}
                    aria-label={
                      isWishlisted
                        ? `Remove ${card.name} from wishlist`
                        : `Add ${card.name} to wishlist`
                    }
                    aria-pressed={isWishlisted}
                    onClick={(event) => handleStarClick(card, event)}
                  >
                    {isWishlisted ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    className={isOwned ? styles.cardBodySelected : styles.cardBody}
                    onClick={() => setPendingCard(card)}
                  >
                    <img
                      src={cardImageUrl(card.imageBase)}
                      alt={`${card.name} from ${card.setName}`}
                    />
                    <span>
                      {card.setName} #{card.localId}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the test to see it pass**

Run:
```bash
npm run test -- Picker.test
```
Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add src/components/ConditionPicker.tsx src/components/ConditionPicker.module.css src/components/Picker.tsx src/components/Picker.module.css src/components/Picker.test.tsx
git commit -m "Add card picker with wishlist star and condition selection"
```

---

## Task 15.5: Generation registry

> **New task**, inserted after Tasks 1-10 shipped, to support a multi-select "which generations do you collect" filter (Task 17) while keeping the codebase easy to extend to Gen 2+ later. This task is purely additive: it does not modify the already-built and already-tested `src/data/gen1Dex.ts` (Task 4) at all, it wraps it. `Array.prototype.flatMap` returns a brand-new array, and the subsequent `.sort()` runs on that new array, so `GEN1_DEX` itself and its element order are never mutated. Task 4's existing tests remain valid and untouched.
>
> Only Generation 1 is populated with real data here. Adding Generation 2 or later, once someone has hand-verified that generation's dex list the way Task 4 did for Gen 1, is meant to be a pure data change to the `GENERATIONS` array below; no other file in this task needs to change for that to work.

**Files:**
- Create: `src/data/generations.ts`
- Test: `src/data/generations.test.ts`

- [ ] **Step 1: Write the failing test `src/data/generations.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { GENERATIONS, allDexEntries, entriesForGenerations } from './generations';
import { GEN1_DEX } from './gen1Dex';

describe('GENERATIONS', () => {
  it('includes Generation 1 backed by GEN1_DEX, unmodified', () => {
    const gen1 = GENERATIONS.find((g) => g.id === 1);
    expect(gen1?.entries).toEqual(GEN1_DEX);
  });

  it('does not mutate GEN1_DEX when entriesForGenerations sorts its result', () => {
    const before = [...GEN1_DEX];
    entriesForGenerations([1]);
    expect(GEN1_DEX).toEqual(before);
  });
});

describe('entriesForGenerations', () => {
  it('returns entries only for the requested generation ids, sorted by dex number', () => {
    const entries = entriesForGenerations([1]);
    expect(entries).toHaveLength(151);
    expect(entries[0].name).toBe('Bulbasaur');
    expect(entries[150].name).toBe('Mew');
  });

  it('returns an empty list when no generation ids are requested', () => {
    expect(entriesForGenerations([])).toEqual([]);
  });

  it('ignores unknown generation ids rather than throwing', () => {
    expect(entriesForGenerations([999])).toEqual([]);
  });
});

describe('allDexEntries', () => {
  it('returns every entry across every known generation, sorted by dex number', () => {
    const entries = allDexEntries();
    expect(entries).toHaveLength(151);
    expect(entries[0].name).toBe('Bulbasaur');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- generations
```
Expected: FAIL, `Cannot find module './generations'`.

- [ ] **Step 3: Write `src/data/generations.ts`**

```ts
import { GEN1_DEX, type DexEntry } from './gen1Dex';

export interface Generation {
  id: number;
  label: string;
  entries: DexEntry[];
}

// When adding a new generation here, also update README.md's "Gen 1 (Kanto,
// #001-151)" / "All 151 Gen 1 Pokemon" language (that file was written when
// this app only ever covered Gen 1). Nothing in src/App.tsx needs touching
// for a new generation: its header is generation-neutral ("Pokemon Card
// Collector"), not "Gen 1 Card Collector".
export const GENERATIONS: Generation[] = [{ id: 1, label: 'Generation 1 (Kanto)', entries: GEN1_DEX }];

export function entriesForGenerations(generationIds: number[]): DexEntry[] {
  return GENERATIONS.filter((g) => generationIds.includes(g.id))
    .flatMap((g) => g.entries)
    .sort((a, b) => a.number - b.number);
}

export function allDexEntries(): DexEntry[] {
  return GENERATIONS.flatMap((g) => g.entries).sort((a, b) => a.number - b.number);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- generations
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/data/generations.ts src/data/generations.test.ts
git commit -m "Add multi-generation registry wrapping the Gen 1 dex list"
```

---

## Task 16: DexGrid component

> **Amended** after Tasks 1-10 shipped, to read the generation-filtered dex list (Task 15.5) instead of a hardcoded `GEN1_DEX`, and to fix a real bug an adversarial review caught in the original auto-load logic: `hasCachedDataForLanguage(language)` (Task 9, already shipped) only knows "have I cached *anything* for this language," not *which dex numbers*. Once Gen 1 was cached, that one-shot gate would have permanently skipped auto-fetching for any generation added later, even a newly-selected one, so Gen 2+ tiles would silently sit on "unavailable" until a manual "Refresh Data" click. The fix below doesn't touch Task 9's code at all; it just uses the per-dex-number `getCachedCards` (also already in Task 9, sitting unused) instead of the coarser language-level check.

**Files:**
- Create: `src/components/DexGrid.tsx`
- Create: `src/components/DexGrid.module.css`
- Test: `src/components/DexGrid.test.tsx`

- [ ] **Step 1: Write `src/components/DexGrid.module.css`**

```css
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.viewToggle {
  display: inline-flex;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(127, 127, 127, 0.4);
}

.viewToggle button {
  padding: 6px 14px;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
}

.viewToggle button[aria-pressed='true'] {
  background: #4a9eff;
  color: white;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}

.emptyState {
  opacity: 0.7;
  padding: 24px 0;
  text-align: center;
}
```

- [ ] **Step 2: Write the failing test `src/components/DexGrid.test.tsx`**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexGrid } from './DexGrid';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return jsonResponse([
          {
            id: 'sv03.5-199',
            localId: '199',
            name: 'Charizard ex',
            image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
          },
        ]);
      }
      return jsonResponse([]);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DexGrid', () => {
  it('renders all 151 Pokemon and loads card data on mount', async () => {
    render(<DexGrid />);
    expect(screen.getByText('Bulbasaur')).toBeInTheDocument();
    expect(screen.getByText('Mew')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
  });

  it('opens the picker for a Pokemon with available cards when its tile is clicked', async () => {
    render(<DexGrid />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    await userEvent.click(screen.getByRole('button', { name: /charizard/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Charizard')).toBeInTheDocument();
  });

  it('switches between sprite and card view', async () => {
    render(<DexGrid />);
    const cardViewButton = screen.getByRole('button', { name: 'Card view' });
    await userEvent.click(cardViewButton);
    expect(cardViewButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty-state message instead of a blank grid when no generation is selected', () => {
    useAppStore.setState({ selectedGenerations: [] });
    render(<DexGrid />);
    expect(screen.getByText(/select at least one generation/i)).toBeInTheDocument();
    expect(screen.queryByText('Bulbasaur')).not.toBeInTheDocument();
  });

  it('auto-fetches a newly-selected generation even when this language was already cached for a different one', async () => {
    render(<DexGrid />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    const fetchCallsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    // Re-selecting the same generation should not trigger another fetch, since
    // every dex number in it is already cached for this language.
    useAppStore.setState({ selectedGenerations: [1] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run:
```bash
npm run test -- DexGrid.test
```
Expected: FAIL, `Cannot find module './DexGrid'`.

- [ ] **Step 4: Write `src/components/DexGrid.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { spriteUrl } from '../api/pokeapi';
import { cardImageUrl } from '../api/tcgdex';
import { entriesForGenerations } from '../data/generations';
import { getAllCachedCardsForDex, loadAllCardData } from '../state/loadCardData';
import { activeRarities, availableCardsForDex, computeTileState } from '../state/selectors';
import { useAppStore } from '../state/store';
import { getCachedCards } from '../storage/cardCache';
import { Picker } from './Picker';
import { Tile } from './Tile';
import styles from './DexGrid.module.css';

export function DexGrid() {
  const language = useAppStore((s) => s.language);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const owned = useAppStore((s) => s.owned);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);

  const [view, setView] = useState<'sprite' | 'card'>('sprite');
  const [openDexNumber, setOpenDexNumber] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  // Memoized so the array reference is stable across renders that don't
  // change selectedGenerations, and reused below by the auto-load effect,
  // the tile map, and the openEntry lookup, instead of recomputing the
  // filter/flatMap/sort at up to three separate call sites per render.
  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  useEffect(() => {
    if (dexEntries.length === 0) return;
    // Per-dex-number check, not a per-language one: this is what makes a
    // newly-selected generation get auto-fetched even after this language
    // was already cached for a previously-selected generation.
    const missingEntries = dexEntries.filter(
      (entry) => getCachedCards(language, entry.number) === undefined
    );
    if (missingEntries.length === 0) return;
    setIsLoading(true);
    loadAllCardData(language, { dexEntries: missingEntries }).finally(() => {
      setIsLoading(false);
      setDataVersion((v) => v + 1);
    });
  }, [language, dexEntries]);

  async function handleRefreshData() {
    setIsLoading(true);
    await loadAllCardData(language, { dexEntries });
    setIsLoading(false);
    setDataVersion((v) => v + 1);
  }

  const activeSet = useMemo(
    () => activeRarities(groups, activeGroupIds),
    [groups, activeGroupIds]
  );

  const openEntry = openDexNumber ? dexEntries.find((e) => e.number === openDexNumber) : undefined;
  const openCards = openDexNumber
    ? availableCardsForDex(getAllCachedCardsForDex(language, openDexNumber), activeSet)
    : [];

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.viewToggle} role="radiogroup" aria-label="View">
          <button type="button" aria-pressed={view === 'sprite'} onClick={() => setView('sprite')}>
            Sprite view
          </button>
          <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')}>
            Card view
          </button>
        </div>
        <button type="button" onClick={handleRefreshData} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      {dexEntries.length === 0 ? (
        <p className={styles.emptyState}>
          Select at least one generation in the filter bar to see Pokemon here.
        </p>
      ) : (
        <div className={styles.grid} data-version={dataVersion}>
          {dexEntries.map((entry) => {
            const allCards = getAllCachedCardsForDex(language, entry.number);
            const cards = availableCardsForDex(allCards, activeSet);
            const ownedRecord = owned[entry.number];
            const state = computeTileState(Boolean(ownedRecord), cards.length);
            const ownedCard = ownedRecord
              ? allCards.find((c) => c.id === ownedRecord.cardId)
              : undefined;
            return (
              <Tile
                key={entry.number}
                dexNumber={entry.number}
                name={entry.name}
                spriteUrl={spriteUrl(entry.number)}
                state={state}
                view={view}
                ownedCardImageUrl={ownedCard ? cardImageUrl(ownedCard.imageBase) : undefined}
                onClick={() => setOpenDexNumber(entry.number)}
              />
            );
          })}
        </div>
      )}
      {openEntry && (
        <Picker
          dexNumber={openEntry.number}
          pokemonName={openEntry.name}
          cards={openCards}
          onClose={() => setOpenDexNumber(null)}
        />
      )}
    </div>
  );
}
```

`handleRefreshData` intentionally still refetches the entire current selection, not just missing entries: a manual "Refresh Data" click should re-pull everything currently shown (e.g. to pick up newly-released cards for Pokemon that were already cached), unlike the passive auto-load effect above, which only needs to fill genuine gaps.

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- DexGrid.test
```
Expected: 5 passed. (The first test still makes roughly 2,000 mocked fetch calls per run, since Gen 1 alone is 151 dex numbers across 13 rarity tiers; it still completes in a few seconds because no real network I/O happens.)

- [ ] **Step 6: Commit**

```bash
git add src/components/DexGrid.tsx src/components/DexGrid.module.css src/components/DexGrid.test.tsx
git commit -m "Add DexGrid wiring tiles, data loading, and the picker"
```

---

## Task 17: Filter bar and Manage Groups panel

> **Amended** after Tasks 1-10 shipped, to add a "Generations" multi-select control to the filter bar (Step 9/10 below), sourced from the Task 15.5 generation registry. `ManageGroupsPanel` itself is unaffected by this change (its own resetStore below just gets the two new store fields added for fixture-consistency with the rest of the plan).

**Files:**
- Create: `src/components/ManageGroupsPanel.tsx`
- Create: `src/components/ManageGroupsPanel.module.css`
- Create: `src/components/FilterBar.tsx`
- Create: `src/components/FilterBar.module.css`
- Test: `src/components/ManageGroupsPanel.test.tsx`
- Test: `src/components/FilterBar.test.tsx`

- [ ] **Step 1: Write `src/components/ManageGroupsPanel.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.panel {
  background: var(--panel-bg, #fff);
  color: var(--panel-fg, #111);
  border-radius: 16px;
  padding: 20px;
  max-width: 480px;
  width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.groupList,
.rarityList {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.groupList li,
.rarityList li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 2: Write the failing test `src/components/ManageGroupsPanel.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

function resetStore() {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  resetStore();
});

describe('ManageGroupsPanel', () => {
  it('renames a group and saves it to the store', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const nameInputs = screen.getAllByLabelText('Group name');
    await userEvent.clear(nameInputs[0]);
    await userEvent.type(nameInputs[0], 'Renamed Group');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups[0].name).toBe('Renamed Group');
  });

  it('moves a rarity tier to a different group and saves it', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const select = screen.getByLabelText('Group for Ultra Rare');
    await userEvent.selectOptions(select, 'rainbow-gold');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const saved = useAppStore.getState().groups;
    expect(saved.find((g) => g.id === 'full-art')?.rarities).not.toContain('Ultra Rare');
    expect(saved.find((g) => g.id === 'rainbow-gold')?.rarities).toContain('Ultra Rare');
  });

  it('adds a new group', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(screen.getAllByLabelText('Group name')).toHaveLength(5);
  });

  it('deletes a group, leaving its rarities unassigned', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete group' });
    await userEvent.click(deleteButtons[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run:
```bash
npm run test -- ManageGroupsPanel.test
```
Expected: FAIL, `Cannot find module './ManageGroupsPanel'`.

- [ ] **Step 4: Write `src/components/ManageGroupsPanel.tsx`**

```tsx
import { useState } from 'react';
import { fetchRarityList } from '../data/defaultRarityGroups';
import { useAppStore } from '../state/store';
import type { RarityGroup } from '../types';
import styles from './ManageGroupsPanel.module.css';

export interface ManageGroupsPanelProps {
  onClose: () => void;
}

const UNASSIGNED = 'unassigned';

export function ManageGroupsPanel({ onClose }: ManageGroupsPanelProps) {
  const groups = useAppStore((s) => s.groups);
  const setGroups = useAppStore((s) => s.setGroups);
  const [localGroups, setLocalGroups] = useState<RarityGroup[]>(groups);

  const allRarities = fetchRarityList(groups);

  function groupIdForRarity(rarity: string): string {
    const found = localGroups.find((g) => g.rarities.includes(rarity));
    return found ? found.id : UNASSIGNED;
  }

  function moveRarity(rarity: string, targetGroupId: string) {
    setLocalGroups((prev) =>
      prev.map((group) => {
        const withoutRarity = group.rarities.filter((r) => r !== rarity);
        if (group.id === targetGroupId) {
          return { ...group, rarities: [...withoutRarity, rarity] };
        }
        return { ...group, rarities: withoutRarity };
      })
    );
  }

  function renameGroup(groupId: string, name: string) {
    setLocalGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }

  function addGroup() {
    const id = `custom-${localGroups.length}-${localGroups.map((g) => g.id).join('')}`;
    setLocalGroups((prev) => [...prev, { id, name: 'New Group', rarities: [] }]);
  }

  function deleteGroup(groupId: string) {
    setLocalGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleSave() {
    setGroups(localGroups);
    onClose();
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="Manage rarity groups">
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>Manage groups</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <ul className={styles.groupList}>
          {localGroups.map((group) => (
            <li key={group.id}>
              <input
                aria-label="Group name"
                value={group.name}
                onChange={(e) => renameGroup(group.id, e.target.value)}
              />
              <button type="button" onClick={() => deleteGroup(group.id)}>
                Delete group
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addGroup}>
          Add group
        </button>
        <ul className={styles.rarityList}>
          {allRarities.map((rarity) => (
            <li key={rarity}>
              <span>{rarity}</span>
              <select
                aria-label={`Group for ${rarity}`}
                value={groupIdForRarity(rarity)}
                onChange={(e) => moveRarity(rarity, e.target.value)}
              >
                <option value={UNASSIGNED}>Unassigned</option>
                {localGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <button type="button" onClick={handleSave}>
          Save changes
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- ManageGroupsPanel.test
```
Expected: 4 passed.

- [ ] **Step 6: Write `src/components/FilterBar.module.css`**

```css
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
}

.groupFilters,
.generationFilters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  border: none;
}
```

- [ ] **Step 7: Write the failing test `src/components/FilterBar.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FilterBar } from './FilterBar';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

function resetStore() {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  resetStore();
});

describe('FilterBar', () => {
  it('toggles a rarity group off and on', async () => {
    render(<FilterBar />);
    const checkbox = screen.getByLabelText('Full Art');
    await userEvent.click(checkbox);
    expect(useAppStore.getState().activeGroupIds).not.toContain('full-art');
    await userEvent.click(checkbox);
    expect(useAppStore.getState().activeGroupIds).toContain('full-art');
  });

  it('changes the language', async () => {
    render(<FilterBar />);
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'ja');
    expect(useAppStore.getState().language).toBe('ja');
  });

  it('changes the currency', async () => {
    render(<FilterBar />);
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'AUD');
    expect(useAppStore.getState().currency).toBe('AUD');
  });

  it('opens the Manage Groups panel', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage groups' }));
    expect(screen.getByRole('dialog', { name: 'Manage rarity groups' })).toBeInTheDocument();
  });

  it('toggles a generation off and on', async () => {
    render(<FilterBar />);
    const checkbox = screen.getByLabelText('Generation 1 (Kanto)');
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(useAppStore.getState().selectedGenerations).not.toContain(1);
    await userEvent.click(checkbox);
    expect(useAppStore.getState().selectedGenerations).toContain(1);
  });
});
```

- [ ] **Step 8: Run the test to see it fail**

Run:
```bash
npm run test -- FilterBar.test
```
Expected: FAIL, `Cannot find module './FilterBar'`.

- [ ] **Step 9: Write `src/components/FilterBar.tsx`**

```tsx
import { useState } from 'react';
import { GENERATIONS } from '../data/generations';
import { CURRENCIES, SUPPORTED_LANGUAGES, type Currency } from '../types';
import { useAppStore } from '../state/store';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import styles from './FilterBar.module.css';

export function FilterBar() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const toggleActiveGroup = useAppStore((s) => s.toggleActiveGroup);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const toggleGeneration = useAppStore((s) => s.toggleGeneration);

  const [showManageGroups, setShowManageGroups] = useState(false);

  return (
    <div className={styles.bar}>
      <fieldset className={styles.generationFilters}>
        <legend>Generations</legend>
        {GENERATIONS.map((generation) => (
          <label key={generation.id}>
            <input
              type="checkbox"
              checked={selectedGenerations.includes(generation.id)}
              onChange={() => toggleGeneration(generation.id)}
            />
            {generation.label}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.groupFilters}>
        <legend>Card rarity groups</legend>
        {groups.map((group) => (
          <label key={group.id}>
            <input
              type="checkbox"
              checked={activeGroupIds.includes(group.id)}
              onChange={() => toggleActiveGroup(group.id)}
            />
            {group.name}
          </label>
        ))}
        <button type="button" onClick={() => setShowManageGroups(true)}>
          Manage groups
        </button>
      </fieldset>

      <label>
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Currency
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {showManageGroups && <ManageGroupsPanel onClose={() => setShowManageGroups(false)} />}
    </div>
  );
}
```

- [ ] **Step 10: Run the test to see it pass**

Run:
```bash
npm run test -- FilterBar.test
```
Expected: 5 passed.

- [ ] **Step 11: Commit**

```bash
git add src/components/ManageGroupsPanel.tsx src/components/ManageGroupsPanel.module.css src/components/ManageGroupsPanel.test.tsx src/components/FilterBar.tsx src/components/FilterBar.module.css src/components/FilterBar.test.tsx
git commit -m "Add filter bar with rarity group, language, and currency controls"
```

---

## Task 18: Pricing fetch and currency display

**Files:**
- Create: `src/state/loadPricing.ts`
- Create: `src/state/priceDisplay.ts`
- Test: `src/state/loadPricing.test.ts`
- Test: `src/state/priceDisplay.test.ts`

- [ ] **Step 1: Write the failing test `src/state/loadPricing.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshMarketPrices } from './loadPricing';
import { getCachedPricing } from '../storage/cardCache';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe('refreshMarketPrices', () => {
  it('fetches pricing only for owned and wishlisted card ids, deduplicated', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'sv03.5-199',
        localId: '199',
        name: 'Charizard ex',
        set: { id: 'sv03.5', name: '151' },
        pricing: { cardmarket: { avg: 372.8 }, tcgplayer: { 'unlimited-holofoil': { marketPrice: 699.99 } } },
      })
    );

    await refreshMarketPrices(
      'en',
      { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
      { 1: { dexNumber: 1, cardId: 'sv03.5-199', addedAt: '' } },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const cached = getCachedPricing('sv03.5-199');
    expect(cached).toMatchObject({ cardmarketEurAvg: 372.8, tcgplayerUsdMarket: 699.99 });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- loadPricing
```
Expected: FAIL, `Cannot find module './loadPricing'`.

- [ ] **Step 3: Write `src/state/loadPricing.ts`**

```ts
import { extractCardmarketAvgPrice, extractTcgplayerMarketPrice, fetchCardDetail } from '../api/tcgdex';
import { setCachedPricing } from '../storage/cardCache';
import type { CardPricing, OwnedRecord, WishlistRecord } from '../types';

export async function refreshMarketPrices(
  language: string,
  owned: Record<number, OwnedRecord>,
  wishlist: Record<number, WishlistRecord>,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const cardIds = new Set<string>();
  Object.values(owned).forEach((record) => cardIds.add(record.cardId));
  Object.values(wishlist).forEach((record) => cardIds.add(record.cardId));

  for (const cardId of cardIds) {
    const detail = await fetchCardDetail(cardId, language, fetchImpl);
    const pricing: CardPricing = {
      cardId,
      cardmarketEurAvg: extractCardmarketAvgPrice(detail.pricing),
      tcgplayerUsdMarket: extractTcgplayerMarketPrice(detail.pricing),
      fetchedAt: new Date().toISOString(),
    };
    setCachedPricing(cardId, pricing);
  }
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- loadPricing
```
Expected: 1 passed.

- [ ] **Step 5: Write the failing test `src/state/priceDisplay.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { convertViaUsdPivot, fetchUsdPivotRates, priceInCurrency } from './priceDisplay';
import type { CardPricing } from '../types';

const pricing: CardPricing = {
  cardId: 'sv03.5-199',
  cardmarketEurAvg: 100,
  tcgplayerUsdMarket: 200,
  fetchedAt: '2026-07-09T00:00:00.000Z',
};

const usdRates = { USD: 1, EUR: 0.87451, AUD: 1.441, GBP: 0.75, CAD: 1.35 };

describe('convertViaUsdPivot', () => {
  it('returns the amount unchanged when currencies match', () => {
    expect(convertViaUsdPivot(100, 'USD', 'USD', usdRates)).toBe(100);
  });

  it('converts USD directly using the target rate', () => {
    expect(convertViaUsdPivot(200, 'USD', 'AUD', usdRates)).toBe(288.2);
  });

  it('converts EUR by pivoting through USD', () => {
    const result = convertViaUsdPivot(100, 'EUR', 'AUD', usdRates);
    expect(result).toBeCloseTo(164.79, 1);
  });

  it('returns null when the target rate is missing', () => {
    expect(convertViaUsdPivot(100, 'USD', 'AUD', { USD: 1 })).toBeNull();
  });
});

describe('priceInCurrency', () => {
  it('returns the native cardmarket price unconverted when target is EUR', () => {
    const result = priceInCurrency(pricing, 'cardmarket', 'EUR', usdRates);
    expect(result).toEqual({ amount: 100, currency: 'EUR', isConverted: false });
  });

  it('returns the native tcgplayer price unconverted when target is USD', () => {
    const result = priceInCurrency(pricing, 'tcgplayer', 'USD', usdRates);
    expect(result).toEqual({ amount: 200, currency: 'USD', isConverted: false });
  });

  it('converts tcgplayer USD price to a non-native currency', () => {
    const result = priceInCurrency(pricing, 'tcgplayer', 'AUD', usdRates);
    expect(result.isConverted).toBe(true);
    expect(result.amount).toBe(288.2);
  });

  it('returns a null amount when there is no pricing for that source', () => {
    const result = priceInCurrency(undefined, 'cardmarket', 'EUR', usdRates);
    expect(result.amount).toBeNull();
  });
});

describe('fetchUsdPivotRates', () => {
  it('requests USD-based rates and includes USD itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ amount: 1, base: 'USD', date: '2026-07-09', rates: { EUR: 0.87451, AUD: 1.441, GBP: 0.75, CAD: 1.35 } }),
    } as unknown as Response);
    const rates = await fetchUsdPivotRates(fetchImpl);
    expect(rates.USD).toBe(1);
    expect(rates.AUD).toBe(1.441);
  });
});
```

- [ ] **Step 6: Run the test to see it fail**

Run:
```bash
npm run test -- priceDisplay
```
Expected: FAIL, `Cannot find module './priceDisplay'`.

- [ ] **Step 7: Write `src/state/priceDisplay.ts`**

```ts
import { convertAmount, fetchRates } from '../api/fx';
import type { CardPricing, Currency } from '../types';

export interface PriceDisplayResult {
  amount: number | null;
  currency: Currency;
  isConverted: boolean;
}

export async function fetchUsdPivotRates(
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, number>> {
  const result = await fetchRates('USD', ['EUR', 'AUD', 'GBP', 'CAD'], fetchImpl);
  return { USD: 1, ...result.rates };
}

export function convertViaUsdPivot(
  amount: number,
  nativeCurrency: 'USD' | 'EUR',
  targetCurrency: Currency,
  usdRates: Record<string, number>
): number | null {
  if (nativeCurrency === targetCurrency) {
    return amount;
  }
  const eurPerUsd = usdRates.EUR;
  const usdAmount = nativeCurrency === 'USD' ? amount : eurPerUsd ? amount / eurPerUsd : null;
  if (usdAmount === null) return null;
  const targetPerUsd = usdRates[targetCurrency];
  if (targetPerUsd === undefined) return null;
  return convertAmount(usdAmount, targetPerUsd);
}

export function priceInCurrency(
  pricing: CardPricing | undefined,
  source: 'cardmarket' | 'tcgplayer',
  targetCurrency: Currency,
  usdRates: Record<string, number> | undefined
): PriceDisplayResult {
  const nativeAmount =
    source === 'cardmarket' ? (pricing?.cardmarketEurAvg ?? null) : (pricing?.tcgplayerUsdMarket ?? null);
  const nativeCurrency: 'USD' | 'EUR' = source === 'cardmarket' ? 'EUR' : 'USD';

  if (nativeAmount === null) {
    return { amount: null, currency: targetCurrency, isConverted: false };
  }
  if (nativeCurrency === targetCurrency) {
    return { amount: nativeAmount, currency: targetCurrency, isConverted: false };
  }
  if (!usdRates) {
    return { amount: null, currency: targetCurrency, isConverted: false };
  }
  const converted = convertViaUsdPivot(nativeAmount, nativeCurrency, targetCurrency, usdRates);
  return { amount: converted, currency: targetCurrency, isConverted: converted !== null };
}
```

- [ ] **Step 8: Run the test to see it pass**

Run:
```bash
npm run test -- priceDisplay
```
Expected: 9 passed.

- [ ] **Step 9: Commit**

```bash
git add src/state/loadPricing.ts src/state/loadPricing.test.ts src/state/priceDisplay.ts src/state/priceDisplay.test.ts
git commit -m "Add market price fetching and currency conversion for display"
```

---

## Task 19: Collection/wishlist row selectors and a shared USD rates hook

> **Amended** after Tasks 1-10 shipped: `pokemonName` now looks up names across every known generation (Task 15.5's `allDexEntries()`), not just Gen 1, so an owned or wishlisted Pokemon's name keeps resolving correctly even if the user later deselects its generation in the filter bar.

**Files:**
- Create: `src/state/collectionSelectors.ts`
- Create: `src/state/useUsdRates.ts`
- Test: `src/state/collectionSelectors.test.ts`

- [ ] **Step 1: Write the failing test `src/state/collectionSelectors.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCollectionRows, buildWishlistRows, sortRows } from './collectionSelectors';
import { setCachedCards, setCachedPricing } from '../storage/cardCache';
import type { CardRecord, OwnedRecord, WishlistRecord } from '../types';

const card: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

beforeEach(() => {
  localStorage.clear();
  setCachedCards('en', 6, [card]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 699.99,
    fetchedAt: '2026-07-09T00:00:00.000Z',
  });
});

describe('buildCollectionRows', () => {
  it('joins owned records with card data, name, and pricing', () => {
    const owned: Record<number, OwnedRecord> = {
      6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
    };
    const rows = buildCollectionRows('en', owned);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dexNumber: 6,
      pokemonName: 'Charizard',
      condition: 'Near Mint',
      cardmarketEurAvg: 372.8,
      tcgplayerUsdMarket: 699.99,
    });
    expect(rows[0].card?.id).toBe('sv03.5-199');
  });
});

describe('buildWishlistRows', () => {
  it('joins wishlist records with card data and pricing', () => {
    const wishlist: Record<number, WishlistRecord> = {
      6: { dexNumber: 6, cardId: 'sv03.5-199', addedAt: '' },
    };
    const rows = buildWishlistRows('en', wishlist);
    expect(rows).toHaveLength(1);
    expect(rows[0].pokemonName).toBe('Charizard');
    expect(rows[0].tcgplayerUsdMarket).toBe(699.99);
  });
});

describe('sortRows', () => {
  const rows = [
    { dexNumber: 25, pokemonName: 'Pikachu' },
    { dexNumber: 6, pokemonName: 'Charizard' },
  ];

  it('sorts ascending by dex number', () => {
    const sorted = sortRows(rows, 'dexNumber', 'asc', () => null);
    expect(sorted.map((r) => r.dexNumber)).toEqual([6, 25]);
  });

  it('sorts descending by dex number', () => {
    const sorted = sortRows(rows, 'dexNumber', 'desc', () => null);
    expect(sorted.map((r) => r.dexNumber)).toEqual([25, 6]);
  });

  it('sorts alphabetically by name', () => {
    const sorted = sortRows(rows, 'name', 'asc', () => null);
    expect(sorted.map((r) => r.pokemonName)).toEqual(['Charizard', 'Pikachu']);
  });

  it('sorts by a price accessor', () => {
    const prices: Record<number, number> = { 25: 50, 6: 500 };
    const sorted = sortRows(rows, 'price', 'desc', (row) => prices[row.dexNumber]);
    expect(sorted.map((r) => r.dexNumber)).toEqual([6, 25]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- collectionSelectors
```
Expected: FAIL, `Cannot find module './collectionSelectors'`.

- [ ] **Step 3: Write `src/state/collectionSelectors.ts`**

```ts
import { allDexEntries } from '../data/generations';
import { getAllCachedCardsForDex } from './loadCardData';
import { getCachedPricing } from '../storage/cardCache';
import type { CardRecord, Condition, OwnedRecord, WishlistRecord } from '../types';

// Computed once at module load: GENERATIONS is a static registry, not runtime
// state, so this doesn't need to be recomputed per call or memoized in a hook.
const ALL_DEX_ENTRIES = allDexEntries();

export interface CollectionRow {
  dexNumber: number;
  pokemonName: string;
  card: CardRecord | undefined;
  condition: Condition;
  cardmarketEurAvg: number | null;
  tcgplayerUsdMarket: number | null;
}

export interface WishlistRow {
  dexNumber: number;
  pokemonName: string;
  card: CardRecord | undefined;
  cardmarketEurAvg: number | null;
  tcgplayerUsdMarket: number | null;
}

function pokemonName(dexNumber: number): string {
  return ALL_DEX_ENTRIES.find((entry) => entry.number === dexNumber)?.name ?? `#${dexNumber}`;
}

function findCard(language: string, dexNumber: number, cardId: string): CardRecord | undefined {
  return getAllCachedCardsForDex(language, dexNumber).find((c) => c.id === cardId);
}

export function buildCollectionRows(
  language: string,
  owned: Record<number, OwnedRecord>
): CollectionRow[] {
  return Object.values(owned).map((record) => {
    const pricing = getCachedPricing(record.cardId);
    return {
      dexNumber: record.dexNumber,
      pokemonName: pokemonName(record.dexNumber),
      card: findCard(language, record.dexNumber, record.cardId),
      condition: record.condition,
      cardmarketEurAvg: pricing?.cardmarketEurAvg ?? null,
      tcgplayerUsdMarket: pricing?.tcgplayerUsdMarket ?? null,
    };
  });
}

export function buildWishlistRows(
  language: string,
  wishlist: Record<number, WishlistRecord>
): WishlistRow[] {
  return Object.values(wishlist).map((record) => {
    const pricing = getCachedPricing(record.cardId);
    return {
      dexNumber: record.dexNumber,
      pokemonName: pokemonName(record.dexNumber),
      card: findCard(language, record.dexNumber, record.cardId),
      cardmarketEurAvg: pricing?.cardmarketEurAvg ?? null,
      tcgplayerUsdMarket: pricing?.tcgplayerUsdMarket ?? null,
    };
  });
}

export type SortKey = 'dexNumber' | 'name' | 'price';
export type SortDirection = 'asc' | 'desc';

export function sortRows<T extends { dexNumber: number; pokemonName: string }>(
  rows: T[],
  key: SortKey,
  direction: SortDirection,
  priceOf: (row: T) => number | null
): T[] {
  const sorted = [...rows].sort((a, b) => {
    if (key === 'dexNumber') return a.dexNumber - b.dexNumber;
    if (key === 'name') return a.pokemonName.localeCompare(b.pokemonName);
    const priceA = priceOf(a) ?? -Infinity;
    const priceB = priceOf(b) ?? -Infinity;
    return priceA - priceB;
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- collectionSelectors
```
Expected: 6 passed.

- [ ] **Step 5: Write `src/state/useUsdRates.ts`**

```ts
import { useEffect, useState } from 'react';
import { fetchUsdPivotRates } from './priceDisplay';

export function useUsdRates(): Record<string, number> | undefined {
  const [rates, setRates] = useState<Record<string, number> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchUsdPivotRates().then((result) => {
      if (!cancelled) setRates(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return rates;
}
```

(This hook is exercised indirectly through the component tests in the next task, which mock `fetch`.)

- [ ] **Step 6: Commit**

```bash
git add src/state/collectionSelectors.ts src/state/collectionSelectors.test.ts src/state/useUsdRates.ts
git commit -m "Add collection/wishlist row selectors and a USD rates hook"
```

---

## Task 20: Collection and Wishlist tables

**Files:**
- Create: `src/components/CollectionTable.tsx`
- Create: `src/components/WishlistTable.tsx`
- Create: `src/components/DataTable.module.css`
- Test: `src/components/CollectionTable.test.tsx`
- Test: `src/components/WishlistTable.test.tsx`

- [ ] **Step 1: Write `src/components/DataTable.module.css`**

```css
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
  font-size: 13px;
}

.table th button {
  background: none;
  border: none;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.empty {
  opacity: 0.7;
}
```

- [ ] **Step 2: Write the failing test `src/components/CollectionTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionTable } from './CollectionTable';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards, setCachedPricing } from '../storage/cardCache';
import type { CardRecord } from '../types';

const charizardCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const pikachuCard: CardRecord = {
  id: 'swsh35-74',
  name: 'Pikachu VMAX',
  dexNumber: 25,
  setId: 'swsh35',
  setName: "Champion's Path",
  localId: '74',
  rarity: 'Ultra Rare',
  imageBase: 'https://assets.tcgdex.net/en/swsh/swsh35/74',
  language: 'en',
};

beforeEach(() => {
  localStorage.clear();
  setCachedCards('en', 6, [charizardCard]);
  setCachedCards('en', 25, [pikachuCard]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 200,
    fetchedAt: '',
  });
  setCachedPricing('swsh35-74', {
    cardId: 'swsh35-74',
    cardmarketEurAvg: 100,
    tcgplayerUsdMarket: 500,
    fetchedAt: '',
  });
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {
      6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
      25: { dexNumber: 25, cardId: 'swsh35-74', condition: 'Mint', addedAt: '' },
    },
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ amount: 1, base: 'USD', date: '', rates: { EUR: 0.87, AUD: 1.44, GBP: 0.75, CAD: 1.35 } }),
    })
  );
});

describe('CollectionTable', () => {
  it('shows a row per owned card with its condition', async () => {
    render(<CollectionTable />);
    expect(await screen.findByText('Charizard')).toBeInTheDocument();
    expect(screen.getByText('Pikachu')).toBeInTheDocument();
    expect(screen.getByText('Near Mint')).toBeInTheDocument();
    expect(screen.getByText('Mint')).toBeInTheDocument();
  });

  it('sorts by price when the Price header is clicked', async () => {
    render(<CollectionTable />);
    await screen.findByText('Charizard');
    await userEvent.click(screen.getByRole('button', { name: 'Price' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Charizard');
  });

  it('removes a row when Remove is clicked', async () => {
    render(<CollectionTable />);
    await screen.findByText('Charizard');
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[0]);
    expect(Object.keys(useAppStore.getState().owned)).toHaveLength(1);
  });

  it('shows an empty state when nothing is owned', () => {
    useAppStore.setState({ owned: {} });
    render(<CollectionTable />);
    expect(screen.getByText(/have not marked any cards/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run:
```bash
npm run test -- CollectionTable.test
```
Expected: FAIL, `Cannot find module './CollectionTable'`.

- [ ] **Step 4: Write `src/components/CollectionTable.tsx`**

```tsx
import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import {
  buildCollectionRows,
  sortRows,
  type CollectionRow,
  type SortDirection,
  type SortKey,
} from '../state/collectionSelectors';
import { priceInCurrency } from '../state/priceDisplay';
import { useAppStore } from '../state/store';
import { useUsdRates } from '../state/useUsdRates';
import styles from './DataTable.module.css';

export function CollectionTable() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const owned = useAppStore((s) => s.owned);
  const unmarkOwned = useAppStore((s) => s.unmarkOwned);
  // Subscribing to priceVersion (bumped by Summary's "Refresh Market Prices"
  // action) forces this table to re-read the price cache after a refresh.
  useAppStore((s) => s.priceVersion);
  const usdRates = useUsdRates();

  const [sortKey, setSortKey] = useState<SortKey>('dexNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const priceSource = currency === 'EUR' ? 'cardmarket' : 'tcgplayer';

  function priceOf(row: CollectionRow): number | null {
    return priceInCurrency(
      {
        cardId: row.card?.id ?? '',
        cardmarketEurAvg: row.cardmarketEurAvg,
        tcgplayerUsdMarket: row.tcgplayerUsdMarket,
        fetchedAt: '',
      },
      priceSource,
      currency,
      usdRates
    ).amount;
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  const rows = buildCollectionRows(language, owned);

  if (rows.length === 0) {
    return <p className={styles.empty}>You have not marked any cards as owned yet.</p>;
  }

  const sortedRows = sortRows(rows, sortKey, sortDirection, priceOf);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>
            <button type="button" onClick={() => toggleSort('dexNumber')}>
              Dex #
            </button>
          </th>
          <th>
            <button type="button" onClick={() => toggleSort('name')}>
              Name
            </button>
          </th>
          <th>Card</th>
          <th>Condition</th>
          <th>
            <button type="button" onClick={() => toggleSort('price')}>
              Price
            </button>
          </th>
          <th>Remove</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => {
          const price = priceOf(row);
          return (
            <tr key={row.dexNumber}>
              <td>#{String(row.dexNumber).padStart(3, '0')}</td>
              <td>{row.pokemonName}</td>
              <td>
                {row.card && (
                  <img src={cardImageUrl(row.card.imageBase)} alt={row.card.name} width={48} />
                )}
              </td>
              <td>{row.condition}</td>
              <td>{price !== null ? `${price.toFixed(2)} ${currency}` : 'Unknown'}</td>
              <td>
                <button type="button" onClick={() => unmarkOwned(row.dexNumber)}>
                  Remove
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- CollectionTable.test
```
Expected: 4 passed.

- [ ] **Step 6: Write the failing test `src/components/WishlistTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistTable } from './WishlistTable';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards, setCachedPricing } from '../storage/cardCache';
import type { CardRecord } from '../types';

const charizardCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

beforeEach(() => {
  localStorage.clear();
  setCachedCards('en', 6, [charizardCard]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 200,
    fetchedAt: '',
  });
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
    wishlist: { 6: { dexNumber: 6, cardId: 'sv03.5-199', addedAt: '' } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ amount: 1, base: 'USD', date: '', rates: { EUR: 0.87, AUD: 1.44, GBP: 0.75, CAD: 1.35 } }),
    })
  );
});

describe('WishlistTable', () => {
  it('shows a row per wishlisted card and a running total', async () => {
    render(<WishlistTable />);
    expect(await screen.findByText('Charizard')).toBeInTheDocument();
    expect(screen.getByText(/total to complete wishlist/i)).toHaveTextContent('200.00 USD');
  });

  it('removes a wishlist entry when Remove is clicked', async () => {
    render(<WishlistTable />);
    await screen.findByText('Charizard');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(useAppStore.getState().wishlist[6]).toBeUndefined();
  });

  it('shows an empty state when the wishlist is empty', () => {
    useAppStore.setState({ wishlist: {} });
    render(<WishlistTable />);
    expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to see it fail**

Run:
```bash
npm run test -- WishlistTable.test
```
Expected: FAIL, `Cannot find module './WishlistTable'`.

- [ ] **Step 8: Write `src/components/WishlistTable.tsx`**

```tsx
import { useState } from 'react';
import { cardImageUrl } from '../api/tcgdex';
import {
  buildWishlistRows,
  sortRows,
  type SortDirection,
  type SortKey,
  type WishlistRow,
} from '../state/collectionSelectors';
import { priceInCurrency } from '../state/priceDisplay';
import { useAppStore } from '../state/store';
import { useUsdRates } from '../state/useUsdRates';
import styles from './DataTable.module.css';

export function WishlistTable() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const wishlist = useAppStore((s) => s.wishlist);
  const removeWishlist = useAppStore((s) => s.removeWishlist);
  // Subscribing to priceVersion (bumped by Summary's "Refresh Market Prices"
  // action) forces this table to re-read the price cache after a refresh.
  useAppStore((s) => s.priceVersion);
  const usdRates = useUsdRates();

  const [sortKey, setSortKey] = useState<SortKey>('dexNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const priceSource = currency === 'EUR' ? 'cardmarket' : 'tcgplayer';

  function priceOf(row: WishlistRow): number | null {
    return priceInCurrency(
      {
        cardId: row.card?.id ?? '',
        cardmarketEurAvg: row.cardmarketEurAvg,
        tcgplayerUsdMarket: row.tcgplayerUsdMarket,
        fetchedAt: '',
      },
      priceSource,
      currency,
      usdRates
    ).amount;
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  const rows = buildWishlistRows(language, wishlist);

  if (rows.length === 0) {
    return <p className={styles.empty}>Your wishlist is empty.</p>;
  }

  const sortedRows = sortRows(rows, sortKey, sortDirection, priceOf);
  const total = rows.reduce((sum, row) => sum + (priceOf(row) ?? 0), 0);

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>
              <button type="button" onClick={() => toggleSort('dexNumber')}>
                Dex #
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort('name')}>
                Name
              </button>
            </th>
            <th>Card</th>
            <th>
              <button type="button" onClick={() => toggleSort('price')}>
                Price
              </button>
            </th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const price = priceOf(row);
            return (
              <tr key={row.dexNumber}>
                <td>#{String(row.dexNumber).padStart(3, '0')}</td>
                <td>{row.pokemonName}</td>
                <td>
                  {row.card && (
                    <img src={cardImageUrl(row.card.imageBase)} alt={row.card.name} width={48} />
                  )}
                </td>
                <td>{price !== null ? `${price.toFixed(2)} ${currency}` : 'Unknown'}</td>
                <td>
                  <button type="button" onClick={() => removeWishlist(row.dexNumber)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>Total to complete wishlist: {total.toFixed(2)} {currency}</p>
    </>
  );
}
```

- [ ] **Step 9: Run the test to see it pass**

Run:
```bash
npm run test -- WishlistTable.test
```
Expected: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add src/components/CollectionTable.tsx src/components/WishlistTable.tsx src/components/DataTable.module.css src/components/CollectionTable.test.tsx src/components/WishlistTable.test.tsx
git commit -m "Add Collection and Wishlist tables with sorting and totals"
```

---

## Task 21: Summary tab

> **Amended** after Tasks 1-10 shipped: the "X / 151" stat and the owned-vs-available progress calculation now derive their totals from the current generation selection (Task 15.5) instead of a hardcoded `GEN1_DEX`/`151`. With the default `selectedGenerations: [1]`, this still evaluates to 151 today, so the existing test assertions are unchanged other than the fixture gaining the two new store fields.

**Files:**
- Create: `src/components/Summary.tsx`
- Create: `src/components/Summary.module.css`
- Test: `src/components/Summary.test.tsx`

- [ ] **Step 1: Write `src/components/Summary.module.css`**

```css
.summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat {
  display: flex;
  flex-direction: column;
}

.value {
  font-size: 28px;
  font-weight: 700;
}

.label {
  font-size: 12px;
  opacity: 0.7;
}

.progressBarTrack {
  height: 10px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.2);
  overflow: hidden;
}

.progressBarFill {
  height: 100%;
  background: #4a9eff;
}

.progressLabel {
  font-size: 12px;
  margin-bottom: 4px;
  opacity: 0.8;
}
```

- [ ] **Step 2: Write the failing test `src/components/Summary.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Summary } from './Summary';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards, setCachedPricing } from '../storage/cardCache';
import type { CardRecord } from '../types';

const charizardCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const pikachuCard: CardRecord = {
  id: 'swsh35-74',
  name: 'Pikachu VMAX',
  dexNumber: 25,
  setId: 'swsh35',
  setName: "Champion's Path",
  localId: '74',
  rarity: 'Ultra Rare',
  imageBase: 'https://assets.tcgdex.net/en/swsh/swsh35/74',
  language: 'en',
};

let tcgplayerPrice = 200;

beforeEach(() => {
  localStorage.clear();
  tcgplayerPrice = 200;
  setCachedCards('en', 6, [charizardCard]);
  setCachedCards('en', 25, [pikachuCard]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 200,
    fetchedAt: '',
  });
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('frankfurter')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            amount: 1,
            base: 'USD',
            date: '',
            rates: { EUR: 0.87, AUD: 1.44, GBP: 0.75, CAD: 1.35 },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'sv03.5-199',
          localId: '199',
          name: 'Charizard ex',
          set: { id: 'sv03.5', name: '151' },
          pricing: { tcgplayer: { 'unlimited-holofoil': { marketPrice: tcgplayerPrice } } },
        }),
      } as Response;
    })
  );
});

describe('Summary', () => {
  it('shows the total owned count out of 151', () => {
    render(<Summary />);
    expect(screen.getByText('1 / 151')).toBeInTheDocument();
  });

  it('shows the total collection value once pricing resolves', async () => {
    render(<Summary />);
    expect(await screen.findByText('200.00 USD')).toBeInTheDocument();
  });

  it('shows progress against Pokemon with at least one available card', () => {
    render(<Summary />);
    expect(screen.getByText(/1 of 2 pok.mon with an available card/i)).toBeInTheDocument();
  });

  it('refreshes market prices for owned and wishlisted cards when the button is clicked', async () => {
    render(<Summary />);
    await screen.findByText('200.00 USD');
    tcgplayerPrice = 250;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Market Prices' }));
    expect(await screen.findByText('250.00 USD')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run:
```bash
npm run test -- Summary.test
```
Expected: FAIL, `Cannot find module './Summary'`.

- [ ] **Step 4: Write `src/components/Summary.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { entriesForGenerations } from '../data/generations';
import { buildCollectionRows } from '../state/collectionSelectors';
import { getAllCachedCardsForDex } from '../state/loadCardData';
import { refreshMarketPrices } from '../state/loadPricing';
import { priceInCurrency } from '../state/priceDisplay';
import { activeRarities, availableCardsForDex } from '../state/selectors';
import { useAppStore } from '../state/store';
import { useUsdRates } from '../state/useUsdRates';
import styles from './Summary.module.css';

export function Summary() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const owned = useAppStore((s) => s.owned);
  const wishlist = useAppStore((s) => s.wishlist);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const priceVersion = useAppStore((s) => s.priceVersion);
  const bumpPriceVersion = useAppStore((s) => s.bumpPriceVersion);
  const usdRates = useUsdRates();

  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);

  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  async function handleRefreshPrices() {
    setIsRefreshingPrices(true);
    await refreshMarketPrices(language, owned, wishlist);
    bumpPriceVersion();
    setIsRefreshingPrices(false);
  }

  const totalOwned = Object.keys(owned).length;
  const priceSource = currency === 'EUR' ? 'cardmarket' : 'tcgplayer';

  // priceVersion is read only to force a re-render (and re-read of the price
  // cache) after handleRefreshPrices runs; its value is not used directly.
  void priceVersion;

  const rows = buildCollectionRows(language, owned);
  const totalValue = rows.reduce((sum, row) => {
    const amount = priceInCurrency(
      {
        cardId: row.card?.id ?? '',
        cardmarketEurAvg: row.cardmarketEurAvg,
        tcgplayerUsdMarket: row.tcgplayerUsdMarket,
        fetchedAt: '',
      },
      priceSource,
      currency,
      usdRates
    ).amount;
    return sum + (amount ?? 0);
  }, 0);

  const activeSet = activeRarities(groups, activeGroupIds);
  const availableCount = dexEntries.filter(
    (entry) =>
      availableCardsForDex(getAllCachedCardsForDex(language, entry.number), activeSet).length > 0
  ).length;

  const progressPercent = availableCount === 0 ? 0 : Math.round((totalOwned / availableCount) * 100);

  return (
    <div className={styles.summary}>
      <div className={styles.stat}>
        <span className={styles.value}>
          {totalOwned} / {dexEntries.length}
        </span>
        <span className={styles.label}>Pokemon with a card owned</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.value}>
          {totalValue.toFixed(2)} {currency}
        </span>
        <span className={styles.label}>Total collection value</span>
      </div>
      <button type="button" onClick={handleRefreshPrices} disabled={isRefreshingPrices}>
        {isRefreshingPrices ? 'Refreshing prices...' : 'Refresh Market Prices'}
      </button>
      <div className={styles.progress}>
        <div className={styles.progressLabel}>
          {totalOwned} of {availableCount} Pokemon with an available card under current filters
        </div>
        <div className={styles.progressBarTrack}>
          <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- Summary.test
```
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/Summary.tsx src/components/Summary.module.css src/components/Summary.test.tsx
git commit -m "Add Summary tab with totals, progress, and a market price refresh action"
```

---

## Task 22: Export and import backup

> **Amended** after Tasks 1-10 shipped, for two reasons. First, `selectedGenerations` needs to round-trip through export/import like every other setting. An adversarial review found the original single-sentence plan for this ("add it to the exported shape") actually needed five separate touch points to work correctly (the `ExportedUserData`/`ExportableState` interfaces, this task's `buildExportPayload`, `replaceUserData` and the `persist` middleware's `partialize` allowlist over in Task 11 (already amended above), and a backward-compatibility fallback here for backup files exported before this feature existed). Second, the confirmation dialog that guards `replaceUserData` is extracted into its own shared component, `ImportConfirmDialog`, so Task 22a's `StartScreen` can reuse the exact same reviewed, tested overwrite-confirmation UI instead of growing a second, unguarded import path into the same destructive action.

**Files:**
- Create: `src/state/exportImport.ts`
- Create: `src/components/ImportConfirmDialog.tsx`
- Create: `src/components/ImportConfirmDialog.module.css`
- Create: `src/components/ExportImportControls.tsx`
- Create: `src/components/ExportImportControls.module.css`
- Test: `src/state/exportImport.test.ts`
- Test: `src/components/ExportImportControls.test.tsx`

- [ ] **Step 1: Write the failing test `src/state/exportImport.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildExportPayload, exportFileName, parseImportPayload } from './exportImport';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

const baseState = {
  language: 'en',
  currency: 'USD' as const,
  activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
  groups: DEFAULT_RARITY_GROUPS,
  owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint' as const, addedAt: '' } },
  wishlist: {},
  selectedGenerations: [1],
};

describe('buildExportPayload', () => {
  it('includes only user-generated data with a version number', () => {
    const payload = buildExportPayload(baseState);
    expect(payload.version).toBe(1);
    expect(payload.owned).toEqual(baseState.owned);
    expect(payload.groups).toEqual(DEFAULT_RARITY_GROUPS);
    expect(payload.selectedGenerations).toEqual([1]);
  });
});

describe('exportFileName', () => {
  it('formats a date as pokemon-collection-export-YYYY-MM-DD.json', () => {
    expect(exportFileName(new Date('2026-07-10T12:00:00.000Z'))).toBe(
      'pokemon-collection-export-2026-07-10.json'
    );
  });
});

describe('parseImportPayload', () => {
  it('parses a valid export payload', () => {
    const payload = buildExportPayload(baseState);
    const parsed = parseImportPayload(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('throws for an unsupported version', () => {
    expect(() => parseImportPayload(JSON.stringify({ version: 2 }))).toThrow(
      'Unsupported export file version.'
    );
  });

  it('throws for malformed data missing required fields', () => {
    expect(() => parseImportPayload(JSON.stringify({ version: 1 }))).toThrow(
      'This file does not look like a valid export.'
    );
  });

  it('throws for invalid JSON', () => {
    expect(() => parseImportPayload('not json')).toThrow();
  });

  it('defaults selectedGenerations to [1] for a backup exported before multi-generation support existed', () => {
    const preFeaturePayload = {
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      // no selectedGenerations key at all, matching a real pre-feature export file
    };
    const parsed = parseImportPayload(JSON.stringify(preFeaturePayload));
    expect(parsed.selectedGenerations).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- exportImport
```
Expected: FAIL, `Cannot find module './exportImport'`.

- [ ] **Step 3: Write `src/state/exportImport.ts`**

Note: `ExportedUserData` is defined once, in `src/state/store.ts` (Task 11), since `replaceUserData` needs it there. This module imports and re-exports that same type rather than redeclaring an equivalent-but-differently-named interface, so there is exactly one source of truth for the export file shape.

```ts
import type { Currency, OwnedRecord, RarityGroup, WishlistRecord } from '../types';
import type { ExportedUserData } from './store';

export type { ExportedUserData } from './store';

export interface ExportableState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
}

export function buildExportPayload(state: ExportableState): ExportedUserData {
  return {
    version: 1,
    language: state.language,
    currency: state.currency,
    activeGroupIds: state.activeGroupIds,
    groups: state.groups,
    owned: state.owned,
    wishlist: state.wishlist,
    selectedGenerations: state.selectedGenerations,
  };
}

export function exportFileName(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return `pokemon-collection-export-${iso}.json`;
}

export function parseImportPayload(raw: string): ExportedUserData {
  const data = JSON.parse(raw);
  if (data.version !== 1) {
    throw new Error('Unsupported export file version.');
  }
  if (typeof data.language !== 'string' || typeof data.currency !== 'string') {
    throw new Error('This file does not look like a valid export.');
  }
  // Backups exported before multi-generation support existed predate this
  // field entirely. Those files only ever covered Gen 1, so default rather
  // than reject an otherwise-valid older backup, consistent with this
  // function's existing role as the one validation/normalization boundary
  // for import data.
  if (!Array.isArray(data.selectedGenerations)) {
    data.selectedGenerations = [1];
  }
  return data as ExportedUserData;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- exportImport
```
Expected: 7 passed.

- [ ] **Step 5: Write `src/components/ImportConfirmDialog.module.css`**

```css
.confirm {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 6: Write `src/components/ImportConfirmDialog.tsx`**

Extracted so both `ExportImportControls` (below) and Task 22a's `StartScreen` share one confirmation UI, instead of one guarded import path and one unguarded one.

```tsx
import styles from './ImportConfirmDialog.module.css';

export interface ImportConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportConfirmDialog({ onConfirm, onCancel }: ImportConfirmDialogProps) {
  return (
    <div role="dialog" aria-label="Confirm import" className={styles.confirm}>
      <p>
        Importing this file will overwrite your current collection, wishlist, and settings on
        this device. This cannot be undone. Continue?
      </p>
      <button type="button" onClick={onConfirm}>
        Overwrite and import
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/components/ExportImportControls.module.css`**

```css
.controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.hiddenInput {
  display: none;
}
```

- [ ] **Step 8: Write the failing test `src/components/ExportImportControls.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExportImportControls } from './ExportImportControls';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

beforeEach(() => {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
});

describe('ExportImportControls', () => {
  it('shows an error for a file that is not a valid export', async () => {
    render(<ExportImportControls />);
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a confirmation dialog for a valid export, and imports on confirm', async () => {
    render(<ExportImportControls />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('dialog', { name: 'Confirm import' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite and import' }));
    expect(useAppStore.getState().language).toBe('ja');
    expect(useAppStore.getState().currency).toBe('EUR');
  });

  it('cancelling the confirmation does not change the store', async () => {
    render(<ExportImportControls />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await screen.findByRole('dialog', { name: 'Confirm import' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().language).toBe('en');
    expect(screen.queryByRole('dialog', { name: 'Confirm import' })).not.toBeInTheDocument();
  });

  it('marks changes as saved after exporting', async () => {
    useAppStore.setState({ hasUnsavedChanges: true });
    render(<ExportImportControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Export my collection' }));
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});
```

- [ ] **Step 9: Run the test to see it fail**

Run:
```bash
npm run test -- ExportImportControls.test
```
Expected: FAIL, `Cannot find module './ExportImportControls'`.

- [ ] **Step 10: Write `src/components/ExportImportControls.tsx`**

```tsx
import { useRef, useState, type ChangeEvent } from 'react';
import {
  buildExportPayload,
  exportFileName,
  parseImportPayload,
  type ExportedUserData,
} from '../state/exportImport';
import { useAppStore } from '../state/store';
import { ImportConfirmDialog } from './ImportConfirmDialog';
import styles from './ExportImportControls.module.css';

export function ExportImportControls() {
  const language = useAppStore((s) => s.language);
  const currency = useAppStore((s) => s.currency);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const groups = useAppStore((s) => s.groups);
  const owned = useAppStore((s) => s.owned);
  const wishlist = useAppStore((s) => s.wishlist);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);
  const replaceUserData = useAppStore((s) => s.replaceUserData);
  const markChangesSaved = useAppStore((s) => s.markChangesSaved);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<ExportedUserData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    const payload = buildExportPayload({
      language,
      currency,
      activeGroupIds,
      groups,
      owned,
      wishlist,
      selectedGenerations,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(new Date());
    link.click();
    URL.revokeObjectURL(url);
    // link.click() has no completion callback and never throws even if the
    // browser's save dialog is cancelled or the download is blocked, so this
    // marks the export as "attempted," not "confirmed written to disk." That
    // is an inherent limitation of the <a download> API, not something we
    // can detect from here.
    markChangesSaved();
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setPendingImport(parseImportPayload(text));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
      setPendingImport(null);
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    replaceUserData(pendingImport);
    setPendingImport(null);
  }

  return (
    <div className={styles.controls}>
      <button type="button" onClick={handleExport}>
        Export my collection
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        Import a backup
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className={styles.hiddenInput}
        onChange={handleFileSelected}
      />
      {error && <p role="alert">{error}</p>}
      {pendingImport && (
        <ImportConfirmDialog onConfirm={confirmImport} onCancel={() => setPendingImport(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 11: Run the test to see it pass**

Run:
```bash
npm run test -- ExportImportControls.test
```
Expected: 4 passed.

- [ ] **Step 12: Commit**

```bash
git add src/state/exportImport.ts src/state/exportImport.test.ts src/components/ImportConfirmDialog.tsx src/components/ImportConfirmDialog.module.css src/components/ExportImportControls.tsx src/components/ExportImportControls.module.css src/components/ExportImportControls.test.tsx
git commit -m "Add export/import backup with a shared, reusable overwrite confirmation"
```

---

## Task 22a: Unsaved-changes warning and start screen

> **New task**, inserted after Tasks 1-10 shipped, covering two related additions:
>
> 1. A `beforeunload` warning so closing or reloading the tab with collection changes that haven't been exported yet shows the browser's native "leave site?" confirmation. Modern browsers no longer allow custom text in that prompt (`event.returnValue = ''` plus `preventDefault()` is the only cross-browser-supported mechanism today), so this doesn't attempt one.
> 2. A landing screen shown on a genuinely first-ever visit, offering "Start a New Collection" or "Import a Backup File." Its import path reuses Task 22's `ImportConfirmDialog` and `parseImportPayload` rather than a second bespoke path, and the "have we onboarded" check in Task 23 (next) derives from both a flag and actual data presence, so a selectively-cleared flag can't cause this screen to reappear over a live collection and let an unconfirmed import silently destroy it.
>
> Depends on Task 22 (`parseImportPayload`, `replaceUserData`, `ImportConfirmDialog`) and Task 11's `hasUnsavedChanges`/`markChangesSaved`. Task 23 (next) is what actually mounts `StartScreen` and calls the warning hook.

**Files:**
- Create: `src/state/useUnsavedChangesWarning.ts`
- Test: `src/state/useUnsavedChangesWarning.test.ts`
- Create: `src/components/StartScreen.tsx`
- Create: `src/components/StartScreen.module.css`
- Test: `src/components/StartScreen.test.tsx`

- [ ] **Step 1: Write the failing test `src/state/useUnsavedChangesWarning.test.ts`**

```ts
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';
import { useAppStore } from './store';

beforeEach(() => {
  useAppStore.setState({ hasUnsavedChanges: false });
});

describe('useUnsavedChangesWarning', () => {
  it('does not register a beforeunload listener when there are no unsaved changes', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesWarning());
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addSpy.mockRestore();
  });

  it('registers a beforeunload listener that prevents the default close when there are unsaved changes', () => {
    useAppStore.setState({ hasUnsavedChanges: true });
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesWarning());
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    const handler = addSpy.mock.calls.find(([event]) => event === 'beforeunload')?.[1] as (
      e: Event
    ) => void;
    const event = new Event('beforeunload', { cancelable: true });
    handler(event);
    expect(event.defaultPrevented).toBe(true);
    addSpy.mockRestore();
  });

  it('removes the listener once hasUnsavedChanges flips back to false', () => {
    useAppStore.setState({ hasUnsavedChanges: true });
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(() => useUnsavedChangesWarning());
    useAppStore.setState({ hasUnsavedChanges: false });
    rerender();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run:
```bash
npm run test -- useUnsavedChangesWarning
```
Expected: FAIL, `Cannot find module './useUnsavedChangesWarning'`.

- [ ] **Step 3: Write `src/state/useUnsavedChangesWarning.ts`**

```ts
import { useEffect } from 'react';
import { useAppStore } from './store';

export function useUnsavedChangesWarning(): void {
  const hasUnsavedChanges = useAppStore((s) => s.hasUnsavedChanges);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
```

Putting `hasUnsavedChanges` in the effect's dependency array (rather than an empty `[]`) means the listener is added and removed each time the flag flips, so it can never close over a stale value from the render it was first attached in. This re-registration is cheap and infrequent: once per collection edit, not once per render.

- [ ] **Step 4: Run the test to see it pass**

Run:
```bash
npm run test -- useUnsavedChangesWarning
```
Expected: 3 passed.

- [ ] **Step 5: Write `src/components/StartScreen.module.css`**

```css
.screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  text-align: center;
  padding: 24px;
}

.choices {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.hiddenInput {
  display: none;
}
```

- [ ] **Step 6: Write the failing test `src/components/StartScreen.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartScreen } from './StartScreen';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

beforeEach(() => {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
});

describe('StartScreen', () => {
  it('calls onComplete without touching the store when starting a new collection', async () => {
    const onComplete = vi.fn();
    render(<StartScreen onComplete={onComplete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start a New Collection' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().owned).toEqual({});
  });

  it('shows the confirmation dialog for a valid backup file, and only imports on confirm', async () => {
    const onComplete = vi.fn();
    render(<StartScreen onComplete={onComplete} />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('dialog', { name: 'Confirm import' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite and import' }));
    expect(useAppStore.getState().language).toBe('ja');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirmation leaves the store untouched and stays on the screen', async () => {
    const onComplete = vi.fn();
    render(<StartScreen onComplete={onComplete} />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await screen.findByRole('dialog', { name: 'Confirm import' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().language).toBe('en');
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Confirm import' })).not.toBeInTheDocument();
  });

  it('shows an inline error for an invalid file and does not show the dialog', async () => {
    render(<StartScreen onComplete={() => {}} />);
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Confirm import' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to see it fail**

Run:
```bash
npm run test -- StartScreen.test
```
Expected: FAIL, `Cannot find module './StartScreen'`.

- [ ] **Step 8: Write `src/components/StartScreen.tsx`**

```tsx
import { useRef, useState, type ChangeEvent } from 'react';
import { parseImportPayload, type ExportedUserData } from '../state/exportImport';
import { useAppStore } from '../state/store';
import { ImportConfirmDialog } from './ImportConfirmDialog';
import styles from './StartScreen.module.css';

export interface StartScreenProps {
  onComplete: () => void;
}

export function StartScreen({ onComplete }: StartScreenProps) {
  const replaceUserData = useAppStore((s) => s.replaceUserData);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<ExportedUserData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setPendingImport(parseImportPayload(text));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
      setPendingImport(null);
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    replaceUserData(pendingImport);
    setPendingImport(null);
    onComplete();
  }

  return (
    <div className={styles.screen}>
      <h1>Welcome to Card Collector</h1>
      <div className={styles.choices}>
        <button type="button" onClick={onComplete}>
          Start a New Collection
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import a Backup File
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className={styles.hiddenInput}
        onChange={handleFileSelected}
      />
      {error && <p role="alert">{error}</p>}
      {pendingImport && (
        <ImportConfirmDialog onConfirm={confirmImport} onCancel={() => setPendingImport(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Run the test to see it pass**

Run:
```bash
npm run test -- StartScreen.test
```
Expected: 4 passed.

- [ ] **Step 10: Commit**

```bash
git add src/state/useUnsavedChangesWarning.ts src/state/useUnsavedChangesWarning.test.ts src/components/StartScreen.tsx src/components/StartScreen.module.css src/components/StartScreen.test.tsx
git commit -m "Add unsaved-changes close warning and a new-project/import-backup start screen"
```

---

## Task 23: App shell wiring tabs and every screen together

> **Amended** after Tasks 1-10 shipped, to also: mount `StartScreen` (Task 22a) as a gate in front of the main app on a genuine first visit; call `useUnsavedChangesWarning()` (Task 22a); and rename the header from "Gen 1 Card Collector" to "Pokemon Card Collector", since a hardcoded "Gen 1" title sitting directly next to the new multi-generation filter (Task 17) would read as self-contradictory. This is a one-line, in-scope change here, and it also means this text never needs touching again as more generations are added later as pure data, matching Task 15.5's own "no further code changes anticipated" goal for that part of the codebase. `README.md` (Task 3, already shipped) intentionally keeps its "Gen 1" language for now, since it's still literally accurate, only Gen 1 is populated, and updating already-shipped docs for a capability that doesn't exist yet would be premature; the reminder to update it lives as a code comment in `src/data/generations.ts` (Task 15.5), right where a future contributor would actually add Gen 2+ data.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create: `src/App.module.css`
- Modify: `src/components/DexGrid.tsx`

- [ ] **Step 1: Add tutorial anchor attributes to `src/components/DexGrid.tsx`**

Replace the `viewToggle` div, the Refresh Data button, and the tile-rendering `return` inside the `dexEntries.map` callback (renamed from `GEN1_DEX.map` when Task 16 was amended for multi-generation support) with the versions below (the rest of the file is unchanged from Task 16):

```tsx
        <div
          className={styles.viewToggle}
          role="radiogroup"
          aria-label="View"
          data-tutorial="view-toggle"
        >
          <button type="button" aria-pressed={view === 'sprite'} onClick={() => setView('sprite')}>
            Sprite view
          </button>
          <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')}>
            Card view
          </button>
        </div>
        <button
          type="button"
          onClick={handleRefreshData}
          disabled={isLoading}
          data-tutorial="refresh-data"
        >
          {isLoading ? 'Refreshing...' : 'Refresh Data'}
        </button>
```

And the tile map body:

```tsx
          return (
            <div key={entry.number} data-tutorial={entry.number === 1 ? 'first-tile' : undefined}>
              <Tile
                dexNumber={entry.number}
                name={entry.name}
                spriteUrl={spriteUrl(entry.number)}
                state={state}
                view={view}
                ownedCardImageUrl={ownedCard ? cardImageUrl(ownedCard.imageBase) : undefined}
                onClick={() => setOpenDexNumber(entry.number)}
              />
            </div>
          );
```

- [ ] **Step 2: Write `src/App.module.css`**

```css
.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tabs button {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: none;
  cursor: pointer;
  font: inherit;
}

.tabs button[aria-pressed='true'] {
  background: #4a9eff;
  color: white;
}
```

- [ ] **Step 3: Rewrite `src/App.tsx`**

```tsx
import { useState } from 'react';
import { CollectionTable } from './components/CollectionTable';
import { DexGrid } from './components/DexGrid';
import { ExportImportControls } from './components/ExportImportControls';
import { FilterBar } from './components/FilterBar';
import { StartScreen } from './components/StartScreen';
import { Summary } from './components/Summary';
import { Tutorial } from './components/Tutorial';
import { WishlistTable } from './components/WishlistTable';
import { useUnsavedChangesWarning } from './state/useUnsavedChangesWarning';
import styles from './App.module.css';

const ONBOARDED_KEY = 'pcc:onboarded:v1';
const USER_DATA_KEY = 'pcc:userData:v1';

function readInitialOnboardingNeeded(): boolean {
  try {
    if (localStorage.getItem(ONBOARDED_KEY) === 'true') return false;
    if (localStorage.getItem(USER_DATA_KEY) !== null) {
      // Real collection data already exists but the onboarding flag is
      // missing (e.g. cleared independently of the data key by a privacy
      // extension, a manual DevTools edit, or a future migration bug).
      // Treat this as already onboarded rather than showing StartScreen
      // over live data, and self-heal the flag so this branch is a no-op
      // on the next load.
      localStorage.setItem(ONBOARDED_KEY, 'true');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

type Tab = 'grid' | 'collection' | 'wishlist' | 'summary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'grid', label: 'Dex Grid' },
  { id: 'collection', label: 'My Collection' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'summary', label: 'Summary' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('grid');
  const [needsOnboarding, setNeedsOnboarding] = useState(readInitialOnboardingNeeded);

  useUnsavedChangesWarning();

  if (needsOnboarding) {
    return (
      <StartScreen
        onComplete={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true');
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>Pokemon Card Collector</h1>
        <div data-tutorial="export-import">
          <ExportImportControls />
        </div>
      </header>

      <nav className={styles.tabs} data-tutorial="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'grid' && (
        <>
          <div data-tutorial="filter-bar">
            <FilterBar />
          </div>
          <DexGrid />
        </>
      )}
      {activeTab === 'collection' && <CollectionTable />}
      {activeTab === 'wishlist' && <WishlistTable />}
      {activeTab === 'summary' && <Summary />}

      <Tutorial />
    </main>
  );
}
```

- [ ] **Step 4: Rewrite `src/App.test.tsx`**

The placeholder test from Task 2 rendered a static heading. Now that `App` pulls in the Zustand store, `DexGrid` (which fetches on mount), and the onboarding gate, the test needs to seed the store, mark onboarding as already complete (so the existing tab-UI tests exercise the main app rather than `StartScreen`), and mock `fetch` like the other component tests. A separate small suite covers the onboarding gate itself.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAppStore } from './state/store';
import { DEFAULT_RARITY_GROUPS } from './data/defaultRarityGroups';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pcc:onboarded:v1', 'true');
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse([]))
  );
});

describe('App', () => {
  it('renders the app title and the four tabs', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /pokemon card collector/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dex Grid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Collection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wishlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summary' })).toBeInTheDocument();
  });

  it('switches to the Summary tab when clicked', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(screen.getByText('0 / 151')).toBeInTheDocument();
  });

  it('shows the Dex Grid tab by default', () => {
    render(<App />);
    expect(screen.getByText('Bulbasaur')).toBeInTheDocument();
  });
});

describe('App onboarding gate', () => {
  it('shows StartScreen on a fresh visit with no prior data', () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome to card collector/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dex Grid' })).not.toBeInTheDocument();
  });

  it('skips StartScreen and self-heals the flag when real user data exists but the flag is missing', () => {
    localStorage.clear();
    localStorage.setItem('pcc:userData:v1', JSON.stringify({ state: {}, version: 0 }));
    render(<App />);
    expect(screen.getByRole('button', { name: 'Dex Grid' })).toBeInTheDocument();
    expect(localStorage.getItem('pcc:onboarded:v1')).toBe('true');
  });
});
```

Note: this test file references `./components/Tutorial`, which does not exist until the next task. Skip running this test until Task 24 adds a placeholder-free `Tutorial` component; running it now will fail with `Cannot find module './components/Tutorial'`, which is expected and resolved in the next task.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/App.module.css src/components/DexGrid.tsx
git commit -m "Wire tabs and all screens together in the app shell"
```

---

## Task 24: Onboarding tutorial

**Files:**
- Create: `src/components/Tutorial.tsx`
- Create: `src/components/Tutorial.module.css`
- Test: `src/components/Tutorial.test.tsx`

- [ ] **Step 1: Write `src/components/Tutorial.module.css`**

```css
.tutorialButton {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: #4a9eff;
  color: white;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  z-index: 300;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}
```

- [ ] **Step 2: Write the failing test `src/components/Tutorial.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tutorial } from './Tutorial';

function renderWithTourTargets() {
  render(
    <div>
      <div data-tutorial="tabs">tabs</div>
      <div data-tutorial="filter-bar">filters</div>
      <div data-tutorial="view-toggle">toggle</div>
      <div data-tutorial="first-tile">tile</div>
      <button data-tutorial="refresh-data">refresh</button>
      <div data-tutorial="export-import">export</div>
      <Tutorial />
    </div>
  );
}

describe('Tutorial', () => {
  it('renders a Tutorial button', () => {
    renderWithTourTargets();
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument();
  });

  it('starts the guided tour when the Tutorial button is clicked', async () => {
    renderWithTourTargets();
    await userEvent.click(screen.getByRole('button', { name: 'Tutorial' }));
    expect(
      await screen.findByText(/these tabs switch between the main dex grid/i)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run:
```bash
npm run test -- Tutorial.test
```
Expected: FAIL, `Cannot find module './Tutorial'`.

- [ ] **Step 4: Write `src/components/Tutorial.tsx`**

```tsx
import { useState } from 'react';
import Joyride, { STATUS, type CallBackProps, type Step } from 'react-joyride';
import styles from './Tutorial.module.css';

const STEPS: Step[] = [
  {
    target: '[data-tutorial="tabs"]',
    content:
      'These tabs switch between the main dex grid, your collection, your wishlist, and a summary of your progress and value.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="filter-bar"]',
    content:
      'Use these filters to choose which generations you collect, which rarity groups count as special art, which card language you collect, and which currency prices are shown in.',
  },
  {
    target: '[data-tutorial="view-toggle"]',
    content: 'Switch between sprite view and card view for the whole grid at any time.',
  },
  {
    target: '[data-tutorial="first-tile"]',
    content:
      'Click any Pokemon to see its special art card options. A dulled tile means you own a card for it, and a red tile means no special art card has been released for it yet.',
  },
  {
    target: '[data-tutorial="refresh-data"]',
    content:
      'Refresh Data rescans every Pokemon for newly released cards. Use it after a new set comes out.',
  },
  {
    target: '[data-tutorial="export-import"]',
    content:
      'Your collection lives only in this browser. Export it to a file every so often, and import that file to restore it here or on another device.',
  },
];

export function Tutorial() {
  const [run, setRun] = useState(false);

  function handleCallback(data: CallBackProps) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.tutorialButton}
        onClick={() => setRun(true)}
        data-tutorial="tutorial-button"
      >
        Tutorial
      </button>
      <Joyride
        steps={STEPS}
        run={run}
        continuous
        showSkipButton
        callback={handleCallback}
        styles={{ options: { primaryColor: '#4a9eff' } }}
      />
    </>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run:
```bash
npm run test -- Tutorial.test
```
Expected: 2 passed.

- [ ] **Step 6: Run the full `App.test.tsx` from the previous task, now that `Tutorial` exists**

Run:
```bash
npm run test -- App.test
```
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add src/components/Tutorial.tsx src/components/Tutorial.module.css src/components/Tutorial.test.tsx
git commit -m "Add guided onboarding tutorial"
```

---

## Task 25: Animation pass and visual design pass

**Context:** Every screen so far uses only minimal functional CSS so the underlying logic and interactions could be built and tested first. This task adds the Framer Motion micro-interactions the design spec calls for (grid tile transitions, picker modal open/close, tab switches), and then hands off to the `frontend-design` skill for the actual visual language (color, type, spacing, light/dark handling) so the app does not read as a generic, unstyled template. Do not skip the `frontend-design` skill invocation in Step 5: the design spec explicitly calls for it, and hand-rolled CSS without that pass tends to read as generic.

**Files:**
- Modify: `src/components/Tile.tsx`
- Modify: `src/components/Picker.tsx`
- Modify: `src/components/DexGrid.tsx`
- Modify: `src/App.tsx`
- Modify: all `*.module.css` files created in prior tasks, and `src/styles/global.css`

- [ ] **Step 1: Add hover/tap micro-interactions to `src/components/Tile.tsx`**

Replace the `import` line and the `return` statement with:

```tsx
import { motion } from 'framer-motion';
import type { TileState } from '../state/selectors';
import styles from './Tile.module.css';
```

```tsx
  return (
    <motion.button
      type="button"
      className={[styles.tile, styles[`tile--${state}`]].filter(Boolean).join(' ')}
      onClick={onClick}
      title={title}
      layout
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <span className={styles.number}>#{String(dexNumber).padStart(3, '0')}</span>
      {showCardImage ? (
        <img src={ownedCardImageUrl} alt={`${name} card`} loading="lazy" />
      ) : (
        <img src={spriteUrl} alt={name} loading="lazy" />
      )}
      <span className={styles.name}>{name}</span>
    </motion.button>
  );
```

- [ ] **Step 2: Animate the picker's open/close in `src/components/Picker.tsx`**

Add `import { motion } from 'framer-motion';` alongside the existing imports, and replace `<div className={styles.overlay} ...>` wrappers (both the condition-picker branch and the main branch) with `motion.div`, adding these animation props to the outer overlay:

```tsx
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
```

and to the inner `.panel` div in both branches:

```tsx
initial={{ opacity: 0, scale: 0.95, y: 10 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95, y: 10 }}
transition={{ type: 'spring', stiffness: 300, damping: 30 }}
```

Change the two `<div className={styles.overlay} ...>` tags to `<motion.div className={styles.overlay} ...>` (and their matching closing tags), and the two `<div className={styles.panel}>` tags to `<motion.div className={styles.panel} ...>` with the props above.

- [ ] **Step 3: Wrap the picker mount point in `AnimatePresence` in `src/components/DexGrid.tsx`**

Add `import { AnimatePresence } from 'framer-motion';` to the imports, and replace:

```tsx
      {openEntry && (
        <Picker
          dexNumber={openEntry.number}
          pokemonName={openEntry.name}
          cards={openCards}
          onClose={() => setOpenDexNumber(null)}
        />
      )}
```

with:

```tsx
      <AnimatePresence>
        {openEntry && (
          <Picker
            key={openEntry.number}
            dexNumber={openEntry.number}
            pokemonName={openEntry.name}
            cards={openCards}
            onClose={() => setOpenDexNumber(null)}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 4: Cross-fade tab switches in `src/App.tsx`**

Add `import { AnimatePresence, motion } from 'framer-motion';`, and replace the four `{activeTab === '...' && <...Component /> }` lines with a single animated block:

```tsx
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'grid' && (
            <>
              <div data-tutorial="filter-bar">
                <FilterBar />
              </div>
              <DexGrid />
            </>
          )}
          {activeTab === 'collection' && <CollectionTable />}
          {activeTab === 'wishlist' && <WishlistTable />}
          {activeTab === 'summary' && <Summary />}
        </motion.div>
      </AnimatePresence>
```

- [ ] **Step 5: Run the full test suite to confirm the animation changes did not break behavior**

Run:
```bash
npm run test
```
Expected: all tests still pass. Framer Motion's `motion.*` components forward standard DOM props and event handlers, so existing `getByRole('button', ...)`-style queries continue to work unchanged.

- [ ] **Step 6: Invoke the `frontend-design` skill for the visual design pass**

This step is a design pass, not a fixed code diff: invoke the `frontend-design` skill and apply its guidance to every `*.module.css` file and `src/styles/global.css` written so far. At minimum, the result must:

- Define a real color palette (not default blue/red/gray placeholders) as CSS custom properties in `src/styles/global.css`, with explicit light and dark mode values (respecting `prefers-color-scheme`).
- Apply consistent type scale, spacing, and corner radii across `Tile`, `Picker`, `ConditionPicker`, `FilterBar`, `ManageGroupsPanel`, `DataTable` (Collection/Wishlist), `Summary`, `StartScreen`, `ImportConfirmDialog`, and the `App` header/tabs.
- Keep every existing `className`, `data-tutorial`, `role`, and `aria-*` attribute intact, since the test suite and the Tutorial's target selectors depend on them. Only the CSS files and class-name *values inside them* should change; do not rename the exported class identifiers used in the `.tsx` files.
- Avoid a generic, templated look: deliberate color choices, real hover/active states, and considered empty states (the "no cards yet," "wishlist is empty," and "select at least one generation" messages) rather than default browser styling.

- [ ] **Step 7: Run the test suite again after the design pass**

Run:
```bash
npm run test
npm run typecheck
npm run lint
```
Expected: all pass. If any test broke because a `data-testid`, role, or accessible name changed during the design pass, fix the test or the markup so the accessible name matches what the test expects (prefer fixing the markup, since the tests describe the required behavior).

- [ ] **Step 8: Manually verify in a browser**

Run:
```bash
npm run dev
```
Open the printed local URL. Confirm: the grid renders with distinguishable available/owned/unavailable tile states, clicking a tile opens the picker with a visible animation, switching sprite/card view and tabs is smooth, dark mode (toggle your OS/browser theme) looks intentional rather than broken, and the Tutorial button in the bottom corner is visible and starts the tour.

- [ ] **Step 9: Commit**

```bash
git add src/components/Tile.tsx src/components/Picker.tsx src/components/DexGrid.tsx src/App.tsx src/styles/global.css src/components/*.module.css
git commit -m "Add animations and a real visual design pass"
```

---

## Task 26: GitHub Actions CI and Pages deployment

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        with:
          path: dist

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Enable GitHub Pages for the repo, sourced from GitHub Actions**

This requires the `froyonator` account's admin access confirmed in "Before you start".

Run:
```bash
gh auth switch --user froyonator
gh api -X POST repos/froyonator/Pokemon-Card-Collector-/pages -f "build_type=workflow" 2>&1 || \
gh api -X PUT repos/froyonator/Pokemon-Card-Collector-/pages -f "build_type=workflow"
```
Expected: the `POST` succeeds (HTTP 201) if Pages was never configured, or fails because Pages already exists, in which case the `PUT` updates the existing configuration to build from GitHub Actions. Either way, a follow-up check should confirm the source:

```bash
gh api repos/froyonator/Pokemon-Card-Collector-/pages --jq '.build_type'
```
Expected: prints `workflow`.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow that builds, tests, and deploys to GitHub Pages"
git push origin main
```

- [ ] **Step 4: Confirm the workflow runs and deploys**

Run:
```bash
gh run list --workflow=ci.yml --limit 1
```
Expected: shows a run triggered by the push, initially `in_progress`. Poll until it completes:

```bash
gh run watch $(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```
Expected: the run finishes with conclusion `success`. Then confirm the site is live:

```bash
gh api repos/froyonator/Pokemon-Card-Collector-/pages --jq '.html_url'
curl -s -o /dev/null -w "%{http_code}\n" "https://froyonator.github.io/Pokemon-Card-Collector-/"
```
Expected: the second command prints `200`.

---

## Task 27: Finalize the changelog and cut the 0.1.0 release

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Rewrite `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-10

### Added

- All 151 Gen 1 Pokemon shown in dex order, in sprite view or card view, sourced live from PokeAPI and TCGdex.
- A picker showing every special art and full art card ever printed for a Pokemon, filtered by editable rarity groups and by card language.
- Ownership tracking with a recorded condition, and a wishlist limited to one card per Pokemon.
- My Collection, Wishlist, and Summary tabs with sorting and market value totals in USD, EUR, AUD, GBP, or CAD.
- Manual "Refresh Data" and "Refresh Market Prices" actions, with card, image, and pricing caches so the app works from cache when the network is unavailable.
- Export and import of your collection, wishlist, groups, and settings as a JSON backup file.
- A guided onboarding tutorial covering every major feature.
- Continuous integration and automatic deployment to GitHub Pages.
```

- [ ] **Step 2: Commit, tag, and push**

```bash
git add CHANGELOG.md
git commit -m "Cut the 0.1.0 release"
git tag -a v0.1.0 -m "v0.1.0"
git push origin main
git push origin v0.1.0
```

- [ ] **Step 3: Verify the tag and the live site**

Run:
```bash
gh release view v0.1.0 2>&1 || gh release create v0.1.0 --title "v0.1.0" --notes "Initial release: full Gen 1 special art and full art card tracker."
curl -s -o /dev/null -w "%{http_code}\n" "https://froyonator.github.io/Pokemon-Card-Collector-/"
```
Expected: a GitHub release exists for `v0.1.0` (created if it did not already exist), and the site URL check prints `200`.

---
