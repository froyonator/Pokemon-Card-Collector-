// Loads (or refreshes) card data for Mega dex entries. Unlike a normal
// generation's dexEntries, a Mega entry has no card data of its own to
// fetch: it's a synthetic-numbered VIEW over its base species' own cards
// (see src/data/megaDex.ts), filtered down to just that Mega form's prints.
//
// This deliberately mirrors DexGrid's own static-only preload path (see
// loadStaticCardData/loadStaticCardDataForGen in api/staticDatabase.ts) and
// nothing else: there is no live-API fallback for Mega entries. A language
// with no static coverage for the base species simply has no Mega cards for
// it, exactly like any other static-only gap -- kept this way so Mega
// entries make ZERO live calls, same contract as every other static-covered
// tile.
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { generationForDexNumber } from '../data/generations';
import { cardsForMegaEntry, type MegaDexEntry } from '../data/megaDex';
import {
  isLatestWriteGeneration,
  reserveWriteGeneration,
  setCachedCards,
} from '../storage/cardCache';
import { preserveReferencedCards } from './loadCardData';
import type { CardRecord, OwnedRecord, WishlistRecord } from '../types';

type StaticLoader = (
  language: string,
  fetchImpl?: typeof fetch
) => Promise<Record<number, CardRecord[]> | null>;
type StaticLoaderForGen = (
  language: string,
  gen: number,
  fetchImpl?: typeof fetch
) => Promise<Record<number, CardRecord[]> | null>;

export interface LoadMegaCardDataOptions {
  owned?: Record<number, OwnedRecord>;
  wishlist?: Record<number, WishlistRecord>;
  // Fired once per Mega entry, right after that entry's own cache slot
  // (keyed by its SYNTHETIC number) has been written -- mirrors
  // LoadAllCardDataOptions.onDexLoaded in loadCardData.ts, so a caller (
  // DexGrid) can drive the same per-tile "just landed" bookkeeping (the
  // rAF-coalesced dataVersion bump, the refresh loading-flash's
  // pendingRefreshDex set) for Mega tiles as it does for ordinary ones.
  onEntryLoaded?: (dexNumber: number) => void;
}

async function loadEntries(
  language: string,
  entries: MegaDexEntry[],
  loadGen1: StaticLoader,
  loadGen: StaticLoaderForGen,
  options: LoadMegaCardDataOptions
): Promise<void> {
  const { owned = {}, wishlist = {}, onEntryLoaded } = options;
  if (entries.length === 0) return;

  // One static fetch per distinct BASE species' generation, not one per
  // Mega entry -- Charizard's two Mega forms (X and Y) share a single
  // dex-6 fetch, exactly like the normal per-generation preload shares one
  // fetch across every dex number in that generation.
  const baseDexNumbers = [...new Set(entries.map((entry) => entry.baseDexNumber))];
  const staticByBaseDex = new Map<number, Record<number, CardRecord[]> | null>(
    await Promise.all(
      baseDexNumbers.map(async (baseDexNumber): Promise<[number, Record<number, CardRecord[]> | null]> => {
        const gen = generationForDexNumber(baseDexNumber) ?? 1;
        const data = gen === 1 ? await loadGen1(language) : await loadGen(language, gen as number);
        return [baseDexNumber, data];
      })
    )
  );

  for (const entry of entries) {
    const staticData = staticByBaseDex.get(entry.baseDexNumber);
    const baseCards = staticData?.[entry.baseDexNumber] ?? [];
    const filtered = cardsForMegaEntry(baseCards, entry);
    // Preserves an owned/wishlisted Mega card even if it somehow falls
    // outside the freshly-filtered set (e.g. a card whose name was
    // hand-reclassified) -- same rationale as every other cache writer in
    // this app, see preserveReferencedCards's own doc comment.
    const withPreserved = preserveReferencedCards(filtered, entry.number, owned, wishlist, language);
    // Written under the entry's own SYNTHETIC number, never the base
    // species' real dex number -- that cache slot is independently owned by
    // the normal per-species loader and must never be touched here.
    const generation = reserveWriteGeneration(language, entry.number);
    if (isLatestWriteGeneration(language, entry.number, generation)) {
      setCachedCards(language, entry.number, withPreserved);
    }
    onEntryLoaded?.(entry.number);
  }
}

// Cold-load path: reuses the per-session-memoized static loaders, so a Mega
// entry never re-fetches its base species' static file if a normal tile (or
// another Mega entry sharing the same base species) already fetched it this
// session.
export function loadMegaCardData(
  language: string,
  entries: MegaDexEntry[],
  options: LoadMegaCardDataOptions = {}
): Promise<void> {
  return loadEntries(language, entries, loadStaticCardData, loadStaticCardDataForGen, options);
}

// Refresh path: bypasses the per-session memo exactly like DexGrid's own
// Refresh Data does for normal tiles, so newly deployed static data (new
// Mega prints, corrected names) is actually picked up.
export function refreshMegaCardData(
  language: string,
  entries: MegaDexEntry[],
  options: LoadMegaCardDataOptions = {}
): Promise<void> {
  return loadEntries(language, entries, refreshStaticCardData, refreshStaticCardDataForGen, options);
}
