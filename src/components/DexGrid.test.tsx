import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexGrid } from './DexGrid';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { getCachedCards, reserveWriteGeneration, setCachedCards } from '../storage/cardCache';
import { loadAllCardData } from '../state/loadCardData';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { GEN1_DEX } from '../data/gen1Dex';
import { GEN2_DEX } from '../data/fullDex';
import { GENERATIONS } from '../data/generations';
import { MEGA_DEX_ENTRIES } from '../data/megaDex';
import type { CardRecord } from '../types';

// Wraps the real loadAllCardData in a vi.fn so most tests below get its
// genuine behavior unchanged (delegating straight through, driven by the
// module-level fetch mock like before), while a couple of tests further
// down swap in fully-controlled implementations via mockImplementationOnce
// to deterministically simulate a stale-vs-current load race without
// needing to drive hundreds of real dex x rarity fetch calls to completion.
vi.mock('../state/loadCardData', async () => {
  const actual =
    await vi.importActual<typeof import('../state/loadCardData')>('../state/loadCardData');
  return {
    ...actual,
    loadAllCardData: vi.fn(actual.loadAllCardData),
  };
});

// Fully mocked (not wrapping the real implementation, unlike loadAllCardData
// above): the real fetch-based implementation, including its own per-language
// memoization, is covered on its own in staticDatabase.test.ts. Defaulting to
// `null` here means every pre-existing test below -- none of which know or
// care about the static preload -- gets exactly the same "no static data
// available" outcome the auto-load effect always saw before this preload step
// existed, without depending on how the shared fetch mock in beforeEach
// happens to respond to a `data/cards/<language>.json` URL. Individual tests
// below override this per-call via mockResolvedValueOnce/mockImplementationOnce
// to exercise the full/partial/failed-preload paths deliberately.
// refreshStaticCardData defaults to null for the same reason as
// loadStaticCardData just above -- every pre-existing test, none of which
// know or care about the static-first refresh path, gets exactly the
// pre-existing "no static data available, fall back to the live path"
// outcome. Tests further down override this per-call.
//
// loadStaticCardDataForGen/refreshStaticCardDataForGen (Gen 2+) default to
// null for the identical reason: every pre-existing test here selects only
// Gen 1 (see the beforeEach below), so these two are never even reached by
// them -- only the multi-generation tests further down override these.
vi.mock('../api/staticDatabase', () => ({
  loadStaticCardData: vi.fn(async () => null),
  loadStaticCardDataForGen: vi.fn(async () => null),
  refreshStaticCardData: vi.fn(async () => null),
  refreshStaticCardDataForGen: vi.fn(async () => null),
}));

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    uploadedImages: {},
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return jsonResponse([
          {
            id: 'sv03.5-199',
            localId: '199',
            name: 'Charizard ex',
            image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
          },
        ]);
      }
      return jsonResponse([]);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DexGrid', () => {
  it('renders all 151 Pokemon and loads card data on mount', async () => {
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    expect(screen.getByText('Bulbasaur')).toBeInTheDocument();
    expect(screen.getByText('Mew')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
  });

  it('shows the loading tile state, not "unavailable", for a Pokemon whose dex number has not been cached yet, before the initial fetch resolves', async () => {
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    // Right after the initial render, the auto-load effect has set isLoading
    // true synchronously, but the mocked fetch chain resolves via
    // microtasks, which haven't had a chance to run yet -- so nothing is
    // cached for any dex number in this still-fresh render. Every non-owned
    // tile should read as "loading", never the "confirmed empty"
    // unavailable state, until data actually lands.
    const bulbasaurTile = screen.getByRole('button', { name: /bulbasaur/i });
    expect(bulbasaurTile).toHaveClass('tile--loading');
    expect(bulbasaurTile).not.toHaveClass('tile--unavailable');
    expect(bulbasaurTile).toHaveAttribute('aria-busy', 'true');

    // Let the fetch chain and effect resolve so no dangling act() warnings
    // leak into subsequent tests.
    await waitFor(() => {
      expect(bulbasaurTile).not.toHaveClass('tile--loading');
    });
    expect(bulbasaurTile).toHaveClass('tile--unavailable');
  });

  it('never shows the loading tile state for an already-owned Pokemon, even while its initial fetch is still in flight', () => {
    useAppStore.setState({
      owned: {
        1: { dexNumber: 1, cardId: 'some-card-id', condition: 'Near Mint', addedAt: '2024-01-01' },
      },
    });
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    const bulbasaurTile = screen.getByRole('button', { name: /bulbasaur/i });
    expect(bulbasaurTile).toHaveClass('tile--owned');
    expect(bulbasaurTile).not.toHaveClass('tile--loading');
    expect(bulbasaurTile).toHaveAttribute('aria-busy', 'false');
  });

  it('shows a genuinely mixed mid-load state: a tile already cached from a prior session settles immediately while the rest are still loading', () => {
    // Bulbasaur is pre-seeded as already cached (e.g. a prior session's
    // partial load), Ivysaur is not -- so on the very first render, before
    // any fetch resolves, the grid should show a real mix: one tile already
    // settled, the rest still 'loading', not every tile stuck in lockstep.
    setCachedCards('en', 1, [
      {
        id: 'sv03.5-999',
        name: 'Bulbasaur Star',
        dexNumber: 1,
        setId: 'sv03.5',
        setName: '151',
        localId: '999',
        rarity: 'Ultra Rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/999',
        language: 'en',
      },
    ]);

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    const bulbasaurTile = screen.getByRole('button', { name: /bulbasaur/i });
    const ivysaurTile = screen.getByRole('button', { name: /ivysaur/i });

    expect(bulbasaurTile).not.toHaveClass('tile--loading');
    expect(bulbasaurTile).toHaveClass('tile--available');
    expect(ivysaurTile).toHaveClass('tile--loading');
  });

  it('does not flip a still-loading tile to "unavailable" when a stale auto-load call resolves after language changes mid-load', async () => {
    // Fully controlled loadAllCardData calls (via the module mock declared
    // at the top of this file), one per effect run, so the exact moment
    // each "load" settles is driven by hand instead of depending on
    // draining hundreds of real dex x rarity fetches to completion.
    let resolveEn: (() => void) | undefined;
    let resolveFr: (() => void) | undefined;
    vi.mocked(loadAllCardData)
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveEn = resolve)))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFr = resolve)));

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => expect(resolveEn).toBeDefined());

    const bulbasaurTile = screen.getByRole('button', { name: /bulbasaur/i });
    expect(bulbasaurTile).toHaveClass('tile--loading');

    // Switch language mid-load: the auto-load effect reruns (its dependency
    // array includes `language`), kicking off a second, newer
    // loadAllCardData call while the first ('en') one is still unresolved.
    useAppStore.setState({ language: 'fr' });
    await waitFor(() => expect(resolveFr).toBeDefined());
    expect(bulbasaurTile).toHaveClass('tile--loading');

    // Resolve ONLY the stale 'en' call. Its .finally() must not clobber
    // isLoading, since the newer 'fr' call (a different generation) is
    // still in flight -- this is exactly the race the fix guards against.
    resolveEn!();
    // Flush the microtask queue so the stale call's .finally() has a chance
    // to run (and, before the fix, incorrectly flip isLoading to false).
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bulbasaurTile).toHaveClass('tile--loading');
    expect(bulbasaurTile).not.toHaveClass('tile--unavailable');

    // Resolving the current ('fr') call settles things normally.
    resolveFr!();
    await waitFor(() => {
      expect(bulbasaurTile).not.toHaveClass('tile--loading');
    });
  });

  it('aborts the previous load\'s AbortSignal when language changes mid-load, so the abandoned language\'s fetches actually stop instead of merely being ignored', async () => {
    // Captures the `signal` DexGrid actually passes into loadAllCardData on
    // each call, via the module mock declared at the top of this file. Each
    // call's promise never resolves on its own -- this test only cares
    // about whether DexGrid creates a fresh AbortController per load and
    // aborts the previous one, not about completion/isLoading bookkeeping
    // (covered by the test above). Two mockImplementationOnce calls, not a
    // persistent mockImplementation: exactly two loadAllCardData calls are
    // expected here, and the mock must revert to its default
    // (delegate-to-actual) behavior afterward so it doesn't leak into later
    // tests in this file.
    const seenSignals: (AbortSignal | undefined)[] = [];
    const captureSignal = (_language: string, options?: { signal?: AbortSignal }) => {
      seenSignals.push(options?.signal);
      return new Promise<void>(() => {});
    };
    vi.mocked(loadAllCardData).mockImplementationOnce(captureSignal).mockImplementationOnce(captureSignal);

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => expect(seenSignals).toHaveLength(1));
    const firstSignal = seenSignals[0];
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal?.aborted).toBe(false);

    useAppStore.setState({ language: 'fr' });
    await waitFor(() => expect(seenSignals).toHaveLength(2));

    // The 'en' load's signal must now be aborted -- this is what actually
    // stops its underlying fetches, distinct from the loadGeneration guard
    // above, which only ignores its eventual results.
    expect(firstSignal?.aborted).toBe(true);
    const secondSignal = seenSignals[1];
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal?.aborted).toBe(false);
  });

  it("fetches a rarity that only exists in a user-added active group, not just the 9 built-in DEFAULT_RARITY_GROUPS rarities", async () => {
    // Real reported bug: neither the auto-load effect nor handleRefreshData
    // ever passed `rarities` into loadAllCardData, so it silently fell back
    // to its own hardcoded default (fetchRarityList(DEFAULT_RARITY_GROUPS))
    // no matter what the user had actually configured via Manage Groups.
    // Adding "Promo" to an active group here, a rarity absent from every
    // built-in group, and asserting the mocked fetch actually got queried
    // for it is what catches a regression back to that hardcoded default.
    useAppStore.setState({
      groups: [
        ...DEFAULT_RARITY_GROUPS,
        { id: 'custom-promo', name: 'Promos', rarities: ['Promo'] },
      ],
      activeGroupIds: [...DEFAULT_RARITY_GROUPS.map((g) => g.id), 'custom-promo'],
    });
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    const calledUrls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes('rarity=eq%3APromo'))).toBe(true);
  });

  it('does not get stuck loading when a genuine (non-abort) fetch failure occurs during Refresh Data', async () => {
    // Real reported bug: handleRefreshData had no try/catch around its
    // `await loadAllCardData(...)` call, so a genuine fetch failure threw
    // past setIsLoading(false)/onLoadingChange(false), permanently
    // disabling the Refresh button and leaving any not-yet-loaded tile
    // stuck showing "loading" forever.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLoadingChange = vi.fn();
    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={onLoadingChange} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    onLoadingChange.mockClear();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response)
    );

    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={onLoadingChange} refreshRequestId={1} />
    );
    expect(onLoadingChange).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(onLoadingChange).toHaveBeenCalledWith(false);
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('opens the picker for a Pokemon with available cards when its tile is clicked', async () => {
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    await userEvent.click(screen.getByRole('button', { name: /charizard/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Charizard')).toBeInTheDocument();
  });

  it('shows an empty-state message instead of a blank grid when no generation is selected', () => {
    useAppStore.setState({ selectedGenerations: [] });
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    expect(screen.getByText(/select at least one generation/i)).toBeInTheDocument();
    expect(screen.queryByText('Bulbasaur')).not.toBeInTheDocument();
  });

  it('auto-fetches a newly-selected generation even when this language was already cached for a different one', async () => {
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    const fetchCallsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    // Re-selecting the same generation should not trigger another fetch, since
    // every dex number in it is already cached for this language.
    useAppStore.setState({ selectedGenerations: [1] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore);
  });

  it('refetches everything currently shown when refreshRequestId is bumped, unlike the passive auto-load', async () => {
    // The "Refresh Data" button itself now lives in Sidebar, outside
    // DexGrid's own render tree -- App wires a click there to bumping this
    // refreshRequestId prop, so this test drives that same contract
    // directly via a rerender instead of clicking a button that no longer
    // exists inside a DexGrid-only render.
    const onLoadingChange = vi.fn();
    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={onLoadingChange} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    const fetchCallsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    onLoadingChange.mockClear();

    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={onLoadingChange} refreshRequestId={1} />
    );
    expect(onLoadingChange).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(onLoadingChange).toHaveBeenCalledWith(false);
    });
    // Every dex number was already cached from the initial load, so this
    // only proves something re-fetched (not a no-op) if the call count grew
    // — a passive/missing-only implementation would make zero new calls here.
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      fetchCallsBefore
    );
  });

  it('drops every tile back into the loading state while its own refresh is in flight, even though old data is still cached', async () => {
    // The generic loading condition (isLoading && !hasLoaded) can never
    // fire during a refresh -- the cache still holds the previous data, so
    // hasLoaded stays true -- which silently killed the per-tile refresh
    // flash (reported live). This pins the pendingRefreshDex mechanism
    // that restores it.
    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    // Installed only now, AFTER the mount's own auto-load has already run
    // and settled -- mockImplementationOnce would otherwise be consumed by
    // that first call instead of the refresh this test is about.
    let resolveLoad!: () => void;
    vi.mocked(loadAllCardData).mockImplementationOnce(
      (_language, options) =>
        new Promise<void>((resolve) => {
          // Land ONE dex number's fresh data immediately (Bulbasaur), keep
          // the rest of the refresh hanging.
          options?.onDexLoaded?.(1);
          resolveLoad = resolve;
        })
    );
    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={1} />
    );

    // Charizard's refresh hasn't landed: back to loading despite cached data.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveAttribute('aria-busy', 'true');
    });
    // Bulbasaur's fresh data already landed: not stuck in loading.
    expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveAttribute('aria-busy', 'false');

    resolveLoad();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('colors a tile as available when its only matching card comes from a manual override, not its raw rarity', async () => {
    // Pre-seed the cache directly, bypassing the fetch-driven loadAllCardData
    // loop, with a Charizard record whose rarity is 'Promo' -- a string that
    // appears in none of DEFAULT_RARITY_GROUPS' curated rarity lists.
    //
    // This sidesteps a trap in the naive version of this test: loadAllCardData
    // fetches once per curated rarity (fetchRarityList(DEFAULT_RARITY_GROUPS))
    // and labels each returned CardRecord with whatever rarity string was
    // being *queried* for that iteration, not anything from the API response
    // itself. The top-of-file mock above returns the Charizard brief
    // unconditionally for any dexId=eq:6 request, so if this card were driven
    // through that loop it would land in the cache nine times, once per
    // curated rarity -- and one of those nine copies would always be labeled
    // rarity: 'Ultra Rare', which is exactly the 'full-art' group's own
    // seeded rarity. That copy alone would make the tile "available" on raw
    // rarity, with or without the override below, so the test would pass for
    // the wrong reason. Seeding the cache directly with a single record whose
    // rarity matches nothing avoids that coincidence entirely: without the
    // override, activeSet here is only {'Ultra Rare'} (activeGroupIds is
    // scoped to just 'full-art'), and 'Promo' isn't in it.
    setCachedCards('en', 6, [
      {
        id: 'sv03.5-199',
        name: 'Charizard ex',
        dexNumber: 6,
        setId: 'sv03.5',
        setName: '151',
        localId: '199',
        rarity: 'Promo',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        language: 'en',
      },
    ]);
    useAppStore.setState({
      cardOverrides: { 'sv03.5-199': 'full-art' },
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
    });
    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
  });

  it('updates the Card-view tile immediately after marking a card discovered only via "Show all cards" as owned, without needing Refresh Data', async () => {
    // A dedicated mock, distinguishing curated per-rarity requests (which
    // carry a `rarity=` param) from the unfiltered "show all" request (which
    // never does): the curated fetch only ever finds sv03.5-199, while the
    // full print history turns up a promo, svp-044, that was never part of
    // the curated cache. This mirrors the real gap this feature closes:
    // TCGdex tags every promo "Promo", a rarity outside the curated groups,
    // so a promo is invisible to the curated fetch no matter how special it
    // actually looks.
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charizard',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        if (url.includes('rarity=')) {
          return jsonResponse([
            {
              id: 'sv03.5-199',
              localId: '199',
              name: 'Charizard ex',
              image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
            },
          ]);
        }
        return jsonResponse([
          {
            id: 'svp-044',
            localId: '044',
            name: 'Charizard',
            image: 'https://assets.tcgdex.net/en/sv/svp/044',
          },
        ]);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchImpl);

    // Rendered directly in "card" view: the view-toggle button that used to
    // drive this switch now lives in Sidebar, outside DexGrid's own render
    // tree, so a DexGrid-only render exercises the same view via the `view`
    // prop instead of clicking a button that no longer exists here.
    render(<DexGrid view="card" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    await userEvent.click(screen.getByRole('button', { name: /charizard/i }));

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /show all cards/i }));
    const promoCardButton = await within(dialog).findByAltText(
      /charizard from svp black star promos/i
    );
    await userEvent.click(promoCardButton);
    await userEvent.click(screen.getByRole('button', { name: 'Near Mint' }));

    expect(useAppStore.getState().owned[6]).toMatchObject({ cardId: 'svp-044' });

    // No "Refresh Data" click here: this is the exact self-healing step the
    // fix removes the need for.
    await waitFor(() => {
      // Anchored to the tile's leading dex-number text (e.g. "#006"),
      // which the Enlarge button rendered beside an owned Card-view tile
      // does not have -- a bare /charizard/i now matches both, since
      // Enlarge's own accessible name ("Enlarge Charizard card") also
      // contains "charizard".
      const tile = screen.getByRole('button', { name: /^#\d+ .*charizard/i });
      const img = within(tile).getByRole('img', { name: /charizard card/i });
      expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/svp/044/low.webp');
    });
  });

  it('shows a user-uploaded replacement image on the Card-view tile for an owned card with no real image', async () => {
    setCachedCards('en', 6, [
      {
        id: 'no-image-card',
        name: 'Charizard',
        dexNumber: 6,
        setId: 'svp',
        setName: 'SVP Black Star Promos',
        localId: '044',
        rarity: 'Promo',
        imageBase: '',
        language: 'en',
      },
    ]);
    useAppStore.setState({
      owned: { 6: { dexNumber: 6, cardId: 'no-image-card', condition: 'Near Mint', addedAt: '' } },
      uploadedImages: { 'no-image-card': 'data:image/jpeg;base64,UPLOADED' },
    });

    render(<DexGrid view="card" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    // Anchored to the tile's leading dex-number text, same as the test
    // above -- a bare /charizard/i also matches the Enlarge button now
    // rendered beside this owned Card-view tile.
    const tile = await screen.findByRole('button', { name: /^#\d+ .*charizard/i });
    const img = within(tile).getByRole('img', { name: /charizard card/i });
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,UPLOADED');
  });

  it("renders an owned card's hostedThumbUrl on the Card-view tile instead of the live-API-constructed URL when present", async () => {
    setCachedCards('en', 6, [
      {
        id: 'sv03.5-199',
        name: 'Charizard ex',
        dexNumber: 6,
        setId: 'sv03.5',
        setName: '151',
        localId: '199',
        rarity: 'Special illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        hostedThumbUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp',
        language: 'en',
      },
    ]);
    useAppStore.setState({
      owned: {
        6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '2024-01-01' },
      },
    });

    render(<DexGrid view="card" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    const tile = await screen.findByRole('button', { name: /^#\d+ .*charizard/i });
    const img = within(tile).getByRole('img', { name: /charizard card/i });
    expect(img).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp'
    );
  });

  it('clicking Enlarge on an owned Card-view tile opens the zoom overlay for that card, without also opening the Picker', async () => {
    setCachedCards('en', 6, [
      {
        id: 'sv03.5-199',
        name: 'Charizard ex',
        dexNumber: 6,
        setId: 'sv03.5',
        setName: '151',
        localId: '199',
        rarity: 'Special illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        language: 'en',
      },
    ]);
    useAppStore.setState({
      owned: {
        6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '2024-01-01' },
      },
    });

    render(<DexGrid view="card" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    // Waits for the tile itself to confirm the grid has actually rendered
    // this owned card before looking for its Enlarge button specifically
    // (a distinct accessible name, so no scoping needed to disambiguate it
    // from the tile).
    await screen.findByRole('button', { name: /^#\d+ .*charizard/i });
    await userEvent.click(screen.getByRole('button', { name: /enlarge charizard card/i }));

    const zoomDialog = await screen.findByRole('dialog', { name: 'Charizard ex enlarged' });
    expect(within(zoomDialog).getByAltText(/charizard ex from 151/i)).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
    expect(
      screen.queryByRole('dialog', { name: /card options for charizard/i })
    ).not.toBeInTheDocument();
  });
});

describe('Static database preload', () => {
  function staticRecord(dexNumber: number, name: string): CardRecord {
    return {
      id: `static-${dexNumber}`,
      name,
      dexNumber,
      setId: 'static-set',
      setName: 'Static Set',
      localId: String(dexNumber),
      rarity: 'Ultra Rare',
      imageBase: `https://example.com/static/${dexNumber}`,
      language: 'en',
    };
  }

  // Precisely extracts the dex numbers actually queried by the live TCGdex
  // fetch, parsing each call's real `dexId` query param (e.g. "eq:1")
  // rather than doing a substring search over the raw URL string -- a naive
  // `url.includes('dexId=eq%3A1')` check would incorrectly also match dex
  // numbers 10-19, 100-151, etc. (their own query strings, e.g.
  // "dexId=eq%3A10", contain "dexId=eq%3A1" as a literal prefix).
  function queriedDexNumbers(): Set<number> {
    const nums = new Set<number>();
    for (const call of (fetch as ReturnType<typeof vi.fn>).mock.calls) {
      let parsed: URL;
      try {
        parsed = new URL(String(call[0]));
      } catch {
        continue;
      }
      const match = parsed.searchParams.get('dexId')?.match(/^eq:(\d+)$/);
      if (match) nums.add(Number(match[1]));
    }
    return nums;
  }

  it('skips the live fetch entirely when the static database covers every dex number for this language', async () => {
    const fullCoverage: Record<number, CardRecord[]> = {};
    for (const entry of GEN1_DEX) {
      fullCoverage[entry.number] = [staticRecord(entry.number, entry.name)];
    }
    vi.mocked(loadStaticCardData).mockResolvedValueOnce(fullCoverage);
    // loadAllCardData's mock (declared at the top of this file) is never
    // reset between tests, so its call count carries over from every test
    // that ran before this one -- a delta against this snapshot, not an
    // absolute count, is what actually proves THIS render made no new call.
    const loadAllCardDataCallsBefore = vi.mocked(loadAllCardData).mock.calls.length;

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveClass(/tile--available/);
    });
    expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    // Full static coverage means every dex number was already satisfied by
    // the preload -- the live path (loadAllCardData, and therefore the
    // network fetch it would have driven) should never run at all.
    expect(vi.mocked(loadAllCardData).mock.calls.length).toBe(loadAllCardDataCallsBefore);
    // fetch itself, unlike loadAllCardData, IS a fresh vi.fn() every test
    // (re-stubbed in this file's top-level beforeEach and unstubbed in
    // afterEach), so an absolute assertion here is safe.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('treats the static database as the complete truth: a dex number it does not mention is cached as having no cards, with NO live fetch at all', async () => {
    // Bulbasaur (#1) has cards in the static file; every other dex number
    // is absent from it. The file was built from a full crawl of its
    // language, so absence means "genuinely no cards" -- Charizard must
    // render as unavailable WITHOUT any live API traffic. (The previous
    // absent-means-fetch-live reading fired hundreds of live requests for
    // thin languages, defeating the static database's whole purpose.)
    const partialCoverage: Record<number, CardRecord[]> = {
      1: [staticRecord(1, 'Bulbasaur')],
    };
    vi.mocked(loadStaticCardData).mockResolvedValueOnce(partialCoverage);
    const loadAllCardDataCallsBefore = vi.mocked(loadAllCardData).mock.calls.length;

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveClass(/tile--available/);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--unavailable/);
    });

    expect(queriedDexNumbers().size).toBe(0);
    expect(vi.mocked(loadAllCardData).mock.calls.length).toBe(loadAllCardDataCallsBefore);
  });

  it('falls back to the existing full live-fetch behavior, completely unchanged, when the static database preload fails', async () => {
    // Explicit, even though it matches this file's own default mock: makes
    // the scenario under test unambiguous, as a dedicated regression guard
    // for every other (pre-existing) test in this file, which all exercise
    // this exact "static preload unavailable" path already.
    vi.mocked(loadStaticCardData).mockResolvedValueOnce(null);
    const loadAllCardDataCallsBefore = vi.mocked(loadAllCardData).mock.calls.length;

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    const callsDuringThisTest = vi.mocked(loadAllCardData).mock.calls.slice(loadAllCardDataCallsBefore);
    expect(callsDuringThisTest).toHaveLength(1);
    const [, options] = callsDuringThisTest[0];
    expect(options?.dexEntries).toEqual(GEN1_DEX);
  });

  it('does not let a slow preload clobber a fresher write (e.g. "Show all cards") that completes while the preload is still in flight', async () => {
    // Simulates a real race: the static preload's own fetch is slow (kept
    // pending here under direct control), and a competing writer for the
    // same dex number -- reserving its own, later generation, exactly like
    // loadAllCardData/loadAllPrintingsForDex already do for every other
    // write to this cache -- finishes first. The preload must recognize its
    // own reservation is now stale and skip its write instead of silently
    // overwriting the fresher card with its own narrower static one.
    let resolveStatic!: (value: Record<number, CardRecord[]> | null) => void;
    vi.mocked(loadStaticCardData).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatic = resolve;
      })
    );

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    // While the preload is still awaiting its fetch, a competing writer
    // reserves a newer generation for Bulbasaur's dex number and writes its
    // own, fresher card.
    const competingCard = staticRecord(1, 'Bulbasaur');
    competingCard.id = 'competing-fresher-card';
    reserveWriteGeneration('en', 1);
    setCachedCards('en', 1, [competingCard]);

    // Only now does the preload's own fetch resolve, with its own (by now
    // stale-by-generation) data for the same dex number.
    resolveStatic({ 1: [staticRecord(1, 'Bulbasaur')] });

    // The preload settles the rest of the dex as "no cards" (complete-truth
    // semantics) -- Charizard flipping to unavailable is the signal that
    // the preload's write pass has fully run.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--unavailable/);
    });
    expect(getCachedCards('en', 1)).toEqual([competingCard]);
  });
});

