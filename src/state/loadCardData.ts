import { DEFAULT_RARITY_GROUPS, fetchRarityList } from '../data/defaultRarityGroups';
import { GEN1_DEX, type DexEntry } from '../data/gen1Dex';
import { deriveSetId, fetchAllCardsForDex, fetchCardDetail, fetchCardsForDexAndRarity, fetchSets } from '../api/tcgdex';
import { mapWithConcurrency } from './concurrency';
import {
  clearFullPrintHistory,
  getCachedCards,
  hasFullPrintHistory,
  isLatestWriteGeneration,
  markFullPrintHistoryFetched,
  reserveWriteGeneration,
  setCachedCards,
} from '../storage/cardCache';
import type { CardRecord, OwnedRecord, WishlistRecord } from '../types';

// Shared by loadAllCardData's dex x rarity fan-out and loadAllPrintingsForDex's
// per-card detail fan-out. Not caller-configurable: there's no current need
// to tune it, and a single constant keeps both call sites' network pressure
// consistent.
const CONCURRENCY = 6;

// An aborted fetch (via AbortController.abort()) rejects with a DOMException
// (or, in some environments, a plain Error) named 'AbortError'. This is an
// EXPECTED, frequent outcome once a caller (DexGrid) cancels a superseded
// load on every language switch / generation toggle / manual refresh -- not
// a real failure -- so callers below check this before deciding whether to
// re-throw. Duck-typed on `.name` rather than `instanceof DOMException`
// since DOMException isn't guaranteed to be the exact thrown type across
// every fetch implementation a caller might pass in (e.g. a hand-rolled
// test mock).
function isAbortError(err: unknown): boolean {
  if (err instanceof Error) return err.name === 'AbortError';
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

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
  // Lets a caller (DexGrid) cancel this call outright when a newer one
  // supersedes it (language switch, generation toggle, manual refresh),
  // instead of merely ignoring its eventual results. Checked both
  // proactively (skipping jobs not yet started once aborted, so an aborted
  // load doesn't keep consuming real network/API request budget for
  // abandoned work) and passed through to every fetch call (so genuinely
  // in-flight requests are cancelled too, not just future ones).
  signal?: AbortSignal;
  // When a dex number's owned card isn't among this curated fetch's own
  // rarity results (e.g. it's an off-catalog promo only ever discovered via
  // "Show all cards"), the write below preserves it by merging it back in
  // from whatever's already cached, instead of silently discarding it. Real
  // reported bug this fixes: refreshing data (or a plain auto-load re-run)
  // used to unconditionally replace a dex number's ENTIRE cache entry with
  // just the curated subset, orphaning an owned card's own metadata even
  // though `owned` itself still pointed at that card id -- Card/Binder view
  // then fell back to a generic sprite since the id it needed no longer
  // resolved to anything. Optional (defaults to no preservation) since not
  // every caller has ownership data on hand -- callers that do should always
  // pass it.
  owned?: Record<number, OwnedRecord>;
  // Same rationale and mechanism as `owned` above, but for a card the user
  // has wishlisted rather than owns. Without this, a curated refresh could
  // silently drop an off-catalog wishlisted card's cache entry too, leaving
  // the wishlist record itself intact but pointing at a card id that no
  // longer resolves to anything -- the Wishlist tab's Card cell then renders
  // blank. Safe to check alongside `owned` unconditionally: `markOwned`
  // always deletes any existing wishlist entry for that same dex number, so
  // a dex number is never simultaneously owned and wishlisted, and this
  // never ends up "double preserving" the same slot. Optional for the same
  // reason as `owned`: not every caller has wishlist data on hand.
  wishlist?: Record<number, WishlistRecord>;
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
  // Reserved once, right before this dex number's jobs start (i.e. at the
  // start of this "fetch attempt" for this key, not right before the
  // eventual write) -- see reserveWriteGeneration/isLatestWriteGeneration in
  // storage/cardCache.ts for the full race this guards against.
  generation: number;
}

interface Job {
  entry: DexEntry;
  rarity: string;
}

