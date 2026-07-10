import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ManageGroupsPanel } from './ManageGroupsPanel';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

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
    expect(screen.getAllByLabelText('Group name')).toHaveLength(5);
  });

  it('deletes a group, leaving its rarities unassigned', async () => {
    render(<ManageGroupsPanel onClose={() => {}} />);
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete group' });
    await userEvent.click(deleteButtons[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useAppStore.getState().groups).toHaveLength(3);
  });
});
