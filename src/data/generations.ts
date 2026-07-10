import { GEN1_DEX, type DexEntry } from './gen1Dex';

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
];

export function entriesForGenerations(generationIds: number[]): DexEntry[] {
  return GENERATIONS.filter((g) => generationIds.includes(g.id))
    .flatMap((g) => g.entries)
    .sort((a, b) => a.number - b.number);
}

export function allDexEntries(): DexEntry[] {
  return GENERATIONS.flatMap((g) => g.entries).sort((a, b) => a.number - b.number);
}
