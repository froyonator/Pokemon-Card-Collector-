import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistTable } from './WishlistTable';
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

beforeEach(() => {
  localStorage.clear();
  setCachedCards('en', 6, [charizardCard]);
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
    owned: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
    wishlist: { 6: { dexNumber: 6, cardId: 'sv03.5-199', addedAt: '' } },
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

describe('WishlistTable', () => {
  it('shows a row per wishlisted card and a running total', async () => {
    render(<WishlistTable />);
    expect(await screen.findByText('Charizard')).toBeInTheDocument();
    expect(screen.getByText(/total to complete wishlist/i)).toHaveTextContent('200.00 USD');
  });

  it('removes a wishlist entry when Remove is clicked', async () => {
    render(<WishlistTable />);
    await screen.findByText('Charizard');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(useAppStore.getState().wishlist[6]).toBeUndefined();
  });

  it('shows an empty state when the wishlist is empty', () => {
    useAppStore.setState({ wishlist: {} });
    render(<WishlistTable />);
    expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument();
  });
});
