import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CollectionTable } from './components/CollectionTable';
import { DexGrid } from './components/DexGrid';
import { ExportImportControls } from './components/ExportImportControls';
import { Sidebar, type DexView } from './components/Sidebar';
import { StartScreen } from './components/StartScreen';
import { Summary } from './components/Summary';
import { Tutorial } from './components/Tutorial';
import { WishlistTable } from './components/WishlistTable';
import { USER_DATA_STORAGE_KEY } from './state/store';
import { useUnsavedChangesWarning } from './state/useUnsavedChangesWarning';
import styles from './App.module.css';

const ONBOARDED_KEY = 'pcc:onboarded:v1';

function hasOnboardedFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function hasExistingUserData(): boolean {
  try {
    return localStorage.getItem(USER_DATA_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function readInitialOnboardingNeeded(): boolean {
  // A pure read, deliberately with no side effects — this runs inside a
  // useState lazy initializer below, which React (in StrictMode, or in any
  // future concurrent-rendering path) may invoke more than once per mount.
  // The self-heal write for the "real data but missing flag" case lives in
  // the useEffect further down instead, where a double-invoke is harmless
  // by construction (mount-only, and the write itself is idempotent).
  if (hasOnboardedFlag()) return false;
  if (hasExistingUserData()) return false;
  return true;
}

type Tab = 'grid' | 'collection' | 'wishlist' | 'summary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'grid', label: 'Dex Grid' },
  { id: 'collection', label: 'My Collection' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'summary', label: 'Summary' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('grid');
  const [needsOnboarding, setNeedsOnboarding] = useState(readInitialOnboardingNeeded);
  const [view, setView] = useState<DexView>('sprite');
  const [isManualArrangeActive, setIsManualArrangeActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshRequestId, setRefreshRequestId] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useUnsavedChangesWarning();

  useEffect(() => {
    // Real collection data already exists but the onboarding flag is
    // missing (e.g. cleared independently of the data key by a privacy
    // extension, a manual DevTools edit, or a future migration bug).
    // readInitialOnboardingNeeded() above already treats this as "already
    // onboarded" so StartScreen doesn't show over live data; this effect
    // just self-heals the flag so this branch is a no-op on the next load.
    // Runs once on mount, after the initial render/commit, rather than as a
    // side effect inside the lazy initializer above.
    if (!hasOnboardedFlag() && hasExistingUserData()) {
      try {
        localStorage.setItem(ONBOARDED_KEY, 'true');
      } catch {
        // Best-effort self-heal; ignore storage errors here just like
        // readInitialOnboardingNeeded does above.
      }
    }
  }, []);

  if (needsOnboarding) {
    return (
      <StartScreen
        onComplete={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true');
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        view={view}
        onSetView={setView}
        isLoading={isLoading}
        onRefresh={() => setRefreshRequestId((id) => id + 1)}
        isManualArrangeActive={isManualArrangeActive}
        onToggleManualArrange={() => setIsManualArrangeActive((active) => !active)}
        activeTab={activeTab}
        tabs={TABS}
        onTabChange={setActiveTab}
        showDexGridControls={activeTab === 'grid'}
      />

      <main className={styles.main}>
        {/* The Dex Grid panel stays mounted at all times and is toggled with
            the `hidden` attribute rather than conditional JSX removal. This
            keeps its tutorial anchors present in the DOM regardless of which
            tab is currently visible, avoids re-running DexGrid's mount
            effect (and re-parsing the full card cache blob) on every tab
            round-trip, and preserves its own local UI state (the open
            Picker) across tab switches instead of resetting it every time. */}
        <div hidden={activeTab !== 'grid'}>
          <DexGrid
            view={view}
            isManualArrangeActive={isManualArrangeActive}
            onLoadingChange={setIsLoading}
            refreshRequestId={refreshRequestId}
          />
        </div>
        <AnimatePresence mode="wait">
          {activeTab !== 'grid' && (
            <motion.div
              key={activeTab}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
            >
              {activeTab === 'collection' && <CollectionTable />}
              {activeTab === 'wishlist' && <WishlistTable />}
              {activeTab === 'summary' && <Summary />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className={styles.floatingControls}>
        <div data-tutorial="export-import">
          <ExportImportControls />
        </div>
      </div>

      <Tutorial onStart={() => setActiveTab('grid')} />
    </div>
  );
}
