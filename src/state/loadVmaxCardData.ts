// Loads (or refreshes) card data for VMAX dex entries -- same synthetic-VIEW
// contract as loadMegaCardData.ts, just filtered with cardsForVmaxEntry (see
// src/data/vmaxDex.ts) instead of cardsForMegaEntry. See
// loadSyntheticFormCardData.ts for the shared core both build on.
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { cardsForVmaxEntry, type VmaxDexEntry } from '../data/vmaxDex';
import {
  loadSyntheticFormCardData,
  refreshSyntheticFormCardData,
  type LoadSyntheticFormOptions,
} from './loadSyntheticFormCardData';

export type LoadVmaxCardDataOptions = LoadSyntheticFormOptions;

export function loadVmaxCardData(
  language: string,
  entries: VmaxDexEntry[],
  options: LoadVmaxCardDataOptions = {}
): Promise<boolean> {
  return loadSyntheticFormCardData(
    language,
    entries,
    loadStaticCardData,
    loadStaticCardDataForGen,
    cardsForVmaxEntry,
    options
  );
}

export function refreshVmaxCardData(
  language: string,
  entries: VmaxDexEntry[],
  options: LoadVmaxCardDataOptions = {}
): Promise<boolean> {
  return refreshSyntheticFormCardData(
    language,
    entries,
    refreshStaticCardData,
    refreshStaticCardDataForGen,
    cardsForVmaxEntry,
    options
  );
}
