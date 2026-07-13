import type { DexEntry } from './gen1Dex';
import {
  GEN1_DEX,
  GEN2_DEX,
  GEN3_DEX,
  GEN4_DEX,
  GEN5_DEX,
  GEN6_DEX,
  GEN7_DEX,
  GEN8_DEX,
  GEN9_DEX,
} from './fullDex';
import { MEGA_DEX_BASE, MEGA_DEX_ENTRIES } from './megaDex';
import { VMAX_DEX_ENTRIES } from './vmaxDex';
import { ALOLAN_DEX, GALARIAN_DEX, HISUIAN_DEX, PALDEAN_DEX } from './regionalDex';

// A real national-dex generation is numbered 1-9; 'mega'/'vmax'/'alolan'/
// 'galarian'/'hisuian'/'paldean' are special, non-numeric grouping ids for
// the synthetic-numbered form entries (see megaDex.ts/vmaxDex.ts/
// regionalDex.ts) -- pseudo-generations today, kept cleanly separable
// because the product plan is to move them to a different grouping concept
// later without disturbing how real generations work.
export type GenerationId = number | 'mega' | 'vmax' | 'alolan' | 'galarian' | 'hisuian' | 'paldean';

// Every pseudo-generation id, in the order they should render in the
// selector's "Forms" sub-group -- see FilterBar.tsx.
export const FORM_GENERATION_IDS: GenerationId[] = ['mega', 'vmax', 'alolan', 'galarian', 'hisuian', 'paldean'];

export interface Generation {
  id: GenerationId;
  label: string;
  // Read-only: this holds the literal dex array reference (e.g. GEN1_DEX),
  // not a defensive copy. Never mutate `entries` in place — read through
  // `entriesForGenerations`/`allDexEntries`, which return fresh arrays.
  entries: DexEntry[];
}

// MEGA_DEX_ENTRIES carries baseDexNumber/slug/spriteSlug metadata this
// registry doesn't need -- entries here are just the plain {number, name}
// pairs every other generation already uses, so Mega tiles flow through
// entriesForGenerations/allDexEntries/the DexGrid tile map exactly like any
// other generation's entries.
const MEGA_DEX: DexEntry[] = MEGA_DEX_ENTRIES.map((entry) => ({
  number: entry.number,
  name: entry.name,
}));

// VMAX_DEX_ENTRIES/ALOLAN_DEX/etc carry baseDex/slug/family metadata this
// registry doesn't need -- entries here are just the plain {number, name}
// pairs every other generation already uses, mirroring MEGA_DEX above, so
// every form tile flows through entriesForGenerations/allDexEntries/the
// DexGrid tile map exactly like any other generation's entries.
const VMAX_DEX: DexEntry[] = VMAX_DEX_ENTRIES.map((entry) => ({ number: entry.number, name: entry.name }));
const ALOLAN_GEN_DEX: DexEntry[] = ALOLAN_DEX.map((entry) => ({ number: entry.number, name: entry.name }));
const GALARIAN_GEN_DEX: DexEntry[] = GALARIAN_DEX.map((entry) => ({ number: entry.number, name: entry.name }));
const HISUIAN_GEN_DEX: DexEntry[] = HISUIAN_DEX.map((entry) => ({ number: entry.number, name: entry.name }));
const PALDEAN_GEN_DEX: DexEntry[] = PALDEAN_DEX.map((entry) => ({ number: entry.number, name: entry.name }));

// When adding a new generation here, also update README.md's "Gen 1 (Kanto,
// #001-151)" / "All 151 Gen 1 Pokemon" language (that file was written when
// this app only ever covered Gen 1). Nothing in src/App.tsx needs touching
// for a new generation: its header is generation-neutral ("Collector's
// Ledger"), not "Gen 1 Card Collector".
export const GENERATIONS: Generation[] = [
  { id: 1, label: 'Generation 1 (Kanto)', entries: GEN1_DEX },
  { id: 2, label: 'Generation 2 (Johto)', entries: GEN2_DEX },
  { id: 3, label: 'Generation 3 (Hoenn)', entries: GEN3_DEX },
  { id: 4, label: 'Generation 4 (Sinnoh)', entries: GEN4_DEX },
  { id: 5, label: 'Generation 5 (Unova)', entries: GEN5_DEX },
  { id: 6, label: 'Generation 6 (Kalos)', entries: GEN6_DEX },
  { id: 7, label: 'Generation 7 (Alola)', entries: GEN7_DEX },
  { id: 8, label: 'Generation 8 (Galar & Hisui)', entries: GEN8_DEX },
  { id: 9, label: 'Generation 9 (Paldea)', entries: GEN9_DEX },
  { id: 'mega', label: 'Mega', entries: MEGA_DEX },
  { id: 'vmax', label: 'VMAX', entries: VMAX_DEX },
  { id: 'alolan', label: 'Alolan', entries: ALOLAN_GEN_DEX },
  { id: 'galarian', label: 'Galarian', entries: GALARIAN_GEN_DEX },
  { id: 'hisuian', label: 'Hisuian', entries: HISUIAN_GEN_DEX },
  { id: 'paldean', label: 'Paldean', entries: PALDEAN_GEN_DEX },
];

