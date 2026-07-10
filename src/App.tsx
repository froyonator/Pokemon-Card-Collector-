import { useState } from 'react';
import { CollectionTable } from './components/CollectionTable';
import { DexGrid } from './components/DexGrid';
import { ExportImportControls } from './components/ExportImportControls';
import { FilterBar } from './components/FilterBar';
import { StartScreen } from './components/StartScreen';
import { Summary } from './components/Summary';
import { Tutorial } from './components/Tutorial';
import { WishlistTable } from './components/WishlistTable';
import { useUnsavedChangesWarning } from './state/useUnsavedChangesWarning';
import styles from './App.module.css';

const ONBOARDED_KEY = 'pcc:onboarded:v1';
const USER_DATA_KEY = 'pcc:userData:v1';

function readInitialOnboardingNeeded(): boolean {
  try {
    if (localStorage.getItem(ONBOARDED_KEY) === 'true') return false;
    if (localStorage.getItem(USER_DATA_KEY) !== null) {
      // Real collection data already exists but the onboarding flag is
      // missing (e.g. cleared independently of the data key by a privacy
      // extension, a manual DevTools edit, or a future migration bug).
      // Treat this as already onboarded rather than showing StartScreen
      // over live data, and self-heal the flag so this branch is a no-op
      // on the next load.
      localStorage.setItem(ONBOARDED_KEY, 'true');
      return false;
    }
    return true;
  } catch {
    return false;
  }
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

  useUnsavedChangesWarning();

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
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>Pokemon Card Collector</h1>
        <div data-tutorial="export-import">
          <ExportImportControls />
        </div>
      </header>

      <nav className={styles.tabs} data-tutorial="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'grid' && (
        <>
          <div data-tutorial="filter-bar">
            <FilterBar />
          </div>
          <DexGrid />
        </>
      )}
      {activeTab === 'collection' && <CollectionTable />}
      {activeTab === 'wishlist' && <WishlistTable />}
      {activeTab === 'summary' && <Summary />}

      <Tutorial />
    </main>
  );
}
