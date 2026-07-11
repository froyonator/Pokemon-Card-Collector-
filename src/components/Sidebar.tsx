import type { ReactNode } from 'react';
import { useState } from 'react';
import { spriteUrl } from '../api/pokeapi';
import { cardImageUrl } from '../api/tcgdex';
import { getCachedCards } from '../storage/cardCache';
import { useAppStore } from '../state/store';
import { BinderIcon } from './icons/TabIcons';
import { BinderSettings } from './BinderSettings';
import { CollectionStats } from './CollectionStats';
import { FilterBar } from './FilterBar';
import styles from './Sidebar.module.css';

export type DexView = 'sprite' | 'card' | 'binder';

export interface SidebarTab<TabId extends string = string> {
  id: TabId;
  label: string;
  icon: ReactNode;
}

// Pikachu (#25) -- used as the Sprite/Card view toggle's own icons, since
// showing an actual sprite/card is a more immediate "this is what that view
// looks like" preview than an abstract icon would be. The card image falls
// back to the sprite if Pikachu's card data hasn't been cached yet (e.g. the
// user has deselected Generation 1, or the initial fetch hasn't landed) --
// see pikachuCardImageBase below.
const VIEW_ICON_DEX_NUMBER = 25;

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

// The single left rail for the whole app: the collection-progress summary,
// title, and tab nav (previously App.tsx's own centered header), plus --
// only while the Dex Grid tab is active -- every control that affects what
// the Dex Grid shows (filters, view mode, refresh, and Binder Settings).
// Merging these into one component is what makes the rail read as one
// continuous panel flush against the left edge instead of two separate boxes
// stacked with a gap between them. Collapses to a thin strip so it doesn't
// have to compete with the grid for space once the user already knows what
// they want, and stays pinned via `position: sticky` so it's still reachable
// after scrolling down a long grid.
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
  const language = useAppStore((s) => s.language);
  // A real Pikachu card image for the Card view icon, resolved from
  // whatever's already cached for the current language -- not a fetch of
  // its own, so it stays undefined (falling back to the sprite below) until
  // Pikachu's own card data happens to already be cached.
  const pikachuCard = getCachedCards(language, VIEW_ICON_DEX_NUMBER)?.[0];
  const pikachuCardImageBase = pikachuCard?.imageBase;
  // A pre-resolved hosted thumbnail, preferred over the live-API imageBase
  // construction below whenever it's present -- see CardImage's own
  // hostedThumbUrl prop, which this icon has no CardImage instance to route
  // through (it's a plain <img>), so the same preference is applied here
  // directly instead.
  const pikachuCardHostedThumbUrl = pikachuCard?.hostedThumbUrl;

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

      {!isCollapsed && <CollectionStats />}

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
            className={styles.tabButton}
            aria-pressed={activeTab === tab.id}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon}
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
                className={styles.viewToggleButton}
                aria-pressed={view === 'sprite'}
                onClick={() => onSetView('sprite')}
              >
                <img src={spriteUrl(VIEW_ICON_DEX_NUMBER)} alt="" />
                <span>Sprite</span>
              </button>
              <button
                type="button"
                className={styles.viewToggleButton}
                aria-pressed={view === 'card'}
                onClick={() => onSetView('card')}
              >
                <img
                  src={
                    pikachuCardHostedThumbUrl
                      ? pikachuCardHostedThumbUrl
                      : pikachuCardImageBase
                        ? cardImageUrl(pikachuCardImageBase)
                        : spriteUrl(VIEW_ICON_DEX_NUMBER)
                  }
                  alt=""
                />
                <span>Card</span>
              </button>
              <button
                type="button"
                className={styles.viewToggleButton}
                aria-pressed={view === 'binder'}
                onClick={() => onSetView('binder')}
              >
                <BinderIcon />
                <span>Binder</span>
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
