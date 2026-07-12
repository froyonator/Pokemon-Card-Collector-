// scripts/carddata/src/data/genRanges.ts
//
// Canonical National Dex number ranges per generation. Single source of
// truth shared by src/generateFullDex.ts (to tag each species with its
// generation) and src/buildStaticDatabase.ts / src/snapshotAllGens.ts (to
// know which dex numbers belong in public/data/cards/<lang>/gen<N>.json).
// Generation 1 (1-151) is included for completeness/consistency checks only
// -- the existing Gen1 build/snapshot paths keep their own hardcoded
// 1/151 constants untouched, per this task's "do not regenerate the Gen1
// outputs" constraint.
export interface GenRange {
  generation: number;
  min: number;
  max: number;
}

export const GEN_RANGES: GenRange[] = [
  { generation: 1, min: 1, max: 151 },
  { generation: 2, min: 152, max: 251 },
  { generation: 3, min: 252, max: 386 },
  { generation: 4, min: 387, max: 493 },
  { generation: 5, min: 494, max: 649 },
  { generation: 6, min: 650, max: 721 },
  { generation: 7, min: 722, max: 809 },
  { generation: 8, min: 810, max: 905 },
  { generation: 9, min: 906, max: 1025 },
];

export function generationForDexNumber(dexNumber: number): number {
  const range = GEN_RANGES.find((r) => dexNumber >= r.min && dexNumber <= r.max);
  if (!range) throw new Error(`Dex number ${dexNumber} is outside every known generation range.`);
  return range.generation;
}

export function rangeForGeneration(generation: number): GenRange {
  const range = GEN_RANGES.find((r) => r.generation === generation);
  if (!range) throw new Error(`Unknown generation: ${generation}`);
  return range;
}
