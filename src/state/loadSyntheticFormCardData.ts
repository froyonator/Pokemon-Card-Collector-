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
import { generationForDexNumber, SYNTHETIC_FILTER_VERSION } from '../data/generations';
import {
  getCachedCards,
  getSyntheticFilterVersion,
  isLatestWriteGeneration,
  reserveWriteGeneration,
  setCachedCards,
  setSyntheticFilterVersion,
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

// Returns whether this call actually wrote anything -- `false` when
// `entries` was empty, or (via loadSyntheticFormCardData's needsRecompute
// narrowing) every entry passed in was already stamped with the current
// SYNTHETIC_FILTER_VERSION. Callers (DexGrid's auto-load effect) use this to
// only bump their own re-render-triggering dataVersion counter when a form
// family genuinely produced fresh data, instead of unconditionally bumping
// it -- and paying for the render and cardsByDexNumber recompute that
// implies -- on every single load whether or not anything actually changed.
async function loadEntries<E extends SyntheticFormEntry>(
  language: string,
  entries: E[],
  loadGen1: StaticLoader,
  loadGen: StaticLoaderForGen,
  matchCards: (baseCards: CardRecord[], entry: E) => CardRecord[],
  options: LoadSyntheticFormOptions
): Promise<boolean> {
  const { owned = {}, wishlist = {}, onEntryLoaded } = options;
  if (entries.length === 0) return false;

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

  let wroteAny = false;
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
      // Stamped in the SAME isLatestWriteGeneration-guarded branch as the
      // cache write itself, right alongside it -- a losing racer's stamp
      // must never land after its cache write was skipped, or a later
      // caller would wrongly read "already up to date" for data that was
      // actually never written by this call.
      setSyntheticFilterVersion(language, entry.number, SYNTHETIC_FILTER_VERSION);
      wroteAny = true;
    }
    onEntryLoaded?.(entry.number);
  }
  return wroteAny;
}

// An entry needs (re)computing when it has no cache slot at all yet, or
// when its cache slot's stamped filter version (see setSyntheticFilterVersion
// above) doesn't match the CURRENT SYNTHETIC_FILTER_VERSION -- the latter is
// what catches a matcher/filter fix retroactively, without waiting for a
// manual Refresh Data (see generations.ts's own doc comment on that
// constant for the full contract).
function needsRecompute(language: string, entry: SyntheticFormEntry): boolean {
  if (getCachedCards(language, entry.number) === undefined) return true;
  return getSyntheticFilterVersion(language, entry.number) !== SYNTHETIC_FILTER_VERSION;
}

// Cold-load path: reuses the per-session-memoized static loaders, so a form
// entry never re-fetches its base species' static file if a normal tile (or
// another form entry sharing the same base species) already fetched it this
// session.
//
// Unlike refreshSyntheticFormCardData below (an explicit user action that
// must always produce fresh results for everything in scope), this path
// first narrows `entries` down to only the ones needsRecompute actually
// flags -- an entry whose cache slot is already stamped with the current
// SYNTHETIC_FILTER_VERSION is left completely untouched: no static fetch
// contribution, no refilter, no localStorage write, no onEntryLoaded. This
// is what keeps a tab switch across hundreds of Mega/VMAX/regional entries
// fast on every visit after the first: before this existed, EVERY entry in
// scope was unconditionally refiltered and rewritten to localStorage on
// EVERY call (an intentional trade-off at the time -- see
// isSyntheticDexNumber's own doc comment -- but one that turned out to cost
// far more than "a redundant filter pass", since a naive per-entry
// localStorage write re-serializes the ENTIRE shared cache blob every
// single time; reported live as the Mega/VMAX/regional tabs turning
// sluggish). The staleness guarantee itself is unchanged: a stamp mismatch
// (including "never stamped at all", true for every entry cached before this
// mechanism existed) still forces a full recompute, exactly as unconditional
// recomputation always did.
export function loadSyntheticFormCardData<E extends SyntheticFormEntry>(
  language: string,
  entries: E[],
  loadGen1: StaticLoader,
  loadGen: StaticLoaderForGen,
  matchCards: (baseCards: CardRecord[], entry: E) => CardRecord[],
  options: LoadSyntheticFormOptions = {}
): Promise<boolean> {
  const stale = entries.filter((entry) => needsRecompute(language, entry));
  return loadEntries(language, stale, loadGen1, loadGen, matchCards, options);
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
): Promise<boolean> {
  return loadEntries(language, entries, refreshGen1, refreshGen, matchCards, options);
}
