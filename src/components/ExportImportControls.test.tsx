import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExportImportControls } from './ExportImportControls';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

beforeEach(() => {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
    wishlist: {},
    selectedGenerations: [1],
    hasUnsavedChanges: false,
  });
});

describe('ExportImportControls', () => {
  it('shows an error for a file that is not a valid export', async () => {
    render(<ExportImportControls />);
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a confirmation dialog for a valid export, and imports on confirm', async () => {
    render(<ExportImportControls />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('dialog', { name: 'Confirm import' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite and import' }));
    expect(useAppStore.getState().language).toBe('ja');
    expect(useAppStore.getState().currency).toBe('EUR');
  });

  it('cancelling the confirmation does not change the store', async () => {
    render(<ExportImportControls />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await screen.findByRole('dialog', { name: 'Confirm import' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().language).toBe('en');
    expect(screen.queryByRole('dialog', { name: 'Confirm import' })).not.toBeInTheDocument();
  });

  it('marks changes as saved after exporting', async () => {
    useAppStore.setState({ hasUnsavedChanges: true });
    render(<ExportImportControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Export my collection' }));
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});
