import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexGrid } from './DexGrid';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards } from '../storage/cardCache';
import { loadAllCardData } from '../state/loadCardData';

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

  it('selecting Binder view renders the binder layout instead of the sprite/card grid', () => {
    render(<DexGrid view="binder" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
    expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
  });

  it('clicking a binder slot opens the Picker for that Pokemon', async () => {
    render(<DexGrid view="binder" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />);
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
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    await screen.findByRole('dialog', { name: /card options for bulbasaur/i });

    expect(screen.getByText('Japanese Base Set #1')).toBeInTheDocument();
    expect(screen.queryByText('Base Set #1')).not.toBeInTheDocument();
  });
});
