import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Summary } from './Summary';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards, setCachedPricing } from '../storage/cardCache';
import type { CardRecord } from '../types';

const charizardCard: CardRecord = {
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

const pikachuCard: CardRecord = {
  id: 'swsh35-74',
  name: 'Pikachu VMAX',
  dexNumber: 25,
  setId: 'swsh35',
  setName: "Champion's Path",
  localId: '74',
  rarity: 'Ultra Rare',
  imageBase: 'https://assets.tcgdex.net/en/swsh/swsh35/74',
  language: 'en',
};

let tcgplayerPrice = 200;

beforeEach(() => {
  localStorage.clear();
  tcgplayerPrice = 200;
  setCachedCards('en', 6, [charizardCard]);
  setCachedCards('en', 25, [pikachuCard]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 200,
    fetchedAt: '',
  });
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('frankfurter')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            amount: 1,
            base: 'USD',
            date: '',
            rates: { EUR: 0.87, AUD: 1.44, GBP: 0.75, CAD: 1.35 },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'sv03.5-199',
          localId: '199',
          name: 'Charizard ex',
          set: { id: 'sv03.5', name: '151' },
          pricing: { tcgplayer: { 'unlimited-holofoil': { marketPrice: tcgplayerPrice } } },
        }),
      } as Response;
    })
  );
});

describe('Summary', () => {
  it('shows the total owned count out of 151', () => {
    render(<Summary />);
    expect(screen.getByText('1 / 151')).toBeInTheDocument();
  });

  it('shows the total collection value once pricing resolves', async () => {
    render(<Summary />);
    expect(await screen.findByText('200.00 USD')).toBeInTheDocument();
  });

  it('shows progress against Pokemon with at least one available card', () => {
    render(<Summary />);
    expect(screen.getByText(/1 of 2 pok.mon with an available card/i)).toBeInTheDocument();
  });

  it('refreshes market prices for owned and wishlisted cards when the button is clicked', async () => {
    render(<Summary />);
    await screen.findByText('200.00 USD');
    tcgplayerPrice = 250;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Market Prices' }));
    expect(await screen.findByText('250.00 USD')).toBeInTheDocument();
  });

  it('shows a disabled, in-flight state on the refresh button while prices are refreshing', async () => {
    render(<Summary />);
    await screen.findByText('200.00 USD');
    const refreshButton = screen.getByRole('button', { name: 'Refresh Market Prices' });
    // fireEvent.click, not userEvent.click: it dispatches and flushes React's
    // state update synchronously, so the loading state is observable right
    // after this call returns and before the mocked fetch chain (which
    // resolves via microtasks, not real I/O) has a chance to settle. Same
    // pattern as DexGrid.test.tsx's "Refresh Data" test.
    fireEvent.click(refreshButton);
    expect(refreshButton).toHaveTextContent('Refreshing prices...');
    expect(refreshButton).toBeDisabled();

    await waitFor(() => {
      expect(refreshButton).toHaveTextContent('Refresh Market Prices');
      expect(refreshButton).not.toBeDisabled();
    });
  });

  it('counts a Pokemon toward availability when its only matching card comes from a manual override, not its raw rarity', () => {
    // pikachuCard's beforeEach rarity ('Ultra Rare') already matches the
    // default 'full-art' group on its own, so overriding it to 'full-art'
    // would be a no-op coincidence and prove nothing about override wiring.
    // Re-cache dex 25 here with a rarity that matches no default group, and
    // mark both dex 6 and dex 25 owned so totalOwned is a fixed 2 regardless
    // of the override -- isolating the change under test to availableCount
    // alone. Without the override below, pikachu's card wouldn't match any
    // active group and availableCount would be 1 (Charizard only, "2 of 1");
    // only the override raises it back to 2 ("2 of 2").
    setCachedCards('en', 25, [{ ...pikachuCard, rarity: 'Promo' }]);
    useAppStore.setState({
      owned: {
        6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
        25: { dexNumber: 25, cardId: 'swsh35-74', condition: 'Near Mint', addedAt: '' },
      },
      cardOverrides: { 'swsh35-74': 'full-art' },
    });
    render(<Summary />);
    expect(screen.getByText(/2 of 2 pok.mon with an available card/i)).toBeInTheDocument();
  });

  it('clamps the progress bar fill to 100% when owned cards exceed the available count under the active filter', () => {
    // dex 1-3 have no cached card data at all (only dex 6 and 25 do, per the
    // beforeEach setup), so they don't count toward availableCount, but they
    // still count toward totalOwned — reproducing a user who owns cards for
    // Pokemon outside the currently active generation/rarity filters.
    useAppStore.setState({
      owned: {
        6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
        1: { dexNumber: 1, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
        2: { dexNumber: 2, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
        3: { dexNumber: 3, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
      },
    });
    const { container } = render(<Summary />);
    const fill = container.querySelector('.progressBarFill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});
