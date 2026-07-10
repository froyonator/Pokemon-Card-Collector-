import { DEFAULT_RARITY_GROUPS, fetchRarityList } from '../data/defaultRarityGroups';
import { GEN1_DEX, type DexEntry } from '../data/gen1Dex';
import { deriveSetId, fetchAllCardsForDex, fetchCardDetail, fetchCardsForDexAndRarity, fetchSets } from '../api/tcgdex';
import { mapWithConcurrency } from './concurrency';
import {
  clearFullPrintHistory,
  getCachedCards,
  hasFullPrintHistory,
  markFullPrintHistoryFetched,
  setCachedCards,
} from '../storage/cardCache';
import type { CardRecord } from '../types';

// Shared by loadAllCardData's dex x rarity fan-out and loadAllPrintingsForDex's
// per-card detail fan-out. Not caller-configurable: there's no current need
// to tune it, and a single constant keeps both call sites' network pressure
// consistent.
const CONCURRENCY = 6;

export interface LoadProgress {
  completed: number;
  total: number;
}

export interface LoadAllCardDataOptions {
  dexEntries?: DexEntry[];
  rarities?: string[];
  onProgress?: (progress: LoadProgress) => void;
  // Fired exactly once per dex number, as soon as that dex number's own
  // rarity queries are all done -- not once at the very end of the whole
  // batch. Lets a caller (DexGrid) update the screen incrementally as data
  // streams in under concurrency, instead of only after all ~151 dex numbers
  // finish.
  onDexLoaded?: (dexNumber: number) => void;
  // Method-shorthand syntax, not `fetchImpl?: typeof fetch`. Under this
  // project's strict mode, a plain function-typed property is checked
  // contravariantly, and this test file's mock needs an explicitly
  // `(url: string) => ...` typed callback (it branches on the URL), which
  // fails that check. Method-shorthand members use bivariant checking
  // instead and compile cleanly, with no change to runtime behavior.
  fetchImpl?(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DexAccumulator {
  entry: DexEntry;
  remaining: number;
  cards: CardRecord[];
}

interface Job {
  entry: DexEntry;
  rarity: string;
}

export async function loadAllCardData(
  language: string,
  options: LoadAllCardDataOptions = {}
): Promise<void> {
  const {
    dexEntries = GEN1_DEX,
    rarities = fetchRarityList(DEFAULT_RARITY_GROUPS),
    onProgress,
    onDexLoaded,
    fetchImpl = fetch,
  } = options;

  const sets = await fetchSets(language, fetchImpl);
  const setNameById = new Map(sets.map((s) => [s.id, s.name]));

  // Defensive check, not currently reachable in production: GEN1_DEX has no
  // duplicates and entriesForGenerations doesn't produce any either. Worth
  // guarding anyway, since the accumulator below is keyed strictly by dex
  // number with `remaining` initialized to exactly `rarities.length` -- a
  // duplicate entry would still only get ONE accumulator, so its `remaining`
  // counter would hit zero after only half the actual job count, firing
  // setCachedCards/onProgress/onDexLoaded prematurely and silently dropping
  // the other copy's cards.
  const seenDexNumbers = new Set<number>();
  for (const entry of dexEntries) {
    if (seenDexNumbers.has(entry.number)) {
      console.warn(
        `loadAllCardData: dexEntries contains a duplicate dex number (${entry.number}). ` +
          "Each dex number's card data may be incomplete: the accumulator design keys " +
          'strictly by dex number, so only one copy\'s worth of rarity jobs gets counted ' +
          "toward completion. Deduplicate dexEntries before calling loadAllCardData."
      );
      break;
    }
    seenDexNumbers.add(entry.number);
  }

  const total = dexEntries.length;
  let completed = 0;

  // Guard: if `rarities` is empty (e.g. every rarity group has been emptied
  // via Manage Groups), there are zero jobs below and the remaining-counter
  // completion branch would never fire for any dex number, silently skipping
  // setCachedCards/onProgress/onDexLoaded entirely. Handle it directly
  // instead, so every dex number still gets cached (as empty) and reported.
  if (rarities.length === 0) {
    for (const entry of dexEntries) {
      setCachedCards(language, entry.number, []);
      clearFullPrintHistory(language, entry.number);
      completed += 1;
      onProgress?.({ completed, total });
      onDexLoaded?.(entry.number);
    }
    return;
  }

  const accumulators = new Map<number, DexAccumulator>(
    dexEntries.map((entry) => [entry.number, { entry, remaining: rarities.length, cards: [] }])
  );

  const jobs: Job[] = [];
  for (const entry of dexEntries) {
    for (const rarity of rarities) {
      jobs.push({ entry, rarity });
    }
  }

  await mapWithConcurrency(jobs, CONCURRENCY, async ({ entry, rarity }) => {
    const briefs = await fetchCardsForDexAndRarity(entry.number, rarity, language, fetchImpl);
    const accumulator = accumulators.get(entry.number);
    if (!accumulator) return;
    for (const brief of briefs) {
      const setId = deriveSetId(brief.id, brief.localId);
      accumulator.cards.push({
        id: brief.id,
        name: brief.name,
        dexNumber: entry.number,
        setId,
        setName: setNameById.get(setId) ?? setId,
        localId: brief.localId,
        rarity,
        imageBase: brief.image ?? '',
        language,
      });
    }
    accumulator.remaining -= 1;
    if (accumulator.remaining === 0) {
      setCachedCards(language, entry.number, accumulator.cards);
      // A curated-only fetch just overwrote this dex number's cache slot
      // with the narrower rarity-filtered subset, so any earlier "Show all
      // cards" full-print-history flag for it no longer describes what's
      // actually cached. Clear it so the next "Show all cards" toggle
      // re-fetches properly instead of trusting stale curated data as if it
      // were complete.
      clearFullPrintHistory(language, entry.number);
      completed += 1;
      onProgress?.({ completed, total });
      onDexLoaded?.(entry.number);
    }
  });
}

export function getAllCachedCardsForDex(language: string, dexNumber: number): CardRecord[] {
  return getCachedCards(language, dexNumber) ?? [];
}

// Same method-shorthand workaround as LoadAllCardDataOptions.fetchImpl above:
// a plain `fetchImpl: typeof fetch = fetch` parameter is checked
// contravariantly under this project's strict mode, which rejects this
// file's test mocks (`vi.fn(async (url: string) => ...)`, explicitly typed
// to just `string`). Routing the parameter's type through a method-shorthand
// interface member gets bivariant checking instead, with no runtime change.
interface FetchImplParam {
  fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export async function loadAllPrintingsForDex(
  language: string,
  dexNumber: number,
  fetchImpl: FetchImplParam['fetchImpl'] = fetch
): Promise<CardRecord[]> {
  // Per the design spec, "Show all cards" fetches on first use only and does
  // not refetch on every open once cached. A Picker mount only remembers
  // this in local component state, which resets every time the picker is
  // closed and reopened (it's a fresh mount), so the durable signal has to
  // live in localStorage instead, via hasFullPrintHistory/
  // markFullPrintHistoryFetched, not in any caller's in-memory state.
  if (hasFullPrintHistory(language, dexNumber)) {
    const cached = getCachedCards(language, dexNumber);
    if (cached) return cached;
  }
  const briefs = await fetchAllCardsForDex(dexNumber, language, fetchImpl);
  // mapWithConcurrency preserves input order in its results array regardless
  // of which detail fetch resolves first, so `cards` still lines up with
  // `briefs` exactly as the old sequential loop did.
  const cards = await mapWithConcurrency(briefs, CONCURRENCY, async (brief) => {
    // Unlike loadAllCardData above, this doesn't need a separate fetchSets
    // call for a name lookup: the per-card detail response already carries
    // the correct set name directly (detail.set.name), since a full detail
    // fetch is already required here to get each card's rarity (the list
    // endpoint queried by fetchAllCardsForDex omits rarity entirely).
    const detail = await fetchCardDetail(brief.id, language, fetchImpl);
    const setId = deriveSetId(brief.id, brief.localId);
    const card: CardRecord = {
      id: brief.id,
      name: brief.name,
      dexNumber,
      setId,
      setName: detail.set.name,
      localId: brief.localId,
      rarity: detail.rarity ?? 'Unknown',
      imageBase: brief.image ?? '',
      language,
    };
    return card;
  });
  setCachedCards(language, dexNumber, cards);
  markFullPrintHistoryFetched(language, dexNumber);
  return cards;
}