describe('Refresh Data static-first path', () => {
  function staticRecord(dexNumber: number, name: string): CardRecord {
    return {
      id: `static-${dexNumber}`,
      name,
      dexNumber,
      setId: 'static-set',
      setName: 'Static Set',
      localId: String(dexNumber),
      rarity: 'Ultra Rare',
      imageBase: `https://example.com/static/${dexNumber}`,
      language: 'en',
    };
  }

  it('refreshes a static-covered language entirely from the static database, with zero live loadAllCardData calls', async () => {
    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    const fullCoverage: Record<number, CardRecord[]> = {};
    for (const entry of GEN1_DEX) {
      fullCoverage[entry.number] = entry.number === 1 ? [staticRecord(1, 'Bulbasaur')] : [];
    }
    vi.mocked(refreshStaticCardData).mockResolvedValueOnce(fullCoverage);
    const loadAllCardDataCallsBefore = vi.mocked(loadAllCardData).mock.calls.length;

    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={1} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveClass(/tile--available/);
    });
    // Charizard had cards from the initial live load, but the fresh static
    // bucket (the complete truth for this language) says it has none now --
    // the refresh must actually overwrite the tile's prior state, not just
    // leave it alone.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--unavailable/);
    });
    expect(vi.mocked(loadAllCardData).mock.calls.length).toBe(loadAllCardDataCallsBefore);
    expect(vi.mocked(refreshStaticCardData)).toHaveBeenCalledWith('en');
  });

  it('bypasses the static database session memo on refresh: refreshStaticCardData is called, not loadStaticCardData, for the refresh itself', async () => {
    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    const loadStaticCallsBefore = vi.mocked(loadStaticCardData).mock.calls.length;
    const refreshStaticCallsBefore = vi.mocked(refreshStaticCardData).mock.calls.length;
    vi.mocked(refreshStaticCardData).mockResolvedValueOnce({});

    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={1} />
    );

    await waitFor(() => {
      expect(vi.mocked(refreshStaticCardData).mock.calls.length).toBe(refreshStaticCallsBefore + 1);
    });
    // The memoized loadStaticCardData path is never touched by the refresh
    // itself -- refreshStaticCardData does its own fresh fetch instead of
    // reusing (or feeding) that memo.
    expect(vi.mocked(loadStaticCardData).mock.calls.length).toBe(loadStaticCallsBefore);
  });

  it('falls back to the full live fetch on refresh for a language with no static database coverage', async () => {
    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    vi.mocked(refreshStaticCardData).mockResolvedValueOnce(null);
    const loadAllCardDataCallsBefore = vi.mocked(loadAllCardData).mock.calls.length;

    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={1} />
    );

    await waitFor(() => {
      expect(vi.mocked(loadAllCardData).mock.calls.length).toBeGreaterThan(loadAllCardDataCallsBefore);
    });
    const callsDuringThisTest = vi.mocked(loadAllCardData).mock.calls.slice(loadAllCardDataCallsBefore);
    expect(callsDuringThisTest).toHaveLength(1);
    const [, options] = callsDuringThisTest[0];
    expect(options?.dexEntries).toEqual(GEN1_DEX);
  });

  it('preserves an owned off-catalog card the fresh static bucket does not mention, during a static refresh', async () => {
    // Same real reported bug loadCardData.test.ts covers for the curated
    // live-fetch path (mergeReferencedCards), but for the static-first
    // refresh path instead: mark an off-catalog promo card owned, then
    // refresh on a language the static database covers. The static bucket
    // (built from a full crawl) genuinely has no entry for this card, so the
    // refresh must merge it back in from the existing cache rather than
    // silently dropping it.
    setCachedCards('en', 4, [
      {
        id: 'svp-044',
        name: 'Charmander',
        dexNumber: 4,
        setId: 'svp',
        setName: 'SVP Black Star Promos',
        localId: '044',
        rarity: 'Promo',
        imageBase: 'https://assets.tcgdex.net/en/sv/svp/044',
        language: 'en',
      },
    ]);
    useAppStore.setState({
      owned: { 4: { dexNumber: 4, cardId: 'svp-044', condition: 'Near Mint', addedAt: '' } },
    });

    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    const fullCoverage: Record<number, CardRecord[]> = {};
    for (const entry of GEN1_DEX) {
      fullCoverage[entry.number] = [];
    }
    vi.mocked(refreshStaticCardData).mockResolvedValueOnce(fullCoverage);

    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={1} />
    );

    await waitFor(() => {
      expect(getCachedCards('en', 4)?.map((c) => c.id)).toContain('svp-044');
    });
  });
});

