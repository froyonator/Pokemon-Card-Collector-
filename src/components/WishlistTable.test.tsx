import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { WishlistTable } from './WishlistTable';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards } from '../storage/cardCache';
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
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
    wishlist: { 6: { dexNumber: 6, cardId: 'sv03.5-199', addedAt: '' } },
  });
});

describe('WishlistTable', () => {
  it('shows a row per wishlisted card', async () => {
    render(<WishlistTable />);
    expect(await screen.findByText('Charizard')).toBeInTheDocument();
  });

  it('removes a wishlist entry when Remove is clicked', async () => {
    render(<WishlistTable />);
    await screen.findByText('Charizard');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Charizard' }));
    expect(useAppStore.getState().wishlist[6]).toBeUndefined();
  });

  it('shows an empty state when the wishlist is empty', () => {
    useAppStore.setState({ wishlist: {} });
    render(<WishlistTable />);
    expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument();
  });

  it("renders a card's hostedThumbUrl instead of the live-API-constructed URL when present", async () => {
    setCachedCards('en', 6, [
      {
        ...charizardCard,
        hostedThumbUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp',
      },
    ]);
    render(<WishlistTable />);
    await screen.findByText('Charizard');
    expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp'
    );
  });

  it('renders exactly as before (the live-API-constructed URL) when a card has no hostedThumbUrl', async () => {
    render(<WishlistTable />);
    await screen.findByText('Charizard');
    expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
    );
  });
});
