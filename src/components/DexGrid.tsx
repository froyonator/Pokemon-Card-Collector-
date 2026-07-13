import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { spriteUrl } from '../api/pokeapi';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import type { DexEntry } from '../data/gen1Dex';
import { entriesForGenerations, generationForDexNumber, isSyntheticDexNumber } from '../data/generations';
import { megaDexEntryByNumber, type MegaDexEntry } from '../data/megaDex';
import { vmaxDexEntryByNumber, type VmaxDexEntry } from '../data/vmaxDex';
import { excludeRegionalFormCards, regionalDexEntryByNumber, type RegionalDexEntry } from '../data/regionalDex';
import { loadSpriteManifest, megaSpriteUrls, regionalSpriteUrls, spriteUrls, vmaxSpriteUrls } from '../data/sprites';
import { loadAllCardData, preserveReferencedCards } from '../state/loadCardData';
import { loadMegaCardData, refreshMegaCardData } from '../state/loadMegaCardData';
import { loadVmaxCardData, refreshVmaxCardData } from '../state/loadVmaxCardData';
import { loadRegionalCardData, refreshRegionalCardData } from '../state/loadRegionalCardData';
import { activeRarities, availableCardsForDex, computeTileState } from '../state/selectors';
import { useAppStore } from '../state/store';
import {
  getCachedCards,
  isLatestWriteGeneration,
  reserveWriteGeneration,
  setCachedCards,
} from '../storage/cardCache';
import type { CardRecord } from '../types';
import { BinderView } from './BinderView';
import { CardZoomOverlay } from './CardZoomOverlay';
import { Picker } from './Picker';
import type { DexView } from './Sidebar';
import { Tile } from './Tile';
import styles from './DexGrid.module.css';

// Fetches, for every distinct generation represented among `entries`, the
// right static file -- Gen 1's shared per-language file via `loadGen1`, Gen
// 2-9's own data/cards/<language>/gen<N>.json via `loadGen` -- and returns a
// lookup from generation id to that generation's result (`null` when that
// generation has no static file yet, exactly like an uncovered language).
// Shared by both the auto-load preload and Refresh Data below so a mixed
// selection (e.g. Gen 1 + Gen 3) fetches each generation's own file instead
// of one of them silently reusing another's data. An entry whose generation
// can't be determined (see generationForDexNumber) is treated as Gen 1's --
// not reachable with today's contiguous GENERATIONS ranges, but a safe
// default rather than a thrown error if that ever changes.
//
// Callers must only ever pass NORMAL (non-Mega) entries here -- Mega
// entries have their own dedicated pipeline (see loadMegaCardData.ts) and
// never a per-generation static file of their own, so generationForDexNumber
// applied to a normal entry's dex number is guaranteed to return a real
// numeric generation id, never 'mega'.
async function staticDataByGeneration(
  language: string,
  entries: DexEntry[],
  loadGen1: (language: string) => Promise<Record<number, CardRecord[]> | null>,
  loadGen: (language: string, gen: number) => Promise<Record<number, CardRecord[]> | null>
): Promise<Map<number, Record<number, CardRecord[]> | null>> {
  const generationIds = [
    ...new Set(entries.map((entry) => (generationForDexNumber(entry.number) as number | undefined) ?? 1)),
  ];
  const results = await Promise.all(
    generationIds.map(async (gen) => {
      const data = gen === 1 ? await loadGen1(language) : await loadGen(language, gen);
      return [gen, data] as const;
    })
  );
  return new Map(results);
}

export interface DexGridProps {
  view: DexView;
  isManualArrangeActive: boolean;
  // Passed straight through to BinderView -- see that component's own
  // onExitManualArrange prop for why this needs to be threaded down rather
  // than owned locally (isManualArrangeActive itself is lifted all the way
  // up to App.tsx). Optional, matching BinderView's own prop: only
  // meaningful once the binder view is actually showing, which most
  // existing callers/tests here (sprite/card view) never reach.
  onExitManualArrange?: () => void;
  onLoadingChange: (isLoading: boolean) => void;
  // Bumped by the parent (via Sidebar's Refresh Data button) to trigger a
  // refresh from outside -- a counter, not a boolean, so bumping it twice in
  // a row (e.g. two quick clicks) is still two distinct triggers instead of
  // being collapsed by React's state-equality check on an unchanged value.
  refreshRequestId: number;
}

