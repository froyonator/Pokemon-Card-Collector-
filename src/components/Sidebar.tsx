import { useState } from 'react';
import { BinderSettings } from './BinderSettings';
import { FilterBar } from './FilterBar';
import styles from './Sidebar.module.css';

export type DexView = 'sprite' | 'card' | 'binder';

export interface SidebarTab<TabId extends string = string> {
  id: TabId;
  label: string;
}

export interface SidebarProps<TabId extends string = string> {
  view: DexView;
  onSetView: (view: DexView) => void;
  isLoading: boolean;
  onRefresh: () => void;
  isManualArrangeActive: boolean;
  onToggleManualArrange: () => void;
  activeTab: TabId;
  tabs: SidebarTab<TabId>[];
  onTabChange: (tabId: TabId) => void;
  // False on every tab except Dex Grid: the filters/view-toggle/binder-settings
  // sections only make sense while the Dex Grid is what's actually on screen.
  // The title and tab nav above them stay visible regardless -- they're the
  // one persistent piece of chrome every tab shares.
  showDexGridControls: boolean;
}

// The single left rail for the whole app: the title and tab nav (previously
// App.tsx's own centered header), plus -- only while the Dex Grid tab is
// active -- every control that affects what the Dex Grid shows (filters,
// view mode, refresh, and Binder Settings). Merging these into one component
// is what makes the rail read as one continuous panel flush against the left
// edge instead of two separate boxes stacked with a gap between them.
// Collapses to a thin strip so it doesn't have to compete with the grid for
// space once the user already knows what they want, and stays pinned via
// `position: sticky` so it's still reachable after scrolling down a long grid.
export function Sidebar<TabId extends string = string>({
  view,
  onSetView,
  isLoading,
  onRefresh,
  isManualArrangeActive,
  onToggleManualArrange,
  activeTab,
  tabs,
  onTabChange,
  showDexGridControls,
}: SidebarProps<TabId>) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={[styles.sidebar, isCollapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}
      aria-label="App navigation and Dex Grid controls"
    >
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '»' : '«'}
      </button>
      {/* Title and tab nav are outside the isCollapsed gate below -- unlike
          the filter/view/binder-settings sections, they must stay visible
          (and clickable) even while the sidebar is collapsed, since the tabs
          are the only way to navigate between Dex Grid/Collection/Wishlist/
          Summary. */}
      {!isCollapsed && <h1 className={styles.title}>Collector&apos;s Ledger</h1>}

      <nav className={styles.tabs} data-tutorial="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {!isCollapsed && showDexGridControls && (
        <>
          <hr className={styles.divider} />

          <div data-tutorial="filter-bar">
            <FilterBar />
          </div>

          <hr className={styles.divider} />

          <fieldset className={styles.section}>
            <legend>View</legend>
            <div
              className={styles.viewToggle}
              role="radiogroup"
              aria-label="View"
              data-tutorial="view-toggle"
            >
              <button
                type="button"
                aria-pressed={view === 'sprite'}
                onClick={() => onSetView('sprite')}
              >
                Sprite view
              </button>
              <button
                type="button"
                aria-pressed={view === 'card'}
                onClick={() => onSetView('card')}
              >
                Card view
              </button>
              <button
                type="button"
                aria-pressed={view === 'binder'}
                onClick={() => onSetView('binder')}
              >
                Binder view
              </button>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              data-tutorial="refresh-data"
            >
              {isLoading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </fieldset>

          {view === 'binder' && (
            <>
              <hr className={styles.divider} />
              <BinderSettings
                isManualArrangeActive={isManualArrangeActive}
                onToggleManualArrange={onToggleManualArrange}
              />
            </>
          )}
        </>
      )}
    </aside>
  );
}