describe('Binder view', () => {
  beforeEach(() => {
    useAppStore.setState({
      binders: [
        {
          id: 'default',
          name: 'My Binder',
          language: 'en',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'default',
    });
  });

  // DexGrid mounts BinderView with startOnShelf, so entering the binder tab
  // lands on the shelf of all binders first -- opening the (single) test
  // binder from there is part of the real flow these tests now exercise.
  async function openBinderFromShelf(name: RegExp) {
    await userEvent.click(screen.getByRole('button', { name }));
  }

  it('selecting Binder view lands on the binder shelf, and opening a binder shows its pages', async () => {
    render(<DexGrid view="binder" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    expect(screen.getByRole('heading', { name: /your binders/i })).toBeInTheDocument();
    await openBinderFromShelf(/open my binder/i);
    expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
  });

  it('clicking a binder slot opens the Picker for that Pokemon', async () => {
    render(<DexGrid view="binder" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await openBinderFromShelf(/open my binder/i);
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(
      await screen.findByRole('dialog', { name: /card options for bulbasaur/i })
    ).toBeInTheDocument();
  });

  it("opens the picker with the active binder's language, not the global language, when a binder slot is clicked", async () => {
    useAppStore.setState({
      language: 'en',
      binders: [
        {
          id: 'a',
          name: 'Japanese Binder',
          language: 'ja',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'a',
    });
    render(<DexGrid view="binder" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await openBinderFromShelf(/open japanese binder/i);
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    // The Picker itself doesn't render the language anywhere visibly, so
    // the languageOverride plumbing itself is already unit-tested at the
    // Picker level in Picker.test.tsx -- this test's job is just proving
    // DexGrid actually PASSES it through, which guards against someone
    // deleting that wiring later.
    expect(
      await screen.findByRole('dialog', { name: /card options for bulbasaur/i })
    ).toBeInTheDocument();
  });

  it("shows the binder's own language's cached cards, not the grid's global language's cards, when the two differ and both are cached", async () => {
    setCachedCards('en', 1, [
      {
        id: 'en-card',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'base',
        setName: 'Base Set',
        localId: '1',
        rarity: 'Ultra Rare',
        imageBase: 'https://example.com/en',
        language: 'en',
      },
    ]);
    setCachedCards('ja', 1, [
      {
        id: 'ja-card',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'base-ja',
        setName: 'Japanese Base Set',
        localId: '1',
        rarity: 'Ultra Rare',
        imageBase: 'https://example.com/ja',
        language: 'ja',
      },
    ]);
    useAppStore.setState({
      language: 'en',
      binders: [
        {
          id: 'a',
          name: 'Japanese Binder',
          language: 'ja',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'a',
    });
    render(<DexGrid view="binder" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    await openBinderFromShelf(/open japanese binder/i);
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    await screen.findByRole('dialog', { name: /card options for bulbasaur/i });

    expect(screen.getByText('Japanese Base Set #1')).toBeInTheDocument();
    expect(screen.queryByText('Base Set #1')).not.toBeInTheDocument();
  });
});

describe('Multi-generation static preload', () => {
  function staticRecordFor(dexNumber: number, name: string): CardRecord {
    return {
      id: `static-${dexNumber}`,
      name,
      dexNumber,
      setId: 'static-set',
      setName: 'Static Set',
      localId: String(dexNumber),
      rarity: 'Ultra Rare',
      imageBase: `https://example.com/static/${dexNumber}`,
      language: 'en',
    };
  }

  function fullCoverageFor(entries: { number: number; name: string }[]): Record<number, CardRecord[]> {
    const coverage: Record<number, CardRecord[]> = {};
    for (const entry of entries) {
      coverage[entry.number] = [staticRecordFor(entry.number, entry.name)];
    }
    return coverage;
  }

  it('preloads two selected generations from their own static files, with zero live calls', async () => {
    useAppStore.setState({ selectedGenerations: [1, 2] });

    vi.mocked(loadStaticCardData).mockResolvedValueOnce(fullCoverageFor(GEN1_DEX));
    vi.mocked(loadStaticCardDataForGen).mockImplementationOnce(async (_language, gen) =>
      gen === 2 ? fullCoverageFor(GEN2_DEX) : null
    );
    const loadAllCardDataCallsBefore = vi.mocked(loadAllCardData).mock.calls.length;

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveClass(/tile--available/);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /chikorita/i })).toHaveClass(/tile--available/);
    });
    // The Gen 2 boundary species (Celebi, #251) rendering confirms the whole
    // second generation's dex range is present, not just its first entry.
    expect(screen.getByRole('button', { name: /celebi/i })).toBeInTheDocument();

    // Gen 1's static loader was called with just the language, matching its
    // existing single-argument signature -- Gen 2 went through the new
    // per-generation loader instead.
    expect(vi.mocked(loadStaticCardData)).toHaveBeenCalledWith('en');
    expect(vi.mocked(loadStaticCardDataForGen)).toHaveBeenCalledWith('en', 2);
    // Full static coverage on both selected generations means the live path
    // never runs at all.
    expect(vi.mocked(loadAllCardData).mock.calls.length).toBe(loadAllCardDataCallsBefore);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the live path only for the generation missing static coverage, leaving the statically-covered one alone', async () => {
    useAppStore.setState({ selectedGenerations: [1, 2] });

    vi.mocked(loadStaticCardData).mockResolvedValueOnce(fullCoverageFor(GEN1_DEX));
    // Gen 2 has no static file yet (404) -- defaults to null already, but
    // explicit here for clarity.
    vi.mocked(loadStaticCardDataForGen).mockResolvedValueOnce(null);

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveClass(/tile--available/);
    });
    // Chikorita has no static coverage, so it goes through the live fetch
    // path (this file's default fetch mock resolves an empty card list for
    // any URL it doesn't special-case) and ends up unavailable, not stuck
    // loading forever.
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /chikorita/i })).toHaveClass(/tile--unavailable/);
      },
      { timeout: 10000 }
    );
  });

  it('refreshes two selected generations from their own static files via the gen-aware refresh functions', async () => {
    useAppStore.setState({ selectedGenerations: [1, 2] });
    vi.mocked(loadStaticCardData).mockResolvedValueOnce(fullCoverageFor(GEN1_DEX));
    vi.mocked(loadStaticCardDataForGen).mockResolvedValueOnce(fullCoverageFor(GEN2_DEX));

    const { rerender } = render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bulbasaur/i })).toHaveClass(/tile--available/);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /chikorita/i })).toHaveClass(/tile--available/);
    });

    const updatedGen1 = fullCoverageFor(GEN1_DEX);
    updatedGen1[1] = [{ ...staticRecordFor(1, 'Bulbasaur'), id: 'refreshed-1' }];
    const updatedGen2 = fullCoverageFor(GEN2_DEX);
    updatedGen2[152] = [{ ...staticRecordFor(152, 'Chikorita'), id: 'refreshed-152' }];
    vi.mocked(refreshStaticCardData).mockResolvedValueOnce(updatedGen1);
    vi.mocked(refreshStaticCardDataForGen).mockResolvedValueOnce(updatedGen2);

    // Same mounted instance, refreshRequestId bumped -- rerender (not a
    // fresh render) so the component's own "skip the first render" ref
    // (previousRefreshRequestId in DexGrid.tsx) actually sees the change and
    // fires handleRefreshData, exactly like Sidebar's Refresh Data button
    // bumping the prop on the live app would.
    rerender(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={1} />
    );

    await waitFor(() => {
      expect(vi.mocked(refreshStaticCardData)).toHaveBeenCalledWith('en');
    });
    expect(vi.mocked(refreshStaticCardDataForGen)).toHaveBeenCalledWith('en', 2);
  });
});

