import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAppStore } from './state/store';
import { DEFAULT_RARITY_GROUPS } from './data/defaultRarityGroups';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pcc:onboarded:v1', 'true');
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
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse([]))
  );
});

describe('App', () => {
  it('renders the app title and the four tabs', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /pokemon card collector/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dex Grid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Collection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wishlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summary' })).toBeInTheDocument();
  });

  it('switches to the Summary tab when clicked', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(screen.getByText('0 / 151')).toBeInTheDocument();
  });

  it('shows the Dex Grid tab by default', () => {
    render(<App />);
    expect(screen.getByText('Bulbasaur')).toBeInTheDocument();
  });

  it('switches back to the Dex Grid tab when the Tutorial button is clicked from another tab', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(screen.getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dex Grid' })).toHaveAttribute('aria-pressed', 'false');

    // Regression test: Tutorial's tour has steps that only live inside the
    // Dex Grid tab panel (filter-bar, view-toggle, first-tile,
    // refresh-data). Without forcing the tab back to 'grid' on tour start,
    // react-joyride silently fast-forwards past those steps whenever the
    // tour is started from another tab, instead of showing them.
    await userEvent.click(screen.getByRole('button', { name: 'Tutorial' }));

    expect(screen.getByRole('button', { name: 'Dex Grid' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('App onboarding gate', () => {
  it('shows StartScreen on a fresh visit with no prior data', () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome to card collector/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dex Grid' })).not.toBeInTheDocument();
  });

  it('skips StartScreen and self-heals the flag when real user data exists but the flag is missing', () => {
    localStorage.clear();
    localStorage.setItem('pcc:userData:v1', JSON.stringify({ state: {}, version: 0 }));
    render(<App />);
    expect(screen.getByRole('button', { name: 'Dex Grid' })).toBeInTheDocument();
    expect(localStorage.getItem('pcc:onboarded:v1')).toBe('true');
  });
});
