import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import * as cardCache from '../storage/cardCache';
import { setCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';

const promoCard: CardRecord = {
  id: 'svp-044',
  name: 'Charmander',
  dexNumber: 4,
  setId: 'svp',
  setName: 'SV Promos',
  localId: '044',
  rarity: 'Promo',
  imageBase: 'https://assets.tcgdex.net/en/svp/svp/044',
  language: 'en',
};

function resetStore() {
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

describe('ManageGroupsPanel', () => {
  it('renames a group and saves it to the store', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const nameInputs = screen.getAllByLabelText('Group name');
    await userEvent.clear(nameInputs[0]);
    await userEvent.type(nameInputs[0], 'Renamed Group');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups[0].name).toBe('Renamed Group');
  });

  it('moves a rarity tier to a different group and saves it', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const select = screen.getByLabelText('Group for Ultra Rare');
    await userEvent.selectOptions(select, 'rainbow-gold');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const saved = useAppStore.getState().groups;
    expect(saved.find((g) => g.id === 'full-art')?.rarities).not.toContain('Ultra Rare');
    expect(saved.find((g) => g.id === 'rainbow-gold')?.rarities).toContain('Ultra Rare');
  });

  it('adds a new group', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(screen.getAllByLabelText('Group name')).toHaveLength(DEFAULT_RARITY_GROUPS.length + 1);
  });

  it('deletes a group, leaving its rarities unassigned', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const deleteButton = screen.getByRole('button', {
      name: `Delete ${DEFAULT_RARITY_GROUPS[0].name}`,
    });
    await userEvent.click(deleteButton);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups).toHaveLength(DEFAULT_RARITY_GROUPS.length - 1);
  });

  it('surfaces a rarity that only exists on a cached card, not in any group, as unassigned', async () => {
    setCachedCards('en', 4, [promoCard]);
    render(<ManageGroupsPanel onClose={() => {}} />);
    const select = screen.getByLabelText('Group for Promo');
    expect(select).toHaveValue('unassigned');

    await userEvent.selectOptions(select, 'rainbow-gold');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups.find((g) => g.id === 'rainbow-gold')?.rarities).toContain(
      'Promo'
    );
  });

  it('does not recompute the cached-rarity scan on every keystroke, only when the saved groups actually change', async () => {
    // Regression test: getAllCachedRarities() iterates every cached card
    // across every language ever fetched (easily low-thousands after a
    // couple of language refreshes), so it must not rerun on every
    // localGroups-only edit -- renaming a group re-renders this panel, but
    // `groups` (the memo's only dependency) doesn't change until Save.
    const spy = vi.spyOn(cardCache, 'getAllCachedRarities');
    render(<ManageGroupsPanel onClose={() => {}} />);
    const callsAfterMount = spy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    const nameInputs = screen.getAllByLabelText('Group name');
    await userEvent.type(nameInputs[0], 'X');
    expect(spy.mock.calls.length).toBe(callsAfterMount);

    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(spy.mock.calls.length).toBe(callsAfterMount);
  });
});