export function entriesForGenerations(generationIds: GenerationId[]): DexEntry[] {
  return GENERATIONS.filter((g) => generationIds.includes(g.id))
    .flatMap((g) => g.entries)
    .sort((a, b) => a.number - b.number);
}

export function allDexEntries(): DexEntry[] {
  return GENERATIONS.flatMap((g) => g.entries).sort((a, b) => a.number - b.number);
}

// Which generation a national dex number belongs to, used by the per-
// generation static loader (see api/staticDatabase.ts's loadStaticCardDataForGen)
// to route each dex number's lookup at the right data/cards/<language>/gen<N>.json
// file instead of a single shared one. Relies on each generation's `entries`
// being a contiguous, sorted run (true for every generation in GENERATIONS
// today) rather than scanning the full entries array per lookup. Returns
// `undefined` for a dex number outside every known generation's range,
// rather than throwing -- callers fall back to treating it as ungrouped
// (e.g. skip the static preload and defer straight to the live-API path)
// instead of crashing on a future/unmapped dex number.
//
// Can return 'mega'/'vmax'/'alolan'/'galarian'/'hisuian'/'paldean' for a
// synthetic form dex number -- callers that route through the normal
// per-generation static file loader (DexGrid's staticDataByGeneration) must
// never feed it a synthetic number in the first place (form entries use
// their own dedicated loaders instead, see state/loadMegaCardData.ts/
// loadVmaxCardData.ts/loadRegionalCardData.ts), so in practice this only
// ever surfaces one of these ids to a caller that's specifically asking
// about a form entry's own (synthetic) number.
export function generationForDexNumber(dexNumber: number): GenerationId | undefined {
  const generation = GENERATIONS.find((g) => {
    if (g.entries.length === 0) return false;
    const first = g.entries[0].number;
    const last = g.entries[g.entries.length - 1].number;
    return dexNumber >= first && dexNumber <= last;
  });
  return generation?.id;
}

// Any dex number at or above MEGA_DEX_BASE (20000) is a SYNTHETIC one: not a
// real national dex entry with its own fetched data, but a computed VIEW
// over some other dex number's already-cached cards -- Mega (see
// loadMegaCardData.ts), VMAX (loadVmaxCardData.ts, base 21000), and the four
// regional families (loadRegionalCardData.ts, bases 22000/23000/24000/25000)
// all reuse this same numbering convention, so this one helper covers every
// one of them automatically; if a future family ever needs a non-contiguous
// range instead, widen this check to a small array of [start, end) ranges
// rather than adding a second ad hoc helper).
//
// This is the load-freshness contract every synthetic family must honor: a
// synthetic entry's cache slot being PRESENT says nothing about whether it
// reflects the CURRENT filter/derivation logic (a code change -- e.g. a
// mega-matcher fix -- doesn't retroactively rewrite whatever an old session
// already wrote to localStorage). Callers that decide whether to (re)compute
// an entry by checking cache presence (see DexGrid's auto-load effect) must
// treat every synthetic dex number as always needing recomputation, never
// "already cached, skip" -- the recomputation itself is cheap (zero network
// calls, a filter over already-loaded base-species data), so this costs
// nothing but a redundant filter pass, in exchange for never silently
// serving stale derived data until a manual Refresh Data.
export function isSyntheticDexNumber(dexNumber: number): boolean {
  return dexNumber >= MEGA_DEX_BASE;
}

// Bumped whenever ANY synthetic-form matcher/filter logic changes --
// megaDex.ts's cardMatchesMegaEntry/VARIANT_OVERRIDES, vmaxDex.ts's
// cardMatchesVmaxEntry/VMAX_NAME_PATTERNS, regionalDex.ts's
// isRegionalCardName/REGIONAL_LOCALE_MARKERS/excludeRegionalFormCards, or
// the roster data (*_DEX_ENTRIES) any of those read from. This is the cheap
// half of the guarantee isSyntheticDexNumber's own doc comment above
// describes: state/loadSyntheticFormCardData.ts stamps this value onto
// every synthetic entry's cache slot when it (re)computes that entry (see
// storage/cardCache.ts's getSyntheticFilterVersion/setSyntheticFilterVersion),
// and skips recomputing an entry whose stamp already matches -- so a stale
// entry from before a matcher fix shipped still gets picked up on the very
// next load (its stamp won't match), without every OTHER, already-correct
// entry paying the cost of an unconditional refilter-and-rewrite on every
// single load the way it used to (reported live as the Mega/VMAX/regional
// tabs turning sluggish -- hundreds of entries' worth of redundant
// localStorage writes on every tab switch). No session has ever stamped a
// value under this key before this mechanism existed, so starting at 1
// already forces a first-time recompute for every existing cache. From here
// on, EVERY future change to a synthetic matcher/filter (or its underlying
// roster data) MUST increment this by 1 in the same commit, or an
// already-stamped entry will keep serving its pre-fix cached result until a
// manual Refresh Data.
export const SYNTHETIC_FILTER_VERSION = 1;