describe('Scale: full National Pokedex selection', () => {
  it('renders all 1025 tiles without hanging when every generation is selected', async () => {
    // Deliberately the nine real, numbered generations only -- excludes the
    // 'mega' pseudo-generation (see the "Mega grouping" describe block
    // further down for its own dedicated coverage), so this test's "full
    // National Pokedex" scale assertion (1025) stays unchanged.
    useAppStore.setState({
      selectedGenerations: GENERATIONS.filter((g) => typeof g.id === 'number').map((g) => g.id),
    });

    // Every generation resolves full static coverage (an empty card list per
    // dex number is enough -- this test is about render scale, not card
    // content), so the render never falls through to the live dex x rarity
    // fetch fan-out for 1025 entries.
    vi.mocked(loadStaticCardData).mockResolvedValueOnce({});
    vi.mocked(loadStaticCardDataForGen).mockImplementation(async () => ({}));

    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    // Pecharunt (#1025) is the very last entry across every generation --
    // finding it confirms the full range rendered, not just an early subset.
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /pecharunt/i })).toBeInTheDocument();
      },
      { timeout: 15000 }
    );
    expect(screen.getAllByRole('button')).toHaveLength(1025);
  }, 20000);
});

describe('Mega grouping', () => {
  function megaCard(overrides: Partial<CardRecord>): CardRecord {
    return {
      id: 'id',
      name: 'M Charizard-EX',
      dexNumber: 6,
      setId: 'set',
      setName: 'Test Set',
      localId: '1',
      // 'Ultra Rare' is in a default-active rarity group (see
      // defaultRarityGroups.ts) so these fixtures show up without needing
      // to touch the store's groups/activeGroupIds -- same rarity the
      // Multi-generation static preload tests above already use.
      rarity: 'Ultra Rare',
      imageBase: '',
      language: 'en',
      ...overrides,
    };
  }

  // Charizard's dex-6 static bucket: a mix of Mega and non-Mega prints, used
  // to exercise both the picker's Mega-only filter and its X/Y split.
  function charizardCoverage(): Record<number, CardRecord[]> {
    return {
      6: [
        megaCard({ id: 'legacy', name: 'M Charizard-EX' }),
        megaCard({ id: 'modern-x', name: 'Mega Charizard X ex' }),
        megaCard({ id: 'modern-y', name: 'Mega Charizard Y ex' }),
        megaCard({ id: 'plain', name: 'Charizard ex' }),
      ],
    };
  }

  it('renders one tile per Mega form, in release order, when Mega is selected', async () => {
    useAppStore.setState({ selectedGenerations: ['mega'] });
    vi.mocked(loadStaticCardData).mockResolvedValue(charizardCoverage());

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mega venusaur/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /mega audino/i })).toBeInTheDocument();

    const tiles = screen.getAllByRole('button');
    expect(tiles).toHaveLength(48);
    // MEGA_DEX_ENTRIES is already in release order -- the rendered DOM order
    // of tile names must match it exactly.
    expect(tiles.map((t) => t.getAttribute('title'))).toEqual(
      tiles.map((_t, i) => expect.stringContaining(MEGA_DEX_ENTRIES[i].name))
    );
  });

  it("uses the mega sprite path (not the base species'), falling back to the base species sprite for a slug the manifest doesn't cover", async () => {
    useAppStore.setState({ selectedGenerations: ['mega'] });
    vi.mocked(loadStaticCardData).mockResolvedValue({});

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    const tile = await screen.findByRole('button', { name: /mega charizard x/i });
    // The tile starts in the 'loading' state (no <img> yet, just the Poke
    // Ball spinner) until this entry's Mega load resolves.
    await waitFor(() => {
      const img = within(tile).getByRole('img') as HTMLImageElement;
      // No sprite manifest was loaded in this test (loadSpriteManifest's own
      // fetch isn't mocked here), so megaSpriteUrls falls all the way back to
      // the base species' plain static sprite -- dex 6's -- exactly as
      // documented for a slug the manifest doesn't list.
      expect(img.src).toContain('/sprites/static/6.png');
    });
  });

  it('opens a picker showing ONLY that species\' Mega prints, split by X/Y variant, when a Mega tile is clicked', async () => {
    useAppStore.setState({ selectedGenerations: ['mega'] });
    vi.mocked(loadStaticCardData).mockResolvedValue(charizardCoverage());

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    const tile = await screen.findByRole('button', { name: /mega charizard x/i });
    await userEvent.click(tile);

    const dialog = await screen.findByRole('dialog');
    // Each card's image/placeholder carries an accessible name of "<card
    // name> from <set name>" -- CardImage renders either a real <img alt=…>
    // or (as here, since these fixtures have no imageBase) a role="img"
    // placeholder with the same string as its aria-label, so querying by
    // role+name covers both. The legacy (variant-ambiguous) and X-specific
    // modern prints both show up on the X tile; the Y-specific print and
    // the plain non-mega "Charizard ex" print do not.
    await waitFor(() => {
      expect(within(dialog).getByRole('img', { name: /m charizard-ex from/i })).toBeInTheDocument();
    });
    expect(within(dialog).getByRole('img', { name: /mega charizard x ex from/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('img', { name: /mega charizard y ex from/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('img', { name: /^charizard ex from/i })).not.toBeInTheDocument();
  });

  it('keeps ownership of a Mega form independent of the base species: marking the Mega owned does not mark the base dex number owned', async () => {
    useAppStore.setState({ selectedGenerations: [1, 'mega'] });
    vi.mocked(loadStaticCardData).mockResolvedValue(charizardCoverage());

    render(<DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);

    const tile = await screen.findByRole('button', { name: /mega charizard x/i });
    await userEvent.click(tile);
    const dialog = await screen.findByRole('dialog');
    const cardImage = await within(dialog).findByRole('img', { name: /mega charizard x ex from/i });
    await userEvent.click(cardImage);
    await userEvent.click(screen.getByRole('button', { name: /near mint/i }));

    const megaEntry = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-x')!;
    await waitFor(() => {
      expect(useAppStore.getState().owned[megaEntry.number]).toBeDefined();
    });
    expect(useAppStore.getState().owned[6]).toBeUndefined();
  });
});
