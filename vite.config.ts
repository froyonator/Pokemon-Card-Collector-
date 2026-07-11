import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
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
    // scripts/scraper is a standalone Node/TypeScript project with its own
    // package.json, dependencies (cheerio, playwright), and vitest config
    // (see docs/superpowers/plans/2026-07-11-card-database-scraper-plan.md)
    // -- excluded here (on top of Vitest's own defaults, which this would
    // otherwise silently replace rather than extend) so this root test run
    // never tries to import packages that only exist in that project's own
    // separate node_modules, which CI's root `npm ci` never installs.
    exclude: [...configDefaults.exclude, 'scripts/scraper/**'],
  },
});
