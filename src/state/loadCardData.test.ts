import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllCachedCardsForDex, loadAllCardData, loadAllPrintingsForDex } from './loadCardData';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadAllCardData', () => {
  it('fetches sets once, fetches cards per dex number and rarity, and caches the merged result', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return jsonResponse([
          {
            id: 'sv03.5-199',
            localId: '199',
            name: 'Charizard ex',
            image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
          },
        ]);
      }
      return jsonResponse([]);
    });

    await loadAllCardData('en', {
      dexEntries: [{ number: 6, name: 'Charizard' }],
      rarities: ['Ultra Rare'],
      fetchImpl,
    });

    const cached = getAllCachedCardsForDex('en', 6);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({
      id: 'sv03.5-199',
      dexNumber: 6,
      setId: 'sv03.5',
      setName: '151',
      rarity: 'Ultra Rare',
    });
  });

  it('reports progress as each dex number completes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const progressCalls: { completed: number; total: number }[] = [];
    await loadAllCardData('en', {
      dexEntries: [
        { number: 1, name: 'Bulbasaur' },
        { number: 2, name: 'Ivysaur' },
      ],
      rarities: ['Ultra Rare'],
      onProgress: (p) => progressCalls.push(p),
      fetchImpl,
    });
    expect(progressCalls).toEqual([
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);
  });

  it('caches an empty array for a dex number with no matching cards', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await loadAllCardData('en', {
      dexEntries: [{ number: 11, name: 'Metapod' }],
      rarities: ['Ultra Rare'],
      fetchImpl,
    });
    expect(getAllCachedCardsForDex('en', 11)).toEqual([]);
  });

  it('accumulates cards across multiple rarity tiers for the same dex number', async () => {
    // URLSearchParams.set encodes spaces as '+' (application/x-www-form-urlencoded),
    // not '%20' — confirmed against src/api/tcgdex.ts's actual output.
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      if (url.includes('rarity=eq%3AUltra+Rare')) {
        return jsonResponse([
          {
            id: 'sv03.5-199',
            localId: '199',
            name: 'Charizard ex',
            image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
          },
        ]);
      }
      if (url.includes('rarity=eq%3ASecret+Rare')) {
        return jsonResponse([
          {
            id: 'sv03-223',
            localId: '223',
            name: 'Charizard ex',
            image: 'https://assets.tcgdex.net/en/sv/sv03/223',
          },
        ]);
      }
      return jsonResponse([]);
    });

    await loadAllCardData('en', {
      dexEntries: [{ number: 6, name: 'Charizard' }],
      rarities: ['Ultra Rare', 'Secret Rare'],
      fetchImpl,
    });

    const cached = getAllCachedCardsForDex('en', 6);
    expect(cached).toHaveLength(2);
    expect(cached.map((c) => c.id).sort()).toEqual(['sv03-223', 'sv03.5-199']);
  });
});

describe('loadAllPrintingsForDex', () => {
  it('fetches the full unfiltered card list, backfills rarity and set name per card via a detail lookup, and caches the result', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      if (url.includes('dexId=eq%3A4') || url.includes('dexId=eq:4')) {
        return jsonResponse([
          {
            id: 'svp-044',
            localId: '044',
            name: 'Charmander',
            image: 'https://assets.tcgdex.net/en/sv/svp/044',
          },
        ]);
      }
      return jsonResponse([]);
    });

    const result = await loadAllPrintingsForDex('en', 4, fetchImpl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'svp-044',
      dexNumber: 4,
      setId: 'svp',
      setName: 'SVP Black Star Promos',
      rarity: 'Promo',
      language: 'en',
    });
    expect(getAllCachedCardsForDex('en', 4)).toEqual(result);
  });

  it('caches an empty array when a Pokemon has no cards at all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const result = await loadAllPrintingsForDex('en', 999, fetchImpl);
    expect(result).toEqual([]);
    expect(getAllCachedCardsForDex('en', 999)).toEqual([]);
  });

  it('does not refetch over the network on a later call for the same dex number once the full print history is cached', async () => {
    // Simulates a picker being closed and reopened: Picker's own "already
    // fetched" state is local component state that resets on remount, so
    // this call-it-twice-independently pattern is what actually exercises
    // the durable, localStorage-backed cache check inside
    // loadAllPrintingsForDex itself, not any in-memory guard a caller keeps.
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      if (url.includes('dexId=eq%3A4') || url.includes('dexId=eq:4')) {
        return jsonResponse([
          {
            id: 'svp-044',
            localId: '044',
            name: 'Charmander',
            image: 'https://assets.tcgdex.net/en/sv/svp/044',
          },
        ]);
      }
      return jsonResponse([]);
    });

    const first = await loadAllPrintingsForDex('en', 4, fetchImpl);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await loadAllPrintingsForDex('en', 4, fetchImpl);

    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
    expect(second).toEqual(first);
  });

  it('refetches after a curated-only loadAllCardData run overwrites the same dex number, instead of trusting a stale full-history flag', async () => {
    const showAllFetch = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      return jsonResponse([
        {
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          image: 'https://assets.tcgdex.net/en/sv/svp/044',
        },
      ]);
    });
    await loadAllPrintingsForDex('en', 4, showAllFetch);

    // A curated refresh (e.g. "Refresh Data") overwrites dex 4's cache slot
    // with just the narrower curated subset.
    const curatedFetch = vi.fn().mockResolvedValue(jsonResponse([]));
    await loadAllCardData('en', {
      dexEntries: [{ number: 4, name: 'Charmander' }],
      rarities: ['Ultra Rare'],
      fetchImpl: curatedFetch,
    });

    const secondShowAllFetch = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      return jsonResponse([
        {
          id: 'svp-044',
          localId: '044',
          name: 'Charmander',
          image: 'https://assets.tcgdex.net/en/sv/svp/044',
        },
      ]);
    });
    await loadAllPrintingsForDex('en', 4, secondShowAllFetch);

    expect(secondShowAllFetch.mock.calls.length).toBeGreaterThan(0);
  });
});