export function DexGrid({
  view,
  isManualArrangeActive,
  onExitManualArrange,
  onLoadingChange,
  refreshRequestId,
}: DexGridProps) {
  const language = useAppStore((s) => s.language);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIds = useAppStore((s) => s.activeGroupIds);
  const owned = useAppStore((s) => s.owned);
  const wishlist = useAppStore((s) => s.wishlist);
  const uploadedImages = useAppStore((s) => s.uploadedImages);
  const cardOverrides = useAppStore((s) => s.cardOverrides);
  const selectedGenerations = useAppStore((s) => s.selectedGenerations);

  const [openDexNumber, setOpenDexNumber] = useState<number | null>(null);
  // Set alongside openDexNumber whenever a Picker is opened from a binder
  // slot, so the Picker fetches "Show all cards" in that binder's own
  // language rather than the app's global language. Cleared (back to
  // undefined) whenever a Picker is opened from the ordinary sprite/card
  // grid instead, so that path keeps using the global language exactly as
  // it always has.
  const [openPickerLanguage, setOpenPickerLanguage] = useState<string | undefined>(undefined);
  // The card currently shown large in CardZoomOverlay, opened via a Tile's
  // Enlarge button. Kept here rather than in Tile (which stays
  // presentational) so this overlay -- and the specific CardRecord it shows
  // -- is owned by the same component that already resolves ownedCard per
  // dex entry in the grid map below.
  const [zoomedCard, setZoomedCard] = useState<CardRecord | null>(null);
  // Kept local (in addition to reporting every transition up via
  // onLoadingChange for Sidebar's Refresh button, now rendered outside this
  // component) because the tile grid below needs this exact value, in the
  // same render, to distinguish "still loading" from "confirmed empty" per
  // dex number -- see isLoadingDex below and the self-heal comment next to
  // it. Both this state and the prop callback are set together at every
  // call site, so they never disagree.
  const [isLoading, setIsLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  // Bumped once (at most) when src/data/sprites.ts's manifest fetch
  // resolves, purely to trigger a re-render so the tile map below picks up
  // real animated-sprite coverage instead of staying on spriteUrls()'s
  // pre-load "no animated coverage yet" default for the rest of the
  // session. spriteUrls() itself stays a synchronous, stateless lookup --
  // this is just what makes DexGrid re-read it once there's something new
  // to read.
  const [spriteManifestVersion, setSpriteManifestVersion] = useState(0);
  // Never read below -- like dataVersion's own `void` reference further
  // down, this exists purely so the state variable counts as "used" for
  // react-hooks/exhaustive-deps and eslint's no-unused-vars. The real work
  // is done by setSpriteManifestVersion just triggering a re-render, which
  // is what makes the tile map below re-call spriteUrls() and actually see
  // manifest coverage that arrived after the very first render.
  void spriteManifestVersion;

  // Memoized so the array reference is stable across renders that don't
  // change selectedGenerations, and reused below by the auto-load effect,
  // the tile map, and the openEntry lookup, instead of recomputing the
  // filter/flatMap/sort at up to three separate call sites per render.
  const dexEntries = useMemo(
    () => entriesForGenerations(selectedGenerations),
    [selectedGenerations]
  );

  // Every synthetic form family (Mega, VMAX, the four regional families)
  // needs an entirely different loading pipeline (their cards are a
  // filtered VIEW over their base species' cards, not their own fetch --
  // see state/loadMegaCardData.ts/loadVmaxCardData.ts/
  // loadRegionalCardData.ts), so every place below that drives
  // fetching/refreshing splits `dexEntries` into normal entries plus one
  // group per family. Rendering itself (the .map() further down) doesn't
  // need this split: it reads spriteUrls vs mega/vmax/regionalSpriteUrls
  // per-entry directly off dexEntries. isSyntheticDexNumber (>= 20000)
  // covers every family at once, so normalDexEntries doesn't need to check
  // each family's own lookup individually.
  const normalDexEntries = useMemo(
    () => dexEntries.filter((entry) => !isSyntheticDexNumber(entry.number)),
    [dexEntries]
  );
  const megaDexEntriesInScope = useMemo(
    () =>
      dexEntries
        .map((entry) => megaDexEntryByNumber(entry.number))
        .filter((entry): entry is MegaDexEntry => entry !== undefined),
    [dexEntries]
  );
  const vmaxDexEntriesInScope = useMemo(
    () =>
      dexEntries
        .map((entry) => vmaxDexEntryByNumber(entry.number))
        .filter((entry): entry is VmaxDexEntry => entry !== undefined),
    [dexEntries]
  );
  const regionalDexEntriesInScope = useMemo(
    () =>
      dexEntries
        .map((entry) => regionalDexEntryByNumber(entry.number))
        .filter((entry): entry is RegionalDexEntry => entry !== undefined),
    [dexEntries]
  );

  // Hoisted above the auto-load effect and handleRefreshData below (both
  // need it in scope) so the actual network fetch respects the user's live
  // Manage-Groups configuration instead of loadAllCardData's own hardcoded
  // default rarity list -- previously neither call site passed `rarities`
  // at all, so any rarity added to an active group was never fetched by the
  // normal load/refresh pipeline.
  const activeSet = useMemo(
    () => activeRarities(groups, activeGroupIds),
    [groups, activeGroupIds]
  );

  // Coalesces the up-to-151 individual onDexLoaded callbacks fired during a
  // cold-start load into at most one dataVersion bump per animation frame,
  // so tiles update incrementally as data streams in without triggering a
  // full re-render (and full localStorage cache re-read across every dex
  // number, which cardsByDexNumber's memo below does) on every single
  // dex-number completion.
  const dataVersionBumpScheduled = useRef(false);
  function scheduleDataVersionBump() {
    if (dataVersionBumpScheduled.current) return;
    dataVersionBumpScheduled.current = true;
    requestAnimationFrame(() => {
      dataVersionBumpScheduled.current = false;
      setDataVersion((v) => v + 1);
    });
  }

  // Tracks which auto-load/refresh call is the most recently started one.
  // Both call sites bump this ref and only let their own completion touch
  // isLoading/dataVersion state if they're still the current generation by
  // the time they resolve -- otherwise a straggling STALE call's
  // `.finally()`/onDexLoaded would clobber state a NEWER call already owns.
  // That alone would be harmless if it just meant a stale re-render, but
  // since isLoadingDex feeds straight into computeTileState, it would flip
  // still-loading tiles to "unavailable" instead of "loading" for the rest
  // of the newer load's duration.
  const loadGeneration = useRef(0);

  // The generation ref above only silences a stale call's effect on THIS
  // component's own state -- it does nothing to stop the stale call's
  // underlying fetches from continuing to run in the background, consuming
  // real network/API request budget alongside the newer load's own fetches.
  // This controller is aborted and replaced every time a new generation
  // starts (in both the auto-load effect and handleRefreshData), so
  // switching language/generation, or clicking Refresh, actually cancels
  // whatever was still in flight instead of just racing it.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Aborts any still-in-flight load if the component unmounts entirely,
  // so navigating away doesn't leave an abandoned fetch running.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Kicks off the self-hosted sprite manifest's ONE memoized fetch (see
  // loadSpriteManifest) once, near app start, so every tile's animated
  // sprite is available from as early a render as possible without any
  // per-tile fetch. Bumps spriteManifestVersion once it resolves (success
  // or failure -- loadSpriteManifest never rejects) purely to trigger the
  // re-render that lets the tile map below actually pick up real coverage.
  useEffect(() => {
    let cancelled = false;
    loadSpriteManifest().then(() => {
      if (!cancelled) setSpriteManifestVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dexEntries.length === 0) return;
    // Per-dex-number check, not a per-language one: this is what makes a
    // newly-selected generation get auto-fetched even after this language
    // was already cached for a previously-selected generation. Computed
    // synchronously, exactly as before the static preload below existed --
    // the preload can only ever turn a "missing" entry into a cached one,
    // never the reverse, so this is always a superset of what's still
    // genuinely missing once the (async) preload below has had its say. That
    // is what lets isLoading/onLoadingChange/the abort-controller-per-
    // generation setup right below stay perfectly synchronous, matching
    // their exact pre-existing timing, instead of being delayed behind the
    // preload's own await.
    const missingEntries = normalDexEntries.filter(
      (entry) => getCachedCards(language, entry.number) === undefined
    );
    // Every form entry currently in scope, NOT just the ones with no cache
    // entry yet -- unlike missingEntries above, a synthetic entry's cache
    // slot being present doesn't mean it's fresh: it's a computed VIEW over
    // its base species' cards (see loadMegaCardData.ts and friends), so a
    // stale slot from before a matcher/filter fix shipped would otherwise
    // sit there forever, never recomputed, until a manual Refresh Data
    // (reported live: a dirty cache from an old session kept serving pre-fix
    // results after reload). See isSyntheticDexNumber's own doc comment for
    // the general contract this follows -- recomputation itself is cheap
    // (zero network calls), so always redoing it here costs nothing but a
    // redundant filter pass.
    const missingMegaEntries = megaDexEntriesInScope.filter((entry) => isSyntheticDexNumber(entry.number));
    const missingVmaxEntries = vmaxDexEntriesInScope.filter((entry) => isSyntheticDexNumber(entry.number));
    const missingRegionalEntries = regionalDexEntriesInScope.filter((entry) => isSyntheticDexNumber(entry.number));
    const hasMissingFormEntries =
      missingMegaEntries.length > 0 || missingVmaxEntries.length > 0 || missingRegionalEntries.length > 0;
    if (missingEntries.length === 0 && !hasMissingFormEntries) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadGeneration.current += 1;
    const thisGeneration = loadGeneration.current;

    setIsLoading(true);
    onLoadingChange(true);

    // Reserved synchronously, in this same tick -- before the preload's own
    // await below -- exactly like loadAllCardData already reserves a
    // generation for each of its own accumulators before any network call.
    // This is what lets a competing writer for the same dex number (e.g.
    // "Show all cards", which reserves its own generation at the very start
    // of ITS OWN fetch) that starts after this effect but resolves before
    // this preload's await does correctly win: isLatestWriteGeneration below
    // will come back false for this preload's now-stale reservation, so it
    // skips the write instead of silently clobbering fresher data with the
    // narrower curated static set.
    const reservedGenerations = new Map(
      missingEntries.map((entry) => [entry.number, reserveWriteGeneration(language, entry.number)])
    );

    // Guards the async preload-then-fetch work below against acting after
    // this effect's own cleanup has run (unmount, or a re-run triggered by
    // language/dexEntries changing again before the preload's single await
    // resolves) -- without this, a stale attempt could still write into the
    // cache or flip isLoading/onLoadingChange for a language/generation this
    // component has already moved on from.
    let cancelled = false;

    (async () => {
      // Preload step: check this app's own static, self-hosted card
      // database (built ahead of time from the primary source, see
      // scripts/carddata/src/buildStaticDatabase.ts) for the entries computed
      // as missing above, BEFORE falling back to the live primary-source API
      // fetch below. Writes pre-populate the exact same cache missingEntries was
      // just computed from, so any dex number the static file covers is
      // subtracted from the live fetch's own work below instead of being
      // re-fetched live. Any dex number it doesn't cover (a real gap -- e.g.
      // nl/ru/pl have no static file at all, and even covered languages can
      // be missing individual dex numbers) simply falls through to that live
      // fetch completely unchanged. Also guarded by the loadGeneration
      // check, on top of `cancelled`, so a Refresh-Data click that bumps the
      // generation independently (without going through this effect's own
      // cleanup) still correctly abandons a stale preload's contribution.
      // Grouped per generation -- see staticDataByGeneration -- so a mixed
      // selection (e.g. Gen 1 + Gen 3) preloads each generation from its own
      // static file instead of one covering the other's dex numbers with
      // whatever it happened to fetch. When only Gen 1 is selected this is
      // exactly one fetch (loadStaticCardData(language)), identical to
      // before per-generation loading existed.
      //
      // Mega/VMAX/regional entries load in parallel with the normal preload
      // above, each via its own dedicated static-only pipeline (see
      // loadMegaCardData.ts/loadVmaxCardData.ts/loadRegionalCardData.ts) --
      // awaited together with the static preload so isLoading/
      // onLoadingChange (and the "stillMissing.length === 0" early return
      // right below) don't flip false while any of them is still in flight.
      // loadMegaCardData/loadVmaxCardData/loadRegionalCardData each resolve
      // to whether THEY actually wrote anything -- an entry already stamped
      // with the current SYNTHETIC_FILTER_VERSION (see
      // loadSyntheticFormCardData.ts) is left untouched, so most tab
      // switches resolve `false` here even though every entry "in scope"
      // was passed in. Used below to gate the dataVersion bump on genuine
      // writes instead of unconditionally bumping (and paying for the
      // resulting cardsByDexNumber recompute + re-render) on every load.
      const [staticByGeneration, wroteMega, wroteVmax, wroteRegional] = await Promise.all([
        staticDataByGeneration(language, missingEntries, loadStaticCardData, loadStaticCardDataForGen),
        missingMegaEntries.length > 0
          ? loadMegaCardData(language, missingMegaEntries, { owned, wishlist })
          : Promise.resolve(false),
        missingVmaxEntries.length > 0
          ? loadVmaxCardData(language, missingVmaxEntries, { owned, wishlist })
          : Promise.resolve(false),
        missingRegionalEntries.length > 0
          ? loadRegionalCardData(language, missingRegionalEntries, { owned, wishlist })
          : Promise.resolve(false),
      ]);
      if (cancelled || loadGeneration.current !== thisGeneration) return;
      if (wroteMega || wroteVmax || wroteRegional) setDataVersion((v) => v + 1);

      // The static file is the COMPLETE truth for its language and
      // generation -- it was built from a full crawl of every set, so a dex
      // number it doesn't mention genuinely has zero cards in that
      // language, and caching that emptiness is as valid as caching cards.
      // This is what makes a static-covered generation load with ZERO live
      // API calls: the previous "absent key -> fall through to the live
      // fetch" reading still fired hundreds of live requests for thin
      // languages (e.g. Chinese, where most dex numbers have no cards),
      // which is exactly the latency the static database exists to
      // eliminate. A generation with no static file at all (e.g. nl/ru/pl's
      // Gen 1, or any generation not yet deployed) never gets a write here
      // and stays in stillMissing, keeping the full live path.
      const stillMissing: DexEntry[] = [];
      let wroteAny = false;
      for (const entry of missingEntries) {
        const gen = (generationForDexNumber(entry.number) as number | undefined) ?? 1;
        const staticData = staticByGeneration.get(gen);
        if (!staticData) {
          stillMissing.push(entry);
          continue;
        }
        // preserveReferencedCards is a no-op here in practice today (a
        // "missing" entry by definition has no prior cache entry for this
        // language:dexNumber key yet, so there's nothing to preserve from)
        // -- kept for defense-in-depth and so this write path and the
        // static-first Refresh Data path below share one implementation
        // instead of two, rather than assuming that invariant holds
        // forever as this effect's own "missing" computation evolves.
        // excludeRegionalFormCards keeps a regional-tagged print (e.g.
        // "Hisuian Growlithe") off its base species' own tile -- a no-op for
        // every dex number with no regional form at all.
        const cards = preserveReferencedCards(
          excludeRegionalFormCards(entry.number, staticData[entry.number] ?? []),
          entry.number,
          owned,
          wishlist,
          language
        );
        const generation = reservedGenerations.get(entry.number);
        // A competing writer (e.g. "Show all cards") reserved a newer
        // generation for this dex number while this preload's fetch was
        // in flight -- don't overwrite whatever it wrote, and don't
        // live-fetch it either below: it's no longer this effect's job to
        // resolve, and whatever that other writer produced is already
        // correctly protected by its own generation check.
        if (generation !== undefined && isLatestWriteGeneration(language, entry.number, generation)) {
          setCachedCards(language, entry.number, cards);
          wroteAny = true;
        }
      }
      // Bumped here -- even for a partial preload, and even when it turns
      // out to cover 100% of what was missing -- so the tile grid's
      // cardsByDexNumber memo (keyed on dataVersion) actually re-reads the
      // cache and renders what the preload just wrote, instead of waiting
      // on some unrelated later trigger. Deliberately NOT calling
      // markFullPrintHistoryFetched anywhere here: "Show all cards" must
      // still do its own live fetch on first use, exactly as today -- this
      // preload only ever replaces the curated default load.
      if (wroteAny) setDataVersion((v) => v + 1);

      if (stillMissing.length === 0) {
        setIsLoading(false);
        onLoadingChange(false);
        return;
      }

      loadAllCardData(language, {
        dexEntries: stillMissing,
        rarities: [...activeSet],
        owned,
        wishlist,
        signal: controller.signal,
        onDexLoaded: () => {
          if (loadGeneration.current !== thisGeneration) return;
          scheduleDataVersionBump();
        },
      }).finally(() => {
        if (loadGeneration.current !== thisGeneration) return;
        setIsLoading(false);
        onLoadingChange(false);
        // A final catch-all flush: cheap no-op if nothing changed since the
        // last onDexLoaded-triggered bump, but guarantees the last dex
        // number's data is reflected even if its onDexLoaded fired in the
        // same frame as unmount or some other edge case.
        setDataVersion((v) => v + 1);
      });
    })();

    return () => {
      cancelled = true;
    };
    // onLoadingChange deliberately omitted: this effect should only re-run
    // when the actual data to load changes (language/dexEntries), not
    // whenever the parent happens to pass a new function identity for the
    // callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, dexEntries]);

  // Dex numbers whose refresh is still in flight, or null when no refresh
  // is running. The tile grid's generic "loading" condition (isLoading &&
  // !hasLoaded) can never fire during a refresh -- the cache still HOLDS
  // the previous data for every dex number, so hasLoaded is always true --
  // which silently killed the per-tile loading flash the refresh used to
  // show (reported live). Seeding this set with every entry at refresh
  // start and removing each dex as its fresh data lands restores it: tiles
  // drop back into the loading animation one by one until their own
  // refresh completes.
  const [pendingRefreshDex, setPendingRefreshDex] = useState<Set<number> | null>(null);

  async function handleRefreshData() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadGeneration.current += 1;
    const thisGeneration = loadGeneration.current;

    setIsLoading(true);
    onLoadingChange(true);
    setPendingRefreshDex(new Set(dexEntries.map((entry) => entry.number)));

    // Shared by both the static and live branches below, so a dex number's
    // per-tile Poke Ball loading flash (pendingRefreshDex -- see its
    // declaration above) drains identically no matter which branch actually
    // produced its fresh data.
    function onRefreshDexLoaded(dexNumber: number) {
      if (loadGeneration.current !== thisGeneration) return;
      scheduleDataVersionBump();
      setPendingRefreshDex((prev) => {
        if (!prev?.has(dexNumber)) return prev;
        const next = new Set(prev);
        next.delete(dexNumber);
        return next;
      });
    }

    try {
      // Bypasses loadStaticCardData/loadStaticCardDataForGen's per-session
      // memos (refreshStaticCardData/refreshStaticCardDataForGen always
      // issue a fresh fetch and replace the memo entry) -- the whole point
      // of clicking Refresh Data is picking up newly deployed static data,
      // not replaying whatever this session happened to fetch once before.
      // Grouped per generation -- see staticDataByGeneration -- so a mixed
      // selection refreshes each generation from its own static file
      // instead of one covering another's dex numbers. A generation the
      // static database covers is refreshed entirely from that fresh
      // static file, with ZERO live calls, mirroring the auto-load preload
      // above exactly (including deliberately NOT calling
      // clearFullPrintHistory). This is what makes Refresh Data fast:
      // before this, it unconditionally ran the full live dex x rarity
      // fan-out -- 151 dex numbers x every active rarity -- even for a
      // language the static database already covers completely.
      // Mega/VMAX/regional entries refresh in parallel via their own
      // dedicated pipelines (see loadMegaCardData.ts/loadVmaxCardData.ts/
      // loadRegionalCardData.ts) -- same "always static-only, no live
      // fallback" contract as the auto-load effect above. onRefreshDexLoaded
      // drains a form entry's dex number out of pendingRefreshDex exactly
      // like any normal entry's.
      const [staticByGeneration] = await Promise.all([
        staticDataByGeneration(language, normalDexEntries, refreshStaticCardData, refreshStaticCardDataForGen),
        megaDexEntriesInScope.length > 0
          ? refreshMegaCardData(language, megaDexEntriesInScope, {
              owned,
              wishlist,
              onEntryLoaded: onRefreshDexLoaded,
            })
          : Promise.resolve(),
        vmaxDexEntriesInScope.length > 0
          ? refreshVmaxCardData(language, vmaxDexEntriesInScope, {
              owned,
              wishlist,
              onEntryLoaded: onRefreshDexLoaded,
            })
          : Promise.resolve(),
        regionalDexEntriesInScope.length > 0
          ? refreshRegionalCardData(language, regionalDexEntriesInScope, {
              owned,
              wishlist,
              onEntryLoaded: onRefreshDexLoaded,
            })
          : Promise.resolve(),
      ]);
      if (loadGeneration.current !== thisGeneration) return;

      // Entries whose generation has no static file (e.g. nl/ru/pl's Gen 1,
      // or any generation not yet deployed) fall through to the unchanged
      // live fetch below, across every active rarity, exactly as before the
      // static-first path above existed. When every selected generation has
      // a static file, liveEntries stays empty and loadAllCardData below is
      // never called at all -- matching the old "return" behavior exactly
      // for a Gen-1-only, static-covered session.
      const liveEntries: DexEntry[] = [];
      for (const entry of normalDexEntries) {
        const gen = (generationForDexNumber(entry.number) as number | undefined) ?? 1;
        const staticData = staticByGeneration.get(gen);
        if (!staticData) {
          liveEntries.push(entry);
          continue;
        }
        const cards = preserveReferencedCards(
          excludeRegionalFormCards(entry.number, staticData[entry.number] ?? []),
          entry.number,
          owned,
          wishlist,
          language
        );
        const generation = reserveWriteGeneration(language, entry.number);
        if (isLatestWriteGeneration(language, entry.number, generation)) {
          setCachedCards(language, entry.number, cards);
        }
        onRefreshDexLoaded(entry.number);
      }

      if (liveEntries.length === 0) return;

      await loadAllCardData(language, {
        dexEntries: liveEntries,
        rarities: [...activeSet],
        owned,
        wishlist,
        signal: controller.signal,
        onDexLoaded: onRefreshDexLoaded,
      });
    } catch (err) {
      // loadAllCardData itself already resolves normally (rather than
      // rejecting) for an aborted load -- an expected, frequent outcome
      // whenever this call gets superseded -- so anything that reaches here
      // is a genuine fetch failure, not a superseded request. Logged rather
      // than silently swallowed; no user-facing toast needed, but this must
      // not skip the `finally` below, which is what stops the Refresh
      // button (and any still-loading tile) from getting stuck forever --
      // mirroring the auto-load effect's own `.finally()` just above.
      console.error('Refresh Data failed:', err);
    } finally {
      if (loadGeneration.current === thisGeneration) {
        setIsLoading(false);
        onLoadingChange(false);
        setDataVersion((v) => v + 1);
        setPendingRefreshDex(null);
      }
    }
  }

  // Fires handleRefreshData whenever the parent (Sidebar's Refresh Data
  // button, via App) bumps refreshRequestId. Skips the very first render
  // (refreshRequestId starts at 0 and shouldn't trigger a refresh before the
  // user has ever clicked the button) by tracking the previous value in a
  // ref.
  const previousRefreshRequestId = useRef(refreshRequestId);
  useEffect(() => {
    if (refreshRequestId === previousRefreshRequestId.current) return;
    previousRefreshRequestId.current = refreshRequestId;
    handleRefreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRequestId]);

  // Memoized so the cache blob (all languages x all dex numbers ever cached)
  // is only re-parsed once per dex entry when language, dexEntries, or
  // dataVersion actually change, not on every re-render — including ones
  // triggered by unrelated state like `owned` changing after
  // markOwned/unmarkOwned. Deliberately NOT keyed on `owned`: the cached
  // cards for a dex number don't change when ownership changes.
  //
  // Stores the raw getCachedCards result (CardRecord[] | undefined), not the
  // []-defaulted getAllCachedCardsForDex, so "never fetched yet" (undefined)
  // stays distinguishable from "fetched, genuinely zero cards" ([]) — that
  // distinction is exactly what the loading tile state below needs. Callers
  // that just want the cards array default to [] downstream, at the point
  // of use.
  const cardsByDexNumber = useMemo(() => {
    // dataVersion itself is never read below — it's a pure cache-busting
    // signal. The underlying data lives in localStorage (outside React's
    // reactivity), so this is how the effect above tells this memo "the
    // cache just changed, go re-read it" after a load completes. The `void`
    // reference is only here so react-hooks/exhaustive-deps sees dataVersion
    // as used and doesn't flag it as an unnecessary dependency.
    void dataVersion;
    const map = new Map<number, CardRecord[] | undefined>();
    for (const entry of dexEntries) {
      map.set(entry.number, getCachedCards(language, entry.number));
    }
    return map;
  }, [language, dexEntries, dataVersion]);

  // Latest-value refs for owned/cardsByDexNumber, read (not closed over) by
  // handleTileEnlarge below -- this is what lets that callback's own
  // identity stay permanently stable (an empty useCallback dependency
  // array) instead of changing every time owned/cardsByDexNumber do, which
  // would otherwise defeat Tile's React.memo for every tile, not just the
  // one whose ownership actually changed. Updated on every render, but only
  // ever read inside an event handler (after render), never during render
  // itself.
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  const cardsByDexNumberRef = useRef(cardsByDexNumber);
  cardsByDexNumberRef.current = cardsByDexNumber;

  // ONE stable callback shared by every Tile in the grid (see the .map()
  // below), rather than each tile getting its own fresh closure per render
  // -- Tile.tsx's own React.memo wrapper only actually skips a re-render if
  // its onClick/onEnlarge props keep the same identity across renders that
  // don't concern that specific tile. Both callbacks take the dex number as
  // an argument and look up whatever they need at call time instead of
  // closing over per-iteration data.
  const handleTileClick = useCallback((dexNumber: number) => {
    setOpenDexNumber(dexNumber);
    setOpenPickerLanguage(undefined);
  }, []);

  const handleTileEnlarge = useCallback((dexNumber: number) => {
    const ownedRecord = ownedRef.current[dexNumber];
    if (!ownedRecord) return;
    const allCards = cardsByDexNumberRef.current.get(dexNumber) ?? [];
    const ownedCard = allCards.find((c) => c.id === ownedRecord.cardId);
    if (ownedCard) setZoomedCard(ownedCard);
  }, []);

  const openEntry = openDexNumber ? dexEntries.find((e) => e.number === openDexNumber) : undefined;
  // Deliberately NOT sourced from cardsByDexNumber: that memo is keyed on
  // the grid's own global `language`, but a Picker opened from a binder
  // slot needs cards cached under THAT binder's language instead, which can
  // differ from the grid's current global language. Reading the cache
  // directly for just this one dex number (cheap -- a single lookup, not
  // the full 151-entry memo) keeps the two cases correct without forking
  // this into two separate code paths: when openPickerLanguage is unset,
  // effectivePickerLanguage just falls back to the same global language
  // cardsByDexNumber would have used anyway.
  const effectivePickerLanguage = openPickerLanguage ?? language;
  const openCards = openEntry
    ? availableCardsForDex(
        getCachedCards(effectivePickerLanguage, openEntry.number) ?? [],
        activeSet,
        cardOverrides,
        activeGroupIds
      )
    : [];

  return (
    // styles.panel here is an out-of-scope, undisclosed-at-the-time addition
    // from commit 85ca29a -- see DexGrid.module.css's .panel rule for the
    // full disclosure.
    <div className={styles.panel}>
      {dexEntries.length === 0 ? (
        <p className={styles.emptyState}>
          Select at least one generation in the filter bar to see Pokémon here.
        </p>
      ) : view === 'binder' ? (
        <BinderView
          dexEntries={dexEntries}
          owned={owned}
          dataVersion={dataVersion}
          onSlotClick={(dexNumber, language) => {
            setOpenDexNumber(dexNumber);
            setOpenPickerLanguage(language);
          }}
          isManualArrangeActive={isManualArrangeActive}
          onExitManualArrange={onExitManualArrange}
          startOnShelf
        />
      ) : (
        <div className={styles.grid} data-version={dataVersion}>
          {dexEntries.map((entry) => {
            const hasLoaded = cardsByDexNumber.get(entry.number) !== undefined;
            const allCards = cardsByDexNumber.get(entry.number) ?? [];
            const cards = availableCardsForDex(allCards, activeSet, cardOverrides, activeGroupIds);
            const ownedRecord = owned[entry.number];
            // A form tile (Mega/VMAX/regional) reads its own sprite files,
            // falling back to the base species' sprite when the manifest has
            // no coverage for it -- see mega/vmax/regionalSpriteUrls. Every
            // other tile keeps the plain per-dex-number lookup unchanged.
            const megaEntry = megaDexEntryByNumber(entry.number);
            const vmaxEntry = megaEntry ? undefined : vmaxDexEntryByNumber(entry.number);
            const regionalEntry = megaEntry || vmaxEntry ? undefined : regionalDexEntryByNumber(entry.number);
            const entrySpriteUrls = megaEntry
              ? megaSpriteUrls(megaEntry)
              : vmaxEntry
                ? vmaxSpriteUrls(vmaxEntry)
                : regionalEntry
                  ? regionalSpriteUrls(regionalEntry)
                  : spriteUrls(entry.number);
            // The old live third-party fallback has no per-form artwork to
            // build a URL from, so a form tile's onError fallback degrades
            // to its base species' own live sprite instead -- still
            // infinitely better than a broken image icon.
            const formBaseDexNumber = megaEntry?.baseDexNumber ?? vmaxEntry?.baseDexNumber ?? regionalEntry?.baseDexNumber;
            const fallbackSpriteUrl = spriteUrl(formBaseDexNumber ?? entry.number);
            // Self-heals if a fetch fails outright for some dex number: once
            // isLoading flips back to false in loadAllCardData's .finally(),
            // any dex number that never got a cache entry (its request
            // errored) falls through to hasLoaded=false, isLoading=false ->
            // not 'loading' -> the availableCount === 0 branch ->
            // 'unavailable', a reasonable fallback instead of a spinner
            // stuck forever.
            const isLoadingDex =
              (isLoading && !hasLoaded) || (pendingRefreshDex?.has(entry.number) ?? false);
            const state = computeTileState(Boolean(ownedRecord), cards.length, isLoadingDex);
            const ownedCard = ownedRecord
              ? allCards.find((c) => c.id === ownedRecord.cardId)
              : undefined;
            return (
              <div key={entry.number} data-tutorial={entry.number === 1 ? 'first-tile' : undefined}>
                <Tile
                  dexNumber={entry.number}
                  name={entry.name}
                  spriteStaticUrl={entrySpriteUrls.staticUrl}
                  spriteAnimatedUrl={entrySpriteUrls.animatedUrl}
                  spriteFallbackUrl={fallbackSpriteUrl}
                  state={state}
                  view={view}
                  ownedCardImageBase={ownedCard?.imageBase}
                  ownedCardHostedThumbUrl={ownedCard?.hostedThumbUrl}
                  uploadedImageUri={ownedCard ? uploadedImages[ownedCard.id] : undefined}
                  onEnlarge={ownedCard ? handleTileEnlarge : undefined}
                  onClick={handleTileClick}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* mode="wait": a keyboard user can Tab past the visually-covered grid
          (tiles stay focusable under the overlay) and activate a different
          tile while a Picker is open, jumping openDexNumber straight from
          one Pokemon to another without passing through null. Without
          "wait", AnimatePresence's default "sync" mode would let the
          outgoing Picker's exit animation and the incoming Picker's enter
          animation run concurrently — two stacked role="dialog" overlays
          on screen at once. "wait" forces the outgoing one to fully exit
          first. */}
      <AnimatePresence mode="wait">
        {openEntry && (
          <Picker
            key={openEntry.number}
            dexNumber={openEntry.number}
            pokemonName={openEntry.name}
            cards={openCards}
            onClose={() => setOpenDexNumber(null)}
            onAllCardsLoaded={() => setDataVersion((v) => v + 1)}
            languageOverride={openPickerLanguage}
          />
        )}
      </AnimatePresence>
      {/* AnimatePresence gives CardZoomOverlay's own exit prop (the reverse
          spin-and-shrink close) somewhere to actually play: without it,
          React would rip the overlay out of the tree the instant
          zoomedCard goes back to null, same as any other conditional
          render. */}
      <AnimatePresence>
        {zoomedCard && (
          <CardZoomOverlay
            key={zoomedCard.id}
            card={zoomedCard}
            uploadedImageUri={uploadedImages[zoomedCard.id]}
            onClose={() => setZoomedCard(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
