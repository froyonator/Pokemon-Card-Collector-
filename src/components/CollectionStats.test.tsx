import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CollectionStats } from './CollectionStats';
import { useAppStore } from '../state/store';
import { setCachedCards } from '../storage/cardCache';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { CardRecord } from '../types';

const fullArtCard: CardRecord = {
  id: 'sv1-1',
  name: 'Bulbasaur',
  dexNumber: 1,
  setId: 'sv1',
  setName: 'Test Set',
  localId: '1',
  rarity: 'Ultra Rare',
  imageBase: 'https://x/1',
  language: 'en',
};

function resetStore() {
  localStorage.clear();
  useAppStore.setState({
    language: 'en',
    groups: DEFAULT_RARITY_GROUPS,
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    owned: {},
    selectedGenerations: [1],
    cardOverrides: {},
  });
}

describe('CollectionStats', () => {
  beforeEach(resetStore);

  it('renders the owned/total ratio', () => {
    const owned = {
      1: { dexNumber: 1, cardId: 'sv1-1', condition: 'Near Mint' as const, addedAt: '' },
    };
    useAppStore.setState({ owned });
    render(<CollectionStats />);
    expect(screen.getByText('1/151')).toBeInTheDocument();
  });

  it('renders the missing-count badge with an accessible label', () => {
    setCachedCards('en', 1, [fullArtCard]);
    render(<CollectionStats />);
    expect(
      screen.getByRole('img', { name: /1 cards not yet owned out of 1 possible/i })
    ).toBeInTheDocument();
  });

  it('renders a gauge reflecting the owned/total percentage', () => {
    const owned = {
      1: { dexNumber: 1, cardId: 'sv1-1', condition: 'Near Mint' as const, addedAt: '' },
    };
    useAppStore.setState({ owned });
    render(<CollectionStats />);
    // 1/151 rounds to 1%.
    expect(
      screen.getByRole('img', { name: /collection progress gauge: 1 percent/i })
    ).toBeInTheDocument();
  });
});
