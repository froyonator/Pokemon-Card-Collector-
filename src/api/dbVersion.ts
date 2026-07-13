// The static database's own version stamp -- see
// scripts/carddata/src/buildStaticDatabase.ts, which (re)writes
// public/data/cards/db-version.json on every pipeline run. A plain opaque
// string (currently an ISO build timestamp), never parsed as a date by
// anything that needs it to sort or compare -- only ever compared for
// equality against whatever this browser last saw (see
// state/dbVersionSync.ts).
interface DbVersionPayload {
  version: string;
}

// Fetches public/data/cards/db-version.json -- this app's own self-hosted
// static data (see api/staticDatabase.ts's identical fetchStaticJson
// pattern), NOT a live primary-source API call. Returns `null` -- never
// throws -- on any failure (network error, non-2xx, malformed JSON, or a
// payload missing/mistyping `version`): a missing/unreadable stamp just
// means state/dbVersionSync.ts's boot check is skipped for this session, not
// treated as a real version mismatch.
export async function loadDbVersion(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(`${import.meta.env.BASE_URL}data/cards/db-version.json`);
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<DbVersionPayload>;
    return typeof payload.version === 'string' ? payload.version : null;
  } catch {
    return null;
  }
}
