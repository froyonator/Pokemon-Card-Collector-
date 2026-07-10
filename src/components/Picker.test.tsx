import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { CardRecord } from '../types';

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
});