// If this dex number has an owned and/or wishlisted card that this curated
// fetch's own rarity results don't include (an off-catalog card only ever
// discovered via "Show all cards"), find it in whatever's cached right now
// and append it, so the write below doesn't silently discard it -- see
// LoadAllCardDataOptions.owned and .wishlist for the full rationale. Reads
// the EXISTING cache, not accumulator.cards itself, since accumulator.cards
// is exactly the curated-only set that's missing the card in the first
// place; if a referenced card isn't findable there either (e.g. its cache
// entry was already lost some other way), there's nothing to preserve for
// it and it's skipped. Owned and wishlisted are checked independently (not
// e.g. owned-then-wishlist-as-fallback) since, although a given dex number
// is never both at once (`markOwned` always clears any existing wishlist
// entry for that dex number), this function has no need to assume that
// invariant to stay correct.
function mergeReferencedCards(
  accumulator: DexAccumulator,
  owned: Record<number, OwnedRecord>,
  wishlist: Record<number, WishlistRecord>,
  language: string
): CardRecord[] {
  const referencedCardIds = [
    owned[accumulator.entry.number]?.cardId,
    wishlist[accumulator.entry.number]?.cardId,
  ].filter((cardId): cardId is string => cardId !== undefined);
  if (referencedCardIds.length === 0) return accumulator.cards;

  let cards = accumulator.cards;
  let existingCards: CardRecord[] | undefined;
  for (const cardId of referencedCardIds) {
    if (cards.some((card) => card.id === cardId)) continue;
    existingCards ??= getCachedCards(language, accumulator.entry.number) ?? [];
    const referencedCard = existingCards.find((card) => card.id === cardId);
    if (referencedCard) cards = [...cards, referencedCard];
  }
  return cards;
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
    owned = {},
    wishlist = {},
    fetchImpl = fetch,
    signal,
  } = options;

  try {
    const sets = await fetchSets(language, fetchImpl, signal);
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
        if (signal?.aborted) return;
        // Reserved and checked back-to-back with no `await` in between, so
        // this always wins against itself -- it's here for defensive
        // consistency with the concurrent path below (and to protect a
        // dex number this loop is about to write that some OTHER, already-
        // in-flight loadAllPrintingsForDex call for the same key might be
        // mid-fetch on right now).
        const generation = reserveWriteGeneration(language, entry.number);
        if (isLatestWriteGeneration(language, entry.number, generation)) {
          setCachedCards(language, entry.number, []);
          clearFullPrintHistory(language, entry.number);
        }
        completed += 1;
        onProgress?.({ completed, total });
        onDexLoaded?.(entry.number);
      }
      return;
    }

    const accumulators = new Map<number, DexAccumulator>(
      dexEntries.map((entry) => [
        entry.number,
        {
          entry,
          remaining: rarities.length,
          cards: [],
          // Reserved up front, at the start of this dex number's fetch
          // attempt, before any of its jobs run -- not right before the
          // eventual write -- so a later-started attempt for the same key
          // (e.g. a "Show all cards" fetch kicked off after this one) is
          // correctly recognized as fresher when both eventually try to
          // write.
          generation: reserveWriteGeneration(language, entry.number),
        },
      ])
    );

    const jobs: Job[] = [];
    for (const entry of dexEntries) {
      for (const rarity of rarities) {
        jobs.push({ entry, rarity });
      }
    }

    await mapWithConcurrency(jobs, CONCURRENCY, async ({ entry, rarity }) => {
      // Proactively skip issuing a fetch for a job that hasn't started yet
      // once aborted -- this is what stops an abandoned load from
      // continuing to consume real network/API request budget, beyond just
      // having its eventual results ignored.
      if (signal?.aborted) return;
      const briefs = await fetchCardsForDexAndRarity(entry.number, rarity, language, fetchImpl, signal);
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
        if (isLatestWriteGeneration(language, entry.number, accumulator.generation)) {
          setCachedCards(
            language,
            entry.number,
            mergeReferencedCards(accumulator, owned, wishlist, language)
          );
          // A curated-only fetch just overwrote this dex number's cache slot
          // with the narrower rarity-filtered subset, so any earlier "Show all
          // cards" full-print-history flag for it no longer describes what's
          // actually cached. Clear it so the next "Show all cards" toggle
          // re-fetches properly instead of trusting stale curated data as if it
          // were complete.
          clearFullPrintHistory(language, entry.number);
        }
        completed += 1;
        onProgress?.({ completed, total });
        onDexLoaded?.(entry.number);
      }
    });
  } catch (err) {
    // An abort is an expected, frequent outcome once a caller (DexGrid)
    // cancels a superseded load -- not a real failure -- so it resolves
    // normally instead of rejecting (which would otherwise surface as an
    // unhandled promise rejection, since callers today only .finally()
    // this call without a .catch()). A genuine fetch failure (bad status,
    // network error, etc.) still propagates exactly as before.
    if (isAbortError(err)) return;
    throw err;
  }
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
  pokemonName: string,
  fetchImpl: FetchImplParam['fetchImpl'] = fetch,
  signal?: AbortSignal
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
  // Reserved up front, at the start of this fetch attempt, before any
  // network calls -- see reserveWriteGeneration/isLatestWriteGeneration in
  // storage/cardCache.ts. Coordinates against a loadAllCardData (curated)
  // call racing on the same language:dexNumber key: if a curated fetch for
  // this same dex number starts AFTER this one (reserving a higher
  // generation) and finishes first, this call's own write below is skipped
  // so it doesn't clobber the fresher curated result.
  const generation = reserveWriteGeneration(language, dexNumber);
  try {
    const briefs = await fetchAllCardsForDex(dexNumber, pokemonName, language, fetchImpl, signal);
    // mapWithConcurrency preserves input order in its results array regardless
    // of which detail fetch resolves first, so `cards` still lines up with
    // `briefs` exactly as the old sequential loop did.
    const cards = await mapWithConcurrency(briefs, CONCURRENCY, async (brief) => {
      // Unlike loadAllCardData above, this doesn't need a separate fetchSets
      // call for a name lookup: the per-card detail response already carries
      // the correct set name directly (detail.set.name), since a full detail
      // fetch is already required here to get each card's rarity (the list
      // endpoint queried by fetchAllCardsForDex omits rarity entirely).
      const detail = await fetchCardDetail(brief.id, language, fetchImpl, signal);
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
    if (isLatestWriteGeneration(language, dexNumber, generation)) {
      setCachedCards(language, dexNumber, cards);
      markFullPrintHistoryFetched(language, dexNumber);
    }
    return cards;
  } catch (err) {
    // Same rationale as loadAllCardData: an abort is expected, not a real
    // failure, and must resolve rather than reject. Not currently wired up
    // from any caller (Picker.tsx doesn't pass a signal today), but this
    // keeps the function safe to call with one, consistent with
    // loadAllCardData, without a separate follow-up pass.
    if (isAbortError(err)) return [];
    throw err;
  }
}
