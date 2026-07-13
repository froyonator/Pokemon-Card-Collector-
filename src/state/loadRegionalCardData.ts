// Loads (or refreshes) card data for regional-form dex entries (Alolan/
// Galarian/Hisuian/Paldean) -- same synthetic-VIEW contract as
// loadMegaCardData.ts, just filtered with cardsForRegionalEntry (see
// src/data/regionalDex.ts) instead of cardsForMegaEntry. See
// loadSyntheticFormCardData.ts for the shared core both build on.
//
// Unlike Mega/VMAX, a regional form's cards are NOT purely additive on top
// of its base species' own tile: see regionalDex.ts's excludeRegionalFormCards,
// applied wherever a BASE species' own cache slot is written (state/
// loadCardData.ts, components/DexGrid.tsx), which is what keeps a regional
// print off its base species' tile once this entry's own tile exists to
// show it instead.
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { cardsForRegionalEntry, type RegionalDexEntry } from '../data/regionalDex';
import {
  loadSyntheticFormCardData,
  refreshSyntheticFormCardData,
  type LoadSyntheticFormOptions,
} from './loadSyntheticFormCardData';

export type LoadRegionalCardDataOptions = LoadSyntheticFormOptions;

export function loadRegionalCardData(
  language: string,
  entries: RegionalDexEntry[],
  options: LoadRegionalCardDataOptions = {}
): Promise<void> {
  return loadSyntheticFormCardData(
    language,
    entries,
    loadStaticCardData,
    loadStaticCardDataForGen,
    cardsForRegionalEntry,
    options
  );
}

export function refreshRegionalCardData(
  language: string,
  entries: RegionalDexEntry[],
  options: LoadRegionalCardDataOptions = {}
): Promise<void> {
  return refreshSyntheticFormCardData(
    language,
    entries,
    refreshStaticCardData,
    refreshStaticCardDataForGen,
    cardsForRegionalEntry,
    options
  );
}
