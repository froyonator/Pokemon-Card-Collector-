import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import { spriteUrl } from '../api/pokeapi';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards } from '../storage/cardCache';

function TestIcon() {
  return <span aria-hidden="true">icon</span>;
}

function resetStore() {
  localStorage.clear();
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    selectedGenerations: [1],
    owned: {},
    cardOverrides: {},
    binders: [
      {
        id: 'a',
        name: 'My Binder',
        language: 'en',
        config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
        customOrder: null,
      },
    ],
    activeBinderId: 'a',
  });
}

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <Sidebar
      view="sprite"
      onSetView={() => {}}
      isLoading={false}
      onRefresh={() => {}}
      isManualArrangeActive={false}
      onToggleManualArrange={() => {}}
      activeTab="grid"
      tabs={[{ id: 'grid', label: 'Dex Grid', icon: <TestIcon /> }]}
      onTabChange={() => {}}
      showDexGridControls
      {...overrides}
    />
  );
}

describe('Sidebar', () => {
  beforeEach(resetStore);

  it('shows the filter bar controls (generations, rarity groups, language)', () => {
    renderSidebar();
    expect(screen.getByText('Generations')).toBeInTheDocument();
    expect(screen.getByText('Card rarity groups')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('shows the view toggle and calls onSetView when a different view is picked', async () => {
    const onSetView = vi.fn();
    renderSidebar({ onSetView });
    await userEvent.click(screen.getByRole('button', { name: 'Binder' }));
    expect(onSetView).toHaveBeenCalledWith('binder');
  });

  it("uses Pikachu's sprite as the Card view icon when no Pikachu card is cached yet", () => {
    renderSidebar();
    const cardButton = screen.getByRole('button', { name: 'Card' });
    const img = cardButton.querySelector('img');
    expect(img).toHaveAttribute('src', spriteUrl(25));
  });

  it("uses a real cached Pikachu card image as the Card view icon once one is available", () => {
    setCachedCards('en', 25, [
      {
        id: 'sv03.5-236',
        name: 'Pikachu',
        dexNumber: 25,
        setId: 'sv03.5',
        setName: '151',
        localId: '236',
        rarity: 'Illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/236',
        language: 'en',
      },
    ]);
    renderSidebar();
    const cardButton = screen.getByRole('button', { name: 'Card' });
    const img = cardButton.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv03.5/236/low.webp');
  });

  it("prefers the cached Pikachu card's hostedThumbUrl over the live-API-constructed URL when present", () => {
    setCachedCards('en', 25, [
      {
        id: 'sv03.5-236',
        name: 'Pikachu',
        dexNumber: 25,
        setId: 'sv03.5',
        setName: '151',
        localId: '236',
        rarity: 'Illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/236',
        hostedThumbUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/236/thumb.webp',
        language: 'en',
      },
    ]);
    renderSidebar();
    const cardButton = screen.getByRole('button', { name: 'Card' });
    const img = cardButton.querySelector('img');
    expect(img).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/236/thumb.webp'
    );
  });

  it('shows a disabled, in-flight state on the refresh button while loading, and calls onRefresh when clicked', async () => {
    const onRefresh = vi.fn();
    renderSidebar({ onRefresh });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Data' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    renderSidebar({ isLoading: true });
    expect(screen.getByRole('button', { name: 'Refreshing...' })).toBeDisabled();
  });

  it('shows Binder Settings only while binder view is active', () => {
    renderSidebar({ view: 'sprite' });
    expect(screen.queryByText('Binder settings')).not.toBeInTheDocument();

    renderSidebar({ view: 'binder' });
    expect(screen.getByText('Binder settings')).toBeInTheDocument();
  });

  it('collapsing the sidebar hides its content, and expanding it shows the content again', async () => {
    renderSidebar();
    expect(screen.getByText('Generations')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByText('Generations')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByText('Generations')).toBeInTheDocument();
  });

  it('keeps the tab nav visible and clickable after collapsing the sidebar', async () => {
    const onTabChange = vi.fn();
    renderSidebar({
      tabs: [
        { id: 'grid', label: 'Dex Grid', icon: <TestIcon /> },
        { id: 'collection', label: 'My Collection', icon: <TestIcon /> },
      ],
      onTabChange,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    const collectionTab = screen.getByRole('button', { name: 'My Collection' });
    expect(collectionTab).toBeInTheDocument();
    await userEvent.click(collectionTab);
    expect(onTabChange).toHaveBeenCalledWith('collection');
  });

  it('renders the app title and every tab, marking the active one pressed', () => {
    render(
      <Sidebar
        view="sprite"
        onSetView={() => {}}
        isLoading={false}
        onRefresh={() => {}}
        isManualArrangeActive={false}
        onToggleManualArrange={() => {}}
        activeTab="collection"
        tabs={[
          { id: 'grid', label: 'Dex Grid', icon: <TestIcon /> },
          { id: 'collection', label: 'My Collection', icon: <TestIcon /> },
        ]}
        onTabChange={() => {}}
        showDexGridControls={false}
      />
    );
    expect(screen.getByRole('heading', { name: "Collector's Ledger" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dex Grid' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'My Collection' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onTabChange with the clicked tab id', async () => {
    const onTabChange = vi.fn();
    render(
      <Sidebar
        view="sprite"
        onSetView={() => {}}
        isLoading={false}
        onRefresh={() => {}}
        isManualArrangeActive={false}
        onToggleManualArrange={() => {}}
        activeTab="grid"
        tabs={[
          { id: 'grid', label: 'Dex Grid', icon: <TestIcon /> },
          { id: 'collection', label: 'My Collection', icon: <TestIcon /> },
        ]}
        onTabChange={onTabChange}
        showDexGridControls
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'My Collection' }));
    expect(onTabChange).toHaveBeenCalledWith('collection');
  });

  it('hides the filter/view/binder-settings sections when showDexGridControls is false', () => {
    render(
      <Sidebar
        view="sprite"
        onSetView={() => {}}
        isLoading={false}
        onRefresh={() => {}}
        isManualArrangeActive={false}
        onToggleManualArrange={() => {}}
        activeTab="summary"
        tabs={[{ id: 'summary', label: 'Summary', icon: <TestIcon /> }]}
        onTabChange={() => {}}
        showDexGridControls={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'Sprite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh data/i })).not.toBeInTheDocument();
  });
});
