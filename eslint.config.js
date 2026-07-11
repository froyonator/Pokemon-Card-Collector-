import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // scripts/scraper is a standalone Node/TypeScript project with its own
  // package.json, dependencies, and tooling (see
  // docs/superpowers/plans/2026-07-11-card-database-scraper-plan.md) --
  // deliberately excluded here so this root lint config never depends on
  // packages (cheerio, playwright) that only exist in its own separate
  // node_modules, which CI's root `npm ci` never installs.
  { ignores: ['dist', 'node_modules', 'scripts/scraper'] },
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
