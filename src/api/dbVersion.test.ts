import { describe, expect, it, vi } from 'vitest';
import { loadDbVersion } from './dbVersion';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('loadDbVersion', () => {
  it('builds the URL from BASE_URL and the data/cards/db-version.json convention', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ version: '2026-07-14T00:00:00.000Z' }));
    await loadDbVersion(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe(`${import.meta.env.BASE_URL}data/cards/db-version.json`);
  });

  it('resolves to the version string on a successful fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: '2026-07-14T00:00:00.000Z' }));
    expect(await loadDbVersion(fetchImpl)).toBe('2026-07-14T00:00:00.000Z');
  });

  it('resolves to null (not a throw) on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    expect(await loadDbVersion(fetchImpl)).toBeNull();
  });

  it('resolves to null (not a throw) on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await loadDbVersion(fetchImpl)).toBeNull();
  });

  it('resolves to null when the payload has no string `version` field', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: 123 }));
    expect(await loadDbVersion(fetchImpl)).toBeNull();

    const fetchImplEmpty = vi.fn(async () => jsonResponse({}));
    expect(await loadDbVersion(fetchImplEmpty)).toBeNull();
  });
});
