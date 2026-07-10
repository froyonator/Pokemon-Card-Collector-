import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexGrid } from './DexGrid';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards } from '../storage/cardCache';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
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
    render(<DexGrid />);
    expect(screen.getByText('Bulbasaur')).toBeInTheDocument();
    expect(screen.getByText('Mew')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
  });

  it('opens the picker for a Pokemon with available cards when its tile is clicked', async () => {
    render(<DexGrid />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    await userEvent.click(screen.getByRole('button', { name: /charizard/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Charizard')).toBeInTheDocument();
  });

  it('switches between sprite and card view', async () => {
    render(<DexGrid />);
    const cardViewButton = screen.getByRole('button', { name: 'Card view' });
    await userEvent.click(cardViewButton);
    expect(cardViewButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty-state message instead of a blank grid when no generation is selected', () => {
    useAppStore.setState({ selectedGenerations: [] });
    render(<DexGrid />);
    expect(screen.getByText(/select at least one generation/i)).toBeInTheDocument();
    expect(screen.queryByText('Bulbasaur')).not.toBeInTheDocument();
  });

  it('auto-fetches a newly-selected generation even when this language was already cached for a different one', async () => {
    render(<DexGrid />);
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

  it('refetches everything currently shown when "Refresh Data" is clicked, unlike the passive auto-load', async () => {
    render(<DexGrid />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });
    const fetchCallsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    const refreshButton = screen.getByRole('button', { name: 'Refresh Data' });
    // fireEvent.click, not userEvent.click: it dispatches and flushes React's
    // state update synchronously, so the loading state is observable right
    // after this call returns and before the mocked fetch chain (which
    // resolves via microtasks, not real I/O) has a chance to settle.
    fireEvent.click(refreshButton);
    expect(refreshButton).toHaveTextContent('Refreshing...');
    expect(refreshButton).toBeDisabled();

    await waitFor(() => {
      expect(refreshButton).toHaveTextContent('Refresh Data');
      expect(refreshButton).not.toBeDisabled();
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
    render(<DexGrid />);
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

    render(<DexGrid />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charizard/i })).toHaveClass(/tile--available/);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Card view' }));
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
      const tile = screen.getByRole('button', { name: /charizard/i });
      const img = within(tile).getByRole('img', { name: /charizard card/i });
      expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/svp/044/low.webp');
    });
  });
});
