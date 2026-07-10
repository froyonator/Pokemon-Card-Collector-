import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionTable } from './CollectionTable';
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

beforeEach(() => {
  localStorage.clear();
  setCachedCards('en', 6, [charizardCard]);
  setCachedCards('en', 25, [pikachuCard]);
  setCachedPricing('sv03.5-199', {
    cardId: 'sv03.5-199',
    cardmarketEurAvg: 372.8,
    tcgplayerUsdMarket: 200,
    fetchedAt: '',
  });
  setCachedPricing('swsh35-74', {
    cardId: 'swsh35-74',
    cardmarketEurAvg: 100,
    tcgplayerUsdMarket: 500,
    fetchedAt: '',
  });
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {
      6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' },
      25: { dexNumber: 25, cardId: 'swsh35-74', condition: 'Mint', addedAt: '' },
    },
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ amount: 1, base: 'USD', date: '', rates: { EUR: 0.87, AUD: 1.44, GBP: 0.75, CAD: 1.35 } }),
    })
  );
});

describe('CollectionTable', () => {
  it('shows a row per owned card with its condition', async () => {
    render(<CollectionTable />);
    expect(await screen.findByText('Charizard')).toBeInTheDocument();
    expect(screen.getByText('Pikachu')).toBeInTheDocument();
    expect(screen.getByText('Near Mint')).toBeInTheDocument();
    expect(screen.getByText('Mint')).toBeInTheDocument();
  });

  it('sorts by price when the Price header is clicked', async () => {
    render(<CollectionTable />);
    await screen.findByText('Charizard');
    await userEvent.click(screen.getByRole('button', { name: 'Price' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Charizard');
  });

  it('removes a row when Remove is clicked', async () => {
    render(<CollectionTable />);
    await screen.findByText('Charizard');
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[0]);
    expect(Object.keys(useAppStore.getState().owned)).toHaveLength(1);
  });

  it('shows an empty state when nothing is owned', () => {
    useAppStore.setState({ owned: {} });
    render(<CollectionTable />);
    expect(screen.getByText(/have not marked any cards/i)).toBeInTheDocument();
  });
});
