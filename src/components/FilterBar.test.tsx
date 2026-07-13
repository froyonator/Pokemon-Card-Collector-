import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FilterBar } from './FilterBar';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

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
  resetStore();
});

describe('FilterBar', () => {
  it('collapses the whole Filters section, and its Generations/Card rarity groups subsections, by default', () => {
    render(<FilterBar />);
    expect(screen.getByText('Filters').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Generations').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Card rarity groups').closest('details')).not.toHaveAttribute('open');
  });

  it('toggles a rarity group off and on', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByText('Filters'));
    await userEvent.click(screen.getByText('Card rarity groups'));
    const checkbox = screen.getByLabelText('Full Art');
    await userEvent.click(checkbox);
    expect(useAppStore.getState().activeGroupIds).not.toContain('full-art');
    await userEvent.click(checkbox);
    expect(useAppStore.getState().activeGroupIds).toContain('full-art');
  });

  it('changes the language', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByText('Filters'));
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'ja');
    expect(useAppStore.getState().language).toBe('ja');
  });

  it('opens the Manage Groups panel', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByText('Filters'));
    await userEvent.click(screen.getByText('Card rarity groups'));
    await userEvent.click(screen.getByRole('button', { name: 'Manage groups' }));
    expect(screen.getByRole('dialog', { name: 'Manage rarity groups' })).toBeInTheDocument();
  });

  it('toggles a generation off and on', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByText('Filters'));
    await userEvent.click(screen.getByText('Generations'));
    const checkbox = screen.getByLabelText('Generation 1 (Kanto)');
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(useAppStore.getState().selectedGenerations).not.toContain(1);
    await userEvent.click(checkbox);
    expect(useAppStore.getState().selectedGenerations).toContain(1);
  });

  it('shows a Mega checkbox in the Generations list and toggles it independently of the numbered generations', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByText('Filters'));
    await userEvent.click(screen.getByText('Generations'));
    const megaCheckbox = screen.getByLabelText('Mega');
    expect(megaCheckbox).not.toBeChecked();

    await userEvent.click(megaCheckbox);
    expect(useAppStore.getState().selectedGenerations).toContain('mega');
    // Toggling Mega on doesn't disturb the already-selected numbered generation.
    expect(useAppStore.getState().selectedGenerations).toContain(1);

    await userEvent.click(megaCheckbox);
    expect(useAppStore.getState().selectedGenerations).not.toContain('mega');
  });
});
