import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
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
    expect(screen.getAllByLabelText('Group name')).toHaveLength(6);
  });

  it('deletes a group, leaving its rarities unassigned', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const deleteButton = screen.getByRole('button', {
      name: `Delete ${DEFAULT_RARITY_GROUPS[0].name}`,
    });
    await userEvent.click(deleteButton);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups).toHaveLength(4);
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
});
