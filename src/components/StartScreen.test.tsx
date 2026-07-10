import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartScreen } from './StartScreen';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

beforeEach(() => {
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
});

describe('StartScreen', () => {
  it('calls onComplete without touching the store when starting a new collection', async () => {
    const onComplete = vi.fn();
    render(<StartScreen onComplete={onComplete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start a New Collection' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().owned).toEqual({});
  });

  it('shows the confirmation dialog for a valid backup file, and only imports on confirm', async () => {
    const onComplete = vi.fn();
    render(<StartScreen onComplete={onComplete} />);
    const payload = {
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
      wishlist: {},
      selectedGenerations: [1],
    };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('dialog', { name: 'Confirm import' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite and import' }));
    expect(useAppStore.getState().language).toBe('ja');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirmation leaves the store untouched and stays on the screen', async () => {
    const onComplete = vi.fn();
    render(<StartScreen onComplete={onComplete} />);
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
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Confirm import' })).not.toBeInTheDocument();
  });

  it('shows an inline error for an invalid file and does not show the dialog', async () => {
    render(<StartScreen onComplete={() => {}} />);
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Confirm import' })).not.toBeInTheDocument();
  });
});
