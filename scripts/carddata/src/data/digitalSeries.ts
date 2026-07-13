// scripts/carddata/src/data/digitalSeries.ts
//
// Collector's Ledger tracks PHYSICAL trading cards only. This module is the
// single, shared list of series/set ids that are known to be digital-only
// (never printed as a physical product), so every part of the pipeline that
// reads or writes card data can fence them out the same way.
//
// How this list was determined: the bulk-export clone's own series
// structure (see data/bulk-export/data/) has exactly one series whose id is
// "tcgp" and whose display name is "Pokemon TCG Pocket" -- the standalone
// mobile app, not the physical trading card game. Every one of its 15 sets
// was individually inspected: none of them carries a `thirdParty` field
// (the Cardmarket/TCGplayer marketplace ids every physical set in the same
// clone has), which is the source's own way of recording that a set was
// never sold as a physical product. No other series in the clone (western
// or Asian data root) matched on name, id, or this marketplace-absence
// signal -- including a Japanese series literally named "Pocket Monsters
// Card Game" (id "PMCG", sets released 1996-1999 with real print dates),
// which is just the franchise's Japanese title and is unrelated to the
// digital app; it is NOT included here.
export const DIGITAL_ONLY_SERIES_IDS: ReadonlySet<string> = new Set(['tcgp']);

// Every setId nested under the tcgp series, enumerated directly from the
// bulk-export clone's own Set modules (data/bulk-export/data/Pokemon TCG
// Pocket/*.ts). Keep in id order as they appear on disk.
export const DIGITAL_ONLY_SET_IDS: ReadonlySet<string> = new Set([
  'A1',
  'A1a',
  'A2',
  'A2a',
  'A2b',
  'A3',
  'A3a',
  'A3b',
  'A4',
  'A4a',
  'B1',
  'B1a',
  'B2',
  'B2a',
  'P-A',
]);

/** True when `setId` belongs to a known digital-only set. Never throws on a missing/nullish id. */
export function isDigitalOnlySetId(setId: string | undefined | null): boolean {
  if (!setId) return false;
  return DIGITAL_ONLY_SET_IDS.has(setId);
}

/** True when `serieId` belongs to a known digital-only series. Never throws on a missing/nullish id. */
export function isDigitalOnlySeriesId(serieId: string | undefined | null): boolean {
  if (!serieId) return false;
  return DIGITAL_ONLY_SERIES_IDS.has(serieId);
}
