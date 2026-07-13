import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

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

  // The view toggle previously used real Pikachu artwork (a live sprite and
  // a cached card image) as its Sprite/Card icons -- replaced with icons
  // drawn in the same line family as the rest of the app's iconography
  // after the mixed art styles were reported as visually out of place. The
  // toggle's icons are decorative SVGs now; only the buttons' names and
  // behavior are contract.
  it('renders all three view buttons with drawn icons, not fetched artwork', () => {
    renderSidebar();
    for (const name of ['Sprite', 'Card', 'Binder']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg')).toBeInTheDocument();
      expect(button.querySelector('img')).toBeNull();
    }
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

  // Hard project rule: the sidebar must never grow an internal scrollbar --
  // new content has to fold behind a collapsed disclosure instead. jsdom has
  // no real layout engine (no computed heights/scrollHeight to assert
  // against), so this is a structural proxy for that rule: opening
  // Generations alone must not also reveal the six form-family chips
  // (Mega/VMAX/the four regional families) -- they stay behind their own
  // nested "Forms" disclosure, collapsed by default, exactly like Binder
  // Settings' Layout/Cover sections fold. Only 9 checkboxes (the numbered
  // generations) are visible with just Generations open; the sidebar's
  // rendered height with everything else collapsed is what actually keeps
  // it under a typical viewport in the real browser.
  it('folds the Mega/VMAX/regional form chips behind a nested, collapsed "Forms" disclosure inside Generations', async () => {
    renderSidebar();
    await userEvent.click(screen.getByText('Generations'));

    const generationsSection = screen.getByText('Generations').closest('details')!;
    expect(within(generationsSection).getByText('Forms').closest('details')).not.toHaveAttribute('open');
    // Only the nine numbered generations' checkboxes are visible/queryable
    // as already-open chips -- the six form chips are nested one level
    // deeper, behind the still-closed "Forms" disclosure.
    const numberedCheckboxes = within(generationsSection)
      .getAllByRole('checkbox')
      .filter((el) => el.closest('details') === generationsSection);
    expect(numberedCheckboxes).toHaveLength(9);

    await userEvent.click(within(generationsSection).getByText('Forms'));
    expect(within(generationsSection).getByLabelText('Mega')).toBeInTheDocument();
    expect(within(generationsSection).getByLabelText('VMAX')).toBeInTheDocument();
    expect(within(generationsSection).getByLabelText('Alolan')).toBeInTheDocument();
    expect(within(generationsSection).getByLabelText('Galarian')).toBeInTheDocument();
    expect(within(generationsSection).getByLabelText('Hisuian')).toBeInTheDocument();
    expect(within(generationsSection).getByLabelText('Paldean')).toBeInTheDocument();
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
