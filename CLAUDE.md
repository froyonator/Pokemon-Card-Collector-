# Collector's Ledger — project instructions

Additional local-only conventions live in CLAUDE.local.md (not committed);
always read and follow it too.

## Operating mode: advisor + workers (user-mandated default)

The user has granted STANDING AUTHORIZATION for multi-agent orchestration
(the Workflow tool) on every substantive task in this repo. Treat this
section as the explicit opt-in the Workflow tool requires.

- The main session model acts as the ADVISOR: decompose the task, design
  the method and output schemas, make product decisions, spot-check
  assumptions the workers depend on, review their output, verify results,
  and synthesize the final answer.
- Delegate mechanical execution to WORKER agents running Sonnet: set
  `model: 'sonnet'` explicitly on every workflow `agent()` call (and Agent
  tool call). Parallelize independent work; give workers precise technical
  direction (exact paths, schemas, known pitfalls) rather than open-ended
  goals.
- Do NOT spawn agents for conversational turns, advisor-judgment calls, or
  trivial edits — those are done inline by the advisor.
- Verification gate before claiming anything is done: `npm test`,
  `npm run lint`, `npm run typecheck`, `npm run build` from the repo root
  (plus the same in `scripts/carddata` when the pipeline changed), and a
  live browser check for user-visible changes. Evidence before assertions.

## Hard project rules (user-mandated, non-negotiable)

- The sidebar must NEVER grow an internal scrollbar. If a panel makes it
  too tall, fold content behind collapsed `<details>` disclosures (the
  established pattern), never scroll.
- No em dashes in app copy or docs.
- Commit locally in small, well-messaged steps; push only after the full
  verification gate is green, then confirm CI (GitHub Actions) passes.

## Changelog and versioning (user-mandated; this has lagged before)

- `CHANGELOG.md` (Keep a Changelog format, SemVer) MUST be updated in the
  same commit as any user-visible change: features and UX changes under
  Added/Changed, bug fixes under Fixed, removals under Removed, in the
  `[Unreleased]` section. Internal-only work (refactors, test-only,
  pipeline tooling with no user-facing effect) stays out.
- Changelog entries are written for the app's user, in plain language, and
  follow every hard rule in this file and in CLAUDE.local.md.
- Cut a release when a coherent feature wave ships: move `[Unreleased]`
  under a new `[X.Y.Z] - <date>` heading, bump `version` in package.json
  to match, create an annotated git tag `vX.Y.Z`, and push the tag along
  with the branch. Pre-1.0 convention: minor bump for feature waves,
  patch bump for fix-only releases.
- Before ending any session that shipped user-visible changes, check that
  the changelog actually reflects them; a green CI with a stale changelog
  is NOT done.

## Project map

- React 18 + TypeScript + Vite SPA, deployed to GitHub Pages via Actions
  CI (lint / typecheck / test / build / deploy on push to main).
- Card data: static per-language databases at `public/data/cards/<lang>.json`
  (Record<dexNumber, CardRecord[]>) are the source of truth, preloaded
  before any live-API fallback; a covered language makes ZERO live calls.
  Card images are self-hosted in separate GitHub asset repos
  (pcc-assets-a/b/c).
- Scope today: Gen 1 (dex 1-151) Pokemon cards only, but the user plans to
  expand to all generations; all-generation data and images are already
  hosted, so expansion mostly means widening the dex range and UI.
- Data pipeline: `scripts/carddata` — its own npm package (run its own
  `npm test` / `npm run typecheck` from that directory). Its `data/`
  directory is gitignored scratch/output space.
