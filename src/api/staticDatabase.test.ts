import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from './staticDatabase';
import type { CardRecord } from '../types';

const sampleCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadStaticCardData', () => {
  it('builds the URL from BASE_URL, language, and the data/cards/<language>.json convention', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ 6: [sampleCard] }));
    await loadStaticCardData('static-url-test', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe(`${import.meta.env.BASE_URL}data/cards/static-url-test.json`);
  });

  it('resolves to the parsed record on a successful fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 6: [sampleCard] }));
    const result = await loadStaticCardData('static-success-test', fetchImpl);
    expect(result).toEqual({ 6: [sampleCard] });
  });

  it('resolves to null (not a throw) on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    const result = await loadStaticCardData('static-404-test', fetchImpl);
    expect(result).toBeNull();
  });

  it('resolves to null (not a throw) on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await loadStaticCardData('static-network-error-test', fetchImpl);
    expect(result).toBeNull();
  });

  it('resolves to null (not a throw) when the response body is malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })) as unknown as typeof fetch;
    const result = await loadStaticCardData('static-malformed-json-test', fetchImpl);
    expect(result).toBeNull();
  });

  it('memoizes per language: a second call for the same language reuses the first fetch instead of issuing a new one', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 6: [sampleCard] }));
    const first = loadStaticCardData('static-memoize-test', fetchImpl);
    const second = loadStaticCardData('static-memoize-test', fetchImpl);
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await first).toBe(await second);
  });

  it('does not memoize across two different languages', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('lang-a')
        ? jsonResponse({ 1: [sampleCard] })
        : jsonResponse({ 2: [sampleCard] })
    );
    const resultA = await loadStaticCardData('static-lang-a', fetchImpl);
    const resultB = await loadStaticCardData('static-lang-b', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(resultA).toEqual({ 1: [sampleCard] });
    expect(resultB).toEqual({ 2: [sampleCard] });
  });

  it('falls back to the global fetch when no fetchImpl is provided', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ 6: [sampleCard] }));
    vi.stubGlobal('fetch', fetchSpy);
    const result = await loadStaticCardData('static-default-fetch-test');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ 6: [sampleCard] });
  });
});

describe('refreshStaticCardData', () => {
  it('always issues a fresh fetch, even when loadStaticCardData already memoized this language', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 6: [sampleCard] }));
    await loadStaticCardData('static-refresh-test', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const updatedCard = { ...sampleCard, name: 'Charizard ex (updated)' };
    fetchImpl.mockResolvedValueOnce(jsonResponse({ 6: [updatedCard] }));
    const result = await refreshStaticCardData('static-refresh-test', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ 6: [updatedCard] });
  });

  it('replaces the session memo, so a later loadStaticCardData call for the same language sees the refreshed data instead of re-fetching or returning the stale first result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 6: [sampleCard] }));
    await loadStaticCardData('static-refresh-memo-test', fetchImpl);

    const updatedCard = { ...sampleCard, name: 'Charizard ex (updated)' };
    fetchImpl.mockResolvedValueOnce(jsonResponse({ 6: [updatedCard] }));
    await refreshStaticCardData('static-refresh-memo-test', fetchImpl);

    const afterRefresh = await loadStaticCardData('static-refresh-memo-test', fetchImpl);
    expect(afterRefresh).toEqual({ 6: [updatedCard] });
    // Still just the two fetches from above -- this loadStaticCardData call
    // reused the memo refreshStaticCardData replaced, rather than issuing a
    // third fetch of its own.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('resolves to null (not a throw) on a non-2xx response, same as loadStaticCardData', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    const result = await refreshStaticCardData('static-refresh-404-test', fetchImpl);
    expect(result).toBeNull();
  });

  it('resolves to null (not a throw) on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await refreshStaticCardData('static-refresh-network-error-test', fetchImpl);
    expect(result).toBeNull();
  });

  it('builds the URL from BASE_URL, language, and the data/cards/<language>.json convention, same as loadStaticCardData', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ 6: [sampleCard] }));
    await refreshStaticCardData('static-refresh-url-test', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe(`${import.meta.env.BASE_URL}data/cards/static-refresh-url-test.json`);
  });
});

