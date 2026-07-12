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

export interface Generation {
  id: number;
  label: string;
  // Read-only: this holds the literal dex array reference (e.g. GEN1_DEX),
  // not a defensive copy. Never mutate `entries` in place — read through
  // `entriesForGenerations`/`allDexEntries`, which return fresh arrays.
  entries: DexEntry[];
}

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
];

export function entriesForGenerations(generationIds: number[]): DexEntry[] {
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
export function generationForDexNumber(dexNumber: number): number | undefined {
  const generation = GENERATIONS.find((g) => {
    if (g.entries.length === 0) return false;
    const first = g.entries[0].number;
    const last = g.entries[g.entries.length - 1].number;
    return dexNumber >= first && dexNumber <= last;
  });
  return generation?.id;
}
