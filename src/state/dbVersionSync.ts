import { loadDbVersion } from '../api/dbVersion';
import { staticCoveredLanguages } from '../data/staticCoverage';
import { clearCardCacheForLanguages } from '../storage/cardCache';

// Persisted right alongside the card cache itself (pcc:cardCache:v1, see
// storage/cardCache.ts) -- this is the "what static-database version did
// this browser last see" stamp that syncDbVersion below compares against.
export const DB_VERSION_STORAGE_KEY = 'pcc:dbVersion:v1';

export function getStoredDbVersion(): string | null {
  try {
    return localStorage.getItem(DB_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredDbVersion(version: string): void {
  try {
    localStorage.setItem(DB_VERSION_STORAGE_KEY, version);
  } catch {
    // Best-effort: a failed write just means this same "mismatch" gets
    // detected again (and the -- by then genuinely redundant -- cache clear
    // repeated) on the next boot too. Harmless, not a correctness problem.
  }
}

// Recurring bug, reported twice now: once a static-database data fix ships
// (a rarity correction, a coverage gap filled, a bad image swapped), a
// returning user's already-populated localStorage card cache keeps serving
// the OLD data indefinitely, until they happen to notice and click Refresh
// Data manually. This is the fix -- meant to be awaited once, at app boot,
// BEFORE anything (DexGrid's own auto-load effect chief among them) gets a
// chance to read the card cache -- see main.tsx.
//
// It compares the static database's own current version stamp
// (public/data/cards/db-version.json, rewritten by
// scripts/carddata/src/buildStaticDatabase.ts on every pipeline run) against
// whatever stamp this browser last recorded. A mismatch -- including "no
// stamp recorded yet", i.e. this browser's very first load ever, where the
// clear below is simply a no-op against an already-empty cache -- clears
// ONLY the static-covered languages' card-cache entries (see
// data/staticCoverage.ts), never owned/wishlist/binders, which live
// entirely under state/store.ts's own separate persisted key and are never
// touched here. DexGrid's normal static preload, which always runs right
// after this resolves, simply repopulates whatever was cleared -- with zero
// extra live API calls, since it was already going to read the (now correct)
// static database regardless.
//
// A fetch failure (offline, a dev server with no db-version.json yet, etc.)
// leaves the stored stamp and the cache both untouched -- loadDbVersion
// resolves to `null` rather than throwing, and `null` is treated as "unknown,
// try again next boot", never as a real mismatch to act on.
export async function syncDbVersion(fetchImpl: typeof fetch = fetch): Promise<void> {
  const currentVersion = await loadDbVersion(fetchImpl);
  if (currentVersion === null) return;

  const storedVersion = getStoredDbVersion();
  if (storedVersion === currentVersion) return;

  clearCardCacheForLanguages(staticCoveredLanguages());
  setStoredDbVersion(currentVersion);
}
