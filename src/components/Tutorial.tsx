import { useState } from 'react';
import Joyride, { STATUS, type CallBackProps, type Step } from 'react-joyride';
import styles from './Tutorial.module.css';

const STEPS: Step[] = [
  {
    target: '[data-tutorial="tabs"]',
    content:
      'These tabs switch between the main dex grid, your collection, your wishlist, and a summary of your progress and value.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="filter-bar"]',
    content:
      'Use these filters to choose which generations you collect, which rarity groups count as special art, and which card language you collect.',
  },
  {
    target: '[data-tutorial="view-toggle"]',
    content: 'Switch between sprite view and card view for the whole grid at any time.',
  },
  {
    target: '[data-tutorial="first-tile"]',
    content:
      'Click any Pokémon to see its special art card options. A dulled tile means you own a card for it, and a red tile means no special art card has been released for it yet.',
  },
  {
    target: '[data-tutorial="refresh-data"]',
    content:
      'Refresh Data rescans every Pokémon for newly released cards. Use it after a new set comes out.',
  },
  {
    target: '[data-tutorial="export-import"]',
    content:
      'Your collection lives only in this browser. Export it to a file every so often, and import that file to restore it here or on another device.',
  },
];

export interface TutorialProps {
  // Called before the tour starts, in the same click handler as setRun(true)
  // (so React batches both updates into one render). App.tsx uses this to
  // force activeTab back to 'grid' when the tour starts, since 4 of the 6
  // steps below target elements that only live inside the Dex Grid tab
  // panel — without this, starting the tour from another tab would leave
  // those targets absent (or merely present-but-hidden) and react-joyride
  // would silently fast-forward past them instead of showing them.
  onStart?: () => void;
}

export function Tutorial({ onStart }: TutorialProps) {
  const [run, setRun] = useState(false);

  function handleCallback(data: CallBackProps) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
    }
  }

  function handleStartClick() {
    onStart?.();
    setRun(true);
  }

  return (
    <>
      <button
        type="button"
        className={styles.tutorialButton}
        onClick={handleStartClick}
        data-tutorial="tutorial-button"
        aria-label="Tutorial"
        title="Tutorial"
      >
        ?
      </button>
      <Joyride
        steps={STEPS}
        run={run}
        continuous
        showSkipButton
        callback={handleCallback}
        // zIndex: 400 is intentionally above every existing app modal
        // z-index (Picker's overlay is 100, ManageGroupsPanel's is 200, this
        // button itself is 300 — see Tutorial.module.css) so the tour's
        // overlay/spotlight/tooltip always paints on top of any modal that
        // happens to be open, rather than the stacking order depending on
        // DOM position.
        styles={{ options: { primaryColor: '#4a9eff', zIndex: 400 } }}
      />
    </>
  );
}
