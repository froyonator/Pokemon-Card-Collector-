import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { CardRecord } from '../types';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const cardA: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const cardB: CardRecord = {
  ...cardA,
  id: 'sv03-223',
  setId: 'sv03',
  setName: 'Obsidian Flames',
  localId: '223',
};

function resetStore() {
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
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Picker', () => {
  it('shows a message when there are no matching cards', () => {
    render(<Picker dexNumber={11} pokemonName="Metapod" cards={[]} onClose={() => {}} />);
    expect(screen.getByText(/no special or full art cards match/i)).toBeInTheDocument();
  });

  it('stars a card to add it to the wishlist', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /add charizard ex to wishlist/i }));
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: cardA.id });
  });

  it('warns instead of switching when a second card is starred for the same dex number', async () => {
    render(
      <Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />
    );
    const stars = screen.getAllByRole('button', { name: /add charizard ex to wishlist/i });
    await userEvent.click(stars[0]);
    const starsAfter = screen.getAllByRole('button', { name: /add charizard ex to wishlist/i });
    await userEvent.click(starsAfter[starsAfter.length - 1]);
    expect(screen.getByRole('alert')).toHaveTextContent(/only one wishlist card/i);
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: cardA.id });
  });

  it('clicking a card body opens the condition picker, and confirming marks it owned and closes', async () => {
    const onClose = vi.fn();
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={onClose} />);
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(screen.getByText(/what condition/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Near Mint' }));
    expect(useAppStore.getState().owned[6]).toMatchObject({ cardId: cardA.id, condition: 'Near Mint' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a "Show all cards" toggle that is off by default', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /show all cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('fetches and shows every printed card, including ones outside the curated view, when toggled on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
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
          return jsonResponse([
            { id: 'svp-044', localId: '044', name: 'Charizard', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
          ]);
        }
        return jsonResponse([]);
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.queryByAltText(/charizard from svp/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(await screen.findByAltText(/charizard from svp black star promos/i)).toBeInTheDocument();
    expect(screen.getByAltText(/charizard ex from 151/i)).toBeInTheDocument();
  });

  it('shows a loading state while the full print history is being fetched, then clears it', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          return new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          });
        }
        return Promise.resolve(jsonResponse([]));
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(screen.getByText(/loading all cards/i)).toBeInTheDocument();
    resolveFetch(jsonResponse([]));
    await waitFor(() => {
      expect(screen.queryByText(/loading all cards/i)).not.toBeInTheDocument();
    });
  });

  it('does not refetch on a second toggle-on once the full print history is already cached', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
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
        return jsonResponse([
          { id: 'svp-044', localId: '044', name: 'Charizard', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
        ]);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchImpl);
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: /show all cards/i });
    await userEvent.click(toggle);
    await screen.findByAltText(/charizard from svp black star promos/i);
    const callsAfterFirstToggle = fetchImpl.mock.calls.length;
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirstToggle);
  });

  it('every shown card displays its rarity label', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByText(cardA.rarity)).toBeInTheDocument();
  });
});
