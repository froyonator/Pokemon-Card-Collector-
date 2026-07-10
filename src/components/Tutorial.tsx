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
      'Use these filters to choose which generations you collect, which rarity groups count as special art, which card language you collect, and which currency prices are shown in.',
  },
  {
    target: '[data-tutorial="view-toggle"]',
    content: 'Switch between sprite view and card view for the whole grid at any time.',
  },
  {
    target: '[data-tutorial="first-tile"]',
    content:
      'Click any Pokemon to see its special art card options. A dulled tile means you own a card for it, and a red tile means no special art card has been released for it yet.',
  },
  {
    target: '[data-tutorial="refresh-data"]',
    content:
      'Refresh Data rescans every Pokemon for newly released cards. Use it after a new set comes out.',
  },
  {
    target: '[data-tutorial="export-import"]',
    content:
      'Your collection lives only in this browser. Export it to a file every so often, and import that file to restore it here or on another device.',
  },
];

export function Tutorial() {
  const [run, setRun] = useState(false);

  function handleCallback(data: CallBackProps) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.tutorialButton}
        onClick={() => setRun(true)}
        data-tutorial="tutorial-button"
      >
        Tutorial
      </button>
      <Joyride
        steps={STEPS}
        run={run}
        continuous
        showSkipButton
        callback={handleCallback}
        styles={{ options: { primaryColor: '#4a9eff' } }}
      />
    </>
  );
}
