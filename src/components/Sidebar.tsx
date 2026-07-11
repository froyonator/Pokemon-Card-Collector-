import { useState } from 'react';
import { BinderSettings } from './BinderSettings';
import { FilterBar } from './FilterBar';
import styles from './Sidebar.module.css';

export type DexView = 'sprite' | 'card' | 'binder';

export interface SidebarProps {
  view: DexView;
  onSetView: (view: DexView) => void;
  isLoading: boolean;
  onRefresh: () => void;
  isManualArrangeActive: boolean;
  onToggleManualArrange: () => void;
}

// Holds every control that affects what the Dex Grid shows: the
// generation/rarity/language filters (FilterBar, unchanged internally, just
// relocated here from being a standalone bar above the grid), the view mode
// toggle, the refresh button, and -- while Binder view
// is active -- every Binder Settings control too. Collapses to a thin strip
// so it doesn't have to compete with the grid for space once the user
// already knows what they want, and stays pinned via `position: sticky` so
// it's still reachable after scrolling down a long grid.
export function Sidebar({
  view,
  onSetView,
  isLoading,
  onRefresh,
  isManualArrangeActive,
  onToggleManualArrange,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={[styles.sidebar, isCollapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}
      aria-label="Dex Grid controls"
    >
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '»' : '«'}
      </button>
      {!isCollapsed && (
        <>
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
              <button type="button" aria-pressed={view === 'card'} onClick={() => onSetView('card')}>
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
            <button type="button" onClick={onRefresh} disabled={isLoading} data-tutorial="refresh-data">
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
