import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { syncDbVersion } from './state/dbVersionSync';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Awaited here, before the very first render, so DexGrid's own mount effect
// (which reads the card cache to decide what still needs loading) never has
// a chance to run against a stale cache before this has a chance to clear it
// -- see state/dbVersionSync.ts. syncDbVersion never rejects (a network
// hiccup just skips the check for this boot), so this never blocks the app
// from rendering; it's a `.finally`, not a `.then`, only so a future change
// to that contract can't turn a rejection into a silently blank page.
void syncDbVersion().finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
