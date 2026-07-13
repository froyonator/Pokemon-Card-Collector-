// Loads (or refreshes) card data for Mega dex entries. Unlike a normal
// generation's dexEntries, a Mega entry has no card data of its own to
// fetch: it's a synthetic-numbered VIEW over its base species' own cards
// (see src/data/megaDex.ts), filtered down to just that Mega form's prints.
//
// A thin wrapper around loadSyntheticFormCardData.ts's shared core -- see
// that module's own header comment for the full contract (zero live calls,
// one fetch per distinct base species, generation-guarded synthetic-number
// writes). This file's own exported function names/signatures are
// deliberately unchanged from before that generalization existed, so Mega's
// behavior (and this module's existing callers/tests) stays byte-identical.
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { cardsForMegaEntry, type MegaDexEntry } from '../data/megaDex';
import {
  loadSyntheticFormCardData,
  refreshSyntheticFormCardData,
  type LoadSyntheticFormOptions,
} from './loadSyntheticFormCardData';

export type LoadMegaCardDataOptions = LoadSyntheticFormOptions;

export function loadMegaCardData(
  language: string,
  entries: MegaDexEntry[],
  options: LoadMegaCardDataOptions = {}
): Promise<void> {
  return loadSyntheticFormCardData(
    language,
    entries,
    loadStaticCardData,
    loadStaticCardDataForGen,
    cardsForMegaEntry,
    options
  );
}

export function refreshMegaCardData(
  language: string,
  entries: MegaDexEntry[],
  options: LoadMegaCardDataOptions = {}
): Promise<void> {
  return refreshSyntheticFormCardData(
    language,
    entries,
    refreshStaticCardData,
    refreshStaticCardDataForGen,
    cardsForMegaEntry,
    options
  );
}