describe('loadStaticCardDataForGen', () => {
  it('builds the URL from BASE_URL, language, and the data/cards/<language>/gen<N>.json convention', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ 155: [sampleCard] }));
    await loadStaticCardDataForGen('static-gen-url-test', 2, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe(
      `${import.meta.env.BASE_URL}data/cards/static-gen-url-test/gen2.json`
    );
  });

  it('resolves to the parsed record on a successful fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 155: [sampleCard] }));
    const result = await loadStaticCardDataForGen('static-gen-success-test', 3, fetchImpl);
    expect(result).toEqual({ 155: [sampleCard] });
  });

  it('resolves to null (not a throw) on a non-2xx response -- e.g. a generation with no static file deployed yet', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    const result = await loadStaticCardDataForGen('static-gen-404-test', 4, fetchImpl);
    expect(result).toBeNull();
  });

  it('resolves to null (not a throw) on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await loadStaticCardDataForGen('static-gen-network-error-test', 5, fetchImpl);
    expect(result).toBeNull();
  });

  it('memoizes per language+generation: a second call for the same language and generation reuses the first fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 155: [sampleCard] }));
    const first = loadStaticCardDataForGen('static-gen-memoize-test', 2, fetchImpl);
    const second = loadStaticCardDataForGen('static-gen-memoize-test', 2, fetchImpl);
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await first).toBe(await second);
  });

  it('does not memoize across two different generations of the same language', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('gen2')
        ? jsonResponse({ 152: [sampleCard] })
        : jsonResponse({ 252: [sampleCard] })
    );
    const gen2Result = await loadStaticCardDataForGen('static-gen-distinct-test', 2, fetchImpl);
    const gen3Result = await loadStaticCardDataForGen('static-gen-distinct-test', 3, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(gen2Result).toEqual({ 152: [sampleCard] });
    expect(gen3Result).toEqual({ 252: [sampleCard] });
  });

  it('does not memoize across two different languages of the same generation', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('lang-a')
        ? jsonResponse({ 152: [sampleCard] })
        : jsonResponse({ 152: [{ ...sampleCard, id: 'other' }] })
    );
    const resultA = await loadStaticCardDataForGen('static-gen-lang-a', 2, fetchImpl);
    const resultB = await loadStaticCardDataForGen('static-gen-lang-b', 2, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(resultA).toEqual({ 152: [sampleCard] });
    expect(resultB).toEqual({ 152: [{ ...sampleCard, id: 'other' }] });
  });

  it('falls back to the global fetch when no fetchImpl is provided', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ 155: [sampleCard] }));
    vi.stubGlobal('fetch', fetchSpy);
    const result = await loadStaticCardDataForGen('static-gen-default-fetch-test', 2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ 155: [sampleCard] });
  });
});

describe('refreshStaticCardDataForGen', () => {
  it('always issues a fresh fetch, even when loadStaticCardDataForGen already memoized this language+generation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 155: [sampleCard] }));
    await loadStaticCardDataForGen('static-gen-refresh-test', 2, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const updatedCard = { ...sampleCard, name: 'Updated' };
    fetchImpl.mockResolvedValueOnce(jsonResponse({ 155: [updatedCard] }));
    const result = await refreshStaticCardDataForGen('static-gen-refresh-test', 2, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ 155: [updatedCard] });
  });

  it('replaces the session memo, so a later loadStaticCardDataForGen call for the same language+generation sees the refreshed data', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 155: [sampleCard] }));
    await loadStaticCardDataForGen('static-gen-refresh-memo-test', 2, fetchImpl);

    const updatedCard = { ...sampleCard, name: 'Updated' };
    fetchImpl.mockResolvedValueOnce(jsonResponse({ 155: [updatedCard] }));
    await refreshStaticCardDataForGen('static-gen-refresh-memo-test', 2, fetchImpl);

    const afterRefresh = await loadStaticCardDataForGen('static-gen-refresh-memo-test', 2, fetchImpl);
    expect(afterRefresh).toEqual({ 155: [updatedCard] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not disturb the sibling generation of the same language in the cache', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ 155: [sampleCard] }));
    await loadStaticCardDataForGen('static-gen-refresh-sibling-test', 2, fetchImpl);
    await loadStaticCardDataForGen('static-gen-refresh-sibling-test', 3, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await refreshStaticCardDataForGen('static-gen-refresh-sibling-test', 2, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // Gen 3's memo entry for this language is untouched by the Gen 2 refresh
    // -- a further Gen 3 call reuses it instead of re-fetching.
    await loadStaticCardDataForGen('static-gen-refresh-sibling-test', 3, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('resolves to null (not a throw) on a non-2xx response, same as loadStaticCardDataForGen', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    const result = await refreshStaticCardDataForGen('static-gen-refresh-404-test', 2, fetchImpl);
    expect(result).toBeNull();
  });

  it('builds the URL from BASE_URL, language, and the data/cards/<language>/gen<N>.json convention, same as loadStaticCardDataForGen', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ 155: [sampleCard] }));
    await refreshStaticCardDataForGen('static-gen-refresh-url-test', 2, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe(
      `${import.meta.env.BASE_URL}data/cards/static-gen-refresh-url-test/gen2.json`
    );
  });
});
