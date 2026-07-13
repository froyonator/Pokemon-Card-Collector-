// Generic core behind loadMegaCardData.ts/loadVmaxCardData.ts/
// loadRegionalCardData.ts: every synthetic-numbered form family (Mega, VMAX,
// the four regional families) loads the exact same way -- fetch the base
// species' own static bucket (one fetch per distinct base dex, not one per
// form entry), filter it down with that family's own name matcher, and write
// the result under the entry's SYNTHETIC number, never the base species'
// real dex number. This module holds that shared shape once instead of each
// family re-implementing it; loadMegaCardData.ts's own exported function
// names/signatures stay byte-identical to before this existed, so Mega's own
// behavior (and its existing test suite) is unaffected.
//
// Deliberately mirrors DexGrid's own static-only preload path (see
// loadStaticCardData/loadStaticCardDataForGen in api/staticDatabase.ts) and
// nothing else: there is no live-API fallback for any synthetic family. A
// language with no static coverage for the base species simply has no cards
// for it, exactly like any other static-only gap -- kept this way so every
// synthetic family makes ZERO live calls, same contract as every other
// static-covered tile.
import { generationForDexNumber } from '../data/generations';
import {
  isLatestWriteGeneration,
  reserveWriteGeneration,
  setCachedCards,
} from '../storage/cardCache';
import { preserveReferencedCards } from './loadCardData';
import type { CardRecord, OwnedRecord, WishlistRecord } from '../types';

export interface SyntheticFormEntry {
  /** Synthetic dex number this entry's filtered card list is written under. */
  number: number;
  /** The real national dex number of the base species this entry is a VIEW over. */
  baseDexNumber: number;
}

type StaticLoader = (
  language: string,
  fetchImpl?: typeof fetch
) => Promise<Record<number, CardRecord[]> | null>;
type StaticLoaderForGen = (
  language: string,
  gen: number,
  fetchImpl?: typeof fetch
) => Promise<Record<number, CardRecord[]> | null>;

export interface LoadSyntheticFormOptions {
  owned?: Record<number, OwnedRecord>;
  wishlist?: Record<number, WishlistRecord>;
  // Fired once per entry, right after that entry's own cache slot (keyed by
  // its SYNTHETIC number) has been written -- see DexGrid's per-tile "just
  // landed" bookkeeping (the rAF-coalesced dataVersion bump, the refresh
  // loading-flash's pendingRefreshDex set).
  onEntryLoaded?: (dexNumber: number) => void;
}

async function loadEntries<E extends SyntheticFormEntry>(
  language: string,
  entries: E[],
  loadGen1: StaticLoader,
  loadGen: StaticLoaderForGen,
  matchCards: (baseCards: CardRecord[], entry: E) => CardRecord[],
  options: LoadSyntheticFormOptions
): Promise<void> {
  const { owned = {}, wishlist = {}, onEntryLoaded } = options;
  if (entries.length === 0) return;

  // One static fetch per distinct BASE species' generation, not one per
  // form entry -- e.g. Urshifu's two VMAX Styles share a single dex-892
  // fetch, exactly like the normal per-generation preload shares one fetch
  // across every dex number in that generation.
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
    const filtered = matchCards(baseCards, entry);
    // Preserves an owned/wishlisted card even if it somehow falls outside
    // the freshly-filtered set -- same rationale as every other cache writer
    // in this app, see preserveReferencedCards's own doc comment.
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

// Cold-load path: reuses the per-session-memoized static loaders, so a form
// entry never re-fetches its base species' static file if a normal tile (or
// another form entry sharing the same base species) already fetched it this
// session.
export function loadSyntheticFormCardData<E extends SyntheticFormEntry>(
  language: string,
  entries: E[],
  loadGen1: StaticLoader,
  loadGen: StaticLoaderForGen,
  matchCards: (baseCards: CardRecord[], entry: E) => CardRecord[],
  options: LoadSyntheticFormOptions = {}
): Promise<void> {
  return loadEntries(language, entries, loadGen1, loadGen, matchCards, options);
}

// Refresh path: bypasses the per-session memo exactly like DexGrid's own
// Refresh Data does for normal tiles, so newly deployed static data (new
// prints, corrected names) is actually picked up. Callers pass the `refresh*`
// variants of the static loaders (see loadMegaCardData.ts for the pairing).
export function refreshSyntheticFormCardData<E extends SyntheticFormEntry>(
  language: string,
  entries: E[],
  refreshGen1: StaticLoader,
  refreshGen: StaticLoaderForGen,
  matchCards: (baseCards: CardRecord[], entry: E) => CardRecord[],
  options: LoadSyntheticFormOptions = {}
): Promise<void> {
  return loadEntries(language, entries, refreshGen1, refreshGen, matchCards, options);
}
