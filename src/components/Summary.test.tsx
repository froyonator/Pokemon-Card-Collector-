import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Summary } from './Summary';
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
  useAppStore.setState({
    language: 'en',
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
      if (url.includes('/sets')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 'sv03.5', name: '151' },
            { id: 'me04', name: 'Chaos Rising' },
          ],
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
        }),
      } as Response;
    })
  );
});

describe('Summary', () => {
  it('shows the total owned count out of 151', async () => {
    render(<Summary />);
    expect(screen.getByText('1 / 151')).toBeInTheDocument();
    // Flushes the data-currency effect's pending fetch before the test ends,
    // so its later setState doesn't land outside any act() boundary and
    // trigger a spurious warning. Every test in this file renders <Summary />,
    // which now always kicks off that fetch on mount, whether or not the
    // test cares about its result.
    await screen.findByText('Chaos Rising');
  });

  it('shows progress against Pokemon with at least one available card', async () => {
    render(<Summary />);
    expect(screen.getByText(/1 of 2 pok.mon with an available card/i)).toBeInTheDocument();
    await screen.findByText('Chaos Rising');
  });

  it('counts a Pokemon toward availability when its only matching card comes from a manual override, not its raw rarity', async () => {
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
    await screen.findByText('Chaos Rising');
  });

  it('shows the newest set name from the card database once the sets list resolves', async () => {
    render(<Summary />);
    expect(await screen.findByText('Chaos Rising')).toBeInTheDocument();
  });

  it('shows nothing for the data-currency line when the sets fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/sets')) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );
    render(<Summary />);
    await screen.findByText('1 / 151');
    expect(screen.queryByText(/card database current through/i)).not.toBeInTheDocument();
  });

  it('clamps the progress bar fill to 100% when owned cards exceed the available count under the active filter', async () => {
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
    await screen.findByText('Chaos Rising');
  });
});
