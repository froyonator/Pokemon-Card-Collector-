import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllCachedCardsForDex, loadAllCardData, loadAllPrintingsForDex } from './loadCardData';
import { setCachedCards } from '../storage/cardCache';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

// Drains the microtask queue via a macrotask boundary, more robust than
// chaining a guessed number of `await Promise.resolve()` calls -- useful
// here since some tests below need several chained awaits (fetchSets's own
// res.json() call, mapWithConcurrency's worker ramp-up, etc.) to settle
// before the next step.
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// This project has no @types/node dependency, so the global `process`
// symbol (used below purely to assert loadAllCardData's abort handling
// doesn't produce an unhandledRejection) isn't typed. Vitest genuinely runs
// on Node under the hood even with a jsdom environment, so `process` exists
// at runtime; this narrowly-typed accessor covers just the two methods
// needed instead of pulling in a whole new dependency for it.
interface MinimalNodeProcess {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
}
const nodeProcess = (globalThis as unknown as { process: MinimalNodeProcess }).process;

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
    // Under real concurrency, which dex number's queries resolve first
    // depends on network/timing, not array position, so which dex number
    // triggers a given progress call is no longer deterministic. What *is*
    // still guaranteed: exactly one progress call per dex number, a strictly
    // increasing `completed` counter, and a final call reporting everything
    // done.
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
    expect(progressCalls).toHaveLength(2);
    expect(progressCalls.map((p) => p.completed)).toEqual([1, 2]);
    expect(progressCalls.every((p) => p.total === 2)).toBe(true);
    expect(progressCalls[progressCalls.length - 1]).toEqual({ completed: 2, total: 2 });
  });

  it('calls onDexLoaded exactly once per dex number, only once that dex number\'s own rarity queries are all done', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const loadedDexNumbers: number[] = [];
    await loadAllCardData('en', {
      dexEntries: [
        { number: 1, name: 'Bulbasaur' },
        { number: 2, name: 'Ivysaur' },
        { number: 3, name: 'Venusaur' },
      ],
      rarities: ['Ultra Rare', 'Secret Rare'],
      onDexLoaded: (dexNumber) => loadedDexNumbers.push(dexNumber),
      fetchImpl,
    });
    expect(loadedDexNumbers.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('warns (but does not crash) when dexEntries contains a duplicate dex number, since the accumulator is keyed strictly by dex number', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await loadAllCardData('en', {
      dexEntries: [
        { number: 1, name: 'Bulbasaur' },
        { number: 1, name: 'Bulbasaur' },
      ],
      rarities: ['Ultra Rare'],
      fetchImpl,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/duplicate dex number \(1\)/);
    warnSpy.mockRestore();
  });

  it('does not warn when dexEntries has no duplicates', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await loadAllCardData('en', {
      dexEntries: [
        { number: 1, name: 'Bulbasaur' },
        { number: 2, name: 'Ivysaur' },
      ],
      rarities: ['Ultra Rare'],
      fetchImpl,
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("preserves an owned card discovered via 'Show all cards' when a curated refresh's own rarity set doesn't include it", async () => {
    // Reproduces a real reported bug: mark an off-catalog promo card owned
    // via "Show all cards" (which caches it outside this curated fetch's own
    // rarity list), then click Refresh Data. Before this test's fix, the
    // curated write below unconditionally replaced the whole cache entry
    // with just its own (empty, in this test) results, silently discarding
    // the owned card's metadata even though the user's `owned` record still
    // pointed at it -- Card/Binder view then fell back to a generic sprite
    // since the id it needed no longer resolved to anything.
    setCachedCards('en', 4, [
      {
        id: 'svp-044',
        name: 'Charmander',
        dexNumber: 4,
        setId: 'svp',
        setName: 'SVP Black Star Promos',
        localId: '044',
        rarity: 'Promo',
        imageBase: 'https://assets.tcgdex.net/en/sv/svp/044',
        language: 'en',
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    await loadAllCardData('en', {
      dexEntries: [{ number: 4, name: 'Charmander' }],
      rarities: ['Ultra Rare'],
      owned: { 4: { dexNumber: 4, cardId: 'svp-044', condition: 'Near Mint', addedAt: '' } },
      fetchImpl,
    });

    const cached = getAllCachedCardsForDex('en', 4);
    expect(cached.map((c) => c.id)).toContain('svp-044');
  });

  it("does not preserve a stale owned-card id that isn't actually cached anywhere (nothing to merge back in)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await loadAllCardData('en', {
      dexEntries: [{ number: 4, name: 'Charmander' }],
      rarities: ['Ultra Rare'],
      owned: { 4: { dexNumber: 4, cardId: 'does-not-exist', condition: 'Near Mint', addedAt: '' } },
      fetchImpl,
    });
    const cached = getAllCachedCardsForDex('en', 4);
    expect(cached).toEqual([]);
  });

  it('does not duplicate the owned card when the curated fetch already includes it', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      if (url.includes('dexId')) {
        return jsonResponse([
          { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: 'https://x/199' },
        ]);
      }
      return jsonResponse([]);
    });
    await loadAllCardData('en', {
      dexEntries: [{ number: 6, name: 'Charizard' }],
      rarities: ['Ultra Rare'],
      owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
      fetchImpl,
    });
    const cached = getAllCachedCardsForDex('en', 6);
    expect(cached.filter((c) => c.id === 'sv03.5-199')).toHaveLength(1);
  });

  it('caches every dex number, reports progress, and fires onDexLoaded when the rarities list is empty (e.g. every rarity group emptied via Manage Groups)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const progressCalls: { completed: number; total: number }[] = [];
    const loadedDexNumbers: number[] = [];
    await loadAllCardData('en', {
      dexEntries: [
        { number: 1, name: 'Bulbasaur' },
        { number: 2, name: 'Ivysaur' },
      ],
      rarities: [],
      onProgress: (p) => progressCalls.push(p),
      onDexLoaded: (dexNumber) => loadedDexNumbers.push(dexNumber),
      fetchImpl,
    });
    // No rarity means no jobs, so the fetch mock should never even be hit
    // for cards (fetchSets is still called once, unconditionally).
    expect(getAllCachedCardsForDex('en', 1)).toEqual([]);
    expect(getAllCachedCardsForDex('en', 2)).toEqual([]);
    expect(progressCalls).toEqual([
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);
    expect(loadedDexNumbers.sort((a, b) => a - b)).toEqual([1, 2]);
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

    const result = await loadAllPrintingsForDex('en', 4, 'Charmander', fetchImpl);

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
    const result = await loadAllPrintingsForDex('en', 999, 'Nonexistent', fetchImpl);
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

    const first = await loadAllPrintingsForDex('en', 4, 'Charmander', fetchImpl);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await loadAllPrintingsForDex('en', 4, 'Charmander', fetchImpl);

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
    await loadAllPrintingsForDex('en', 4, 'Charmander', showAllFetch);

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
    await loadAllPrintingsForDex('en', 4, 'Charmander', secondShowAllFetch);

    expect(secondShowAllFetch.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('cross-load-path write-generation guard (loadAllCardData vs. loadAllPrintingsForDex racing on the same dex number)', () => {
  it('does not let a slow curated loadAllCardData write clobber a faster, later-started loadAllPrintingsForDex ("Show all cards") result for the same dex number', async () => {
    let releaseCurated: ((response: Response) => void) | undefined;
    const curatedFetch = vi.fn((url: string) => {
      if (url.includes('/sets')) {
        return Promise.resolve(jsonResponse([{ id: 'sv03.5', name: '151' }]));
      }
      // The curated card-list request for dex 4 hangs until manually
      // released, simulating a slow curated fetch that started first.
      return new Promise<Response>((resolve) => {
        releaseCurated = resolve;
      });
    });

    const curatedPromise = loadAllCardData('en', {
      dexEntries: [{ number: 4, name: 'Charmander' }],
      rarities: ['Ultra Rare'],
      fetchImpl: curatedFetch,
    });

    // Let the curated call reach (and hang on) its one card-list request.
    // Its write generation for dex 4 is reserved synchronously right after
    // fetchSets resolves, before this request is even issued, so by this
    // point it has already reserved its (soon-to-be-stale) generation.
    await flushMicrotasks();
    expect(releaseCurated).toBeDefined();

    // Show-All starts LATER (reserving a newer generation for the same key)
    // and completes FULLY before the curated fetch resolves.
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
    const showAllResult = await loadAllPrintingsForDex('en', 4, 'Charmander', showAllFetch);
    expect(getAllCachedCardsForDex('en', 4)).toEqual(showAllResult);

    // Now let the stale curated fetch finally resolve.
    releaseCurated!(
      jsonResponse([
        {
          id: 'sv03.5-199',
          localId: '199',
          name: 'Charizard ex',
          image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        },
      ])
    );
    await curatedPromise;

    // The curated write must have been skipped: the cache should still
    // reflect Show-All's fuller/fresher result, not get clobbered back to
    // the narrower curated one just because it happened to resolve last.
    expect(getAllCachedCardsForDex('en', 4)).toEqual(showAllResult);
  });

  it('does not skip a legitimately newer curated write just because a Show-All fetch already wrote to the same dex number earlier', async () => {
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
    const showAllResult = await loadAllPrintingsForDex('en', 4, 'Charmander', showAllFetch);
    expect(getAllCachedCardsForDex('en', 4)).toEqual(showAllResult);

    // The user deliberately hits "Refresh Data" some time later: a fresh
    // curated load for the same dex number, started well after Show-All
    // already finished. This is a legitimate newer action, not a stale
    // straggler racing against it, so its write must NOT be skipped --
    // proving the guard doesn't overreach and break ordinary sequential
    // refreshes.
    const curatedFetch = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      return jsonResponse([
        {
          id: 'sv03.5-199',
          localId: '199',
          name: 'Charizard ex',
          image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        },
      ]);
    });
    await loadAllCardData('en', {
      dexEntries: [{ number: 4, name: 'Charmander' }],
      rarities: ['Ultra Rare'],
      fetchImpl: curatedFetch,
    });

    const cached = getAllCachedCardsForDex('en', 4);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({ id: 'sv03.5-199' });
  });
});

describe('loadAllCardData AbortSignal cancellation', () => {
  it('stops issuing further fetch calls once aborted, not just ignoring their eventual results', async () => {
    const controller = new AbortController();
    const releasers: Array<() => void> = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/sets')) {
        return Promise.resolve(jsonResponse([{ id: 'sv03.5', name: '151' }]));
      }
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        let settled = false;
        releasers.push(() => {
          if (settled) return;
          settled = true;
          resolve(jsonResponse([]));
        });
        signal?.addEventListener('abort', () => {
          if (settled) return;
          settled = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const dexEntries = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, name: `Mon${i + 1}` }));
    const promise = loadAllCardData('en', {
      dexEntries,
      rarities: ['Ultra Rare'], // 10 jobs, concurrency 6 -> 6 start immediately, 4 queued
      fetchImpl,
      signal: controller.signal,
    });

    await flushMicrotasks();
    expect(releasers).toHaveLength(6);
    const callsAfterRampUp = fetchImpl.mock.calls.length; // 1 (/sets) + 6 card-list calls

    // Release exactly one in-flight job normally, then abort immediately
    // (synchronously, before that release's continuation runs) -- this lets
    // that job's worker loop back to pick up a fresh job from the queue,
    // proving it's the PROACTIVE check (not merely in-flight requests
    // rejecting) that stops it from issuing an 11th fetch call.
    releasers[0]();
    controller.abort();
    await promise;
    await flushMicrotasks();

    expect(fetchImpl.mock.calls.length).toBe(callsAfterRampUp);
  });

  it('does not produce an unhandled promise rejection when aborted mid-flight', async () => {
    const unhandled: unknown[] = [];
    const handler = (reason: unknown) => unhandled.push(reason);
    nodeProcess.on('unhandledRejection', handler);
    try {
      const controller = new AbortController();
      const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/sets')) {
          return Promise.resolve(jsonResponse([{ id: 'sv03.5', name: '151' }]));
        }
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const promise = loadAllCardData('en', {
        dexEntries: [
          { number: 1, name: 'Bulbasaur' },
          { number: 2, name: 'Ivysaur' },
          { number: 3, name: 'Venusaur' },
        ],
        rarities: ['Ultra Rare', 'Secret Rare', 'Special illustration rare'],
        fetchImpl,
        signal: controller.signal,
      });

      await flushMicrotasks();
      controller.abort();
      // Must resolve, not reject.
      await expect(promise).resolves.toBeUndefined();
      // Give any straggling microtask-queued rejections (from other
      // in-flight jobs settling around the same time) a chance to surface
      // as unhandledRejection events, which Node fires a tick after the
      // relevant microtask queue drains.
      await flushMicrotasks();
    } finally {
      nodeProcess.off('unhandledRejection', handler);
    }
    expect(unhandled).toEqual([]);
  });

  it('still rejects for a genuine (non-abort) fetch failure, not silently swallowed by the abort-handling path', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    await expect(
      loadAllCardData('en', {
        dexEntries: [{ number: 1, name: 'Bulbasaur' }],
        rarities: ['Ultra Rare'],
        fetchImpl,
      })
    ).rejects.toThrow('TCGdex request failed with status 500');
  });

  it('still rejects for a genuine fetch failure even when an AbortSignal is provided but never aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/sets')) {
        return jsonResponse([{ id: 'sv03.5', name: '151' }]);
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    await expect(
      loadAllCardData('en', {
        dexEntries: [{ number: 1, name: 'Bulbasaur' }],
        rarities: ['Ultra Rare'],
        fetchImpl,
        signal: controller.signal,
      })
    ).rejects.toThrow('TCGdex request failed with status 500');
  });
});

describe('3-way interleaving: curated load + Show-All + a mid-flight abort, all targeting the same dex number', () => {
  it('an aborted curated load never clobbers a concurrently-completed Show-All result, and resolves cleanly instead of rejecting', async () => {
    // Models the exact scenario from the bug report: a curated
    // loadAllCardData fetch for dex 4 starts and hangs; a "Show all cards"
    // fetch for the same dex number starts later and runs to completion
    // while the curated one is still in flight; then the user switches
    // language, so DexGrid aborts the curated load's controller (Show-All
    // isn't wired to any controller and is unaffected).
    const controller = new AbortController();
    let releaseCurated: ((response: Response) => void) | undefined;
    const curatedFetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/sets')) {
        return Promise.resolve(jsonResponse([{ id: 'sv03.5', name: '151' }]));
      }
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        releaseCurated = resolve;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const curatedPromise = loadAllCardData('en', {
      dexEntries: [{ number: 4, name: 'Charmander' }],
      rarities: ['Ultra Rare'],
      fetchImpl: curatedFetch,
      signal: controller.signal,
    });

    // Let the curated call reserve its generation for dex 4 and hang on its
    // one card-list request.
    await flushMicrotasks();
    expect(releaseCurated).toBeDefined();

    // Show-All starts (reserving a newer generation for the same key) and
    // runs to completion, entirely independent of the curated call's
    // AbortController.
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
    const showAllResult = await loadAllPrintingsForDex('en', 4, 'Charmander', showAllFetch);
    expect(getAllCachedCardsForDex('en', 4)).toEqual(showAllResult);

    // The user switches language: DexGrid aborts the curated load instead
    // of letting it run to completion in the background.
    controller.abort();
    // Must resolve (not reject) despite being aborted mid-flight.
    await expect(curatedPromise).resolves.toBeUndefined();

    // Show-All's result must still be intact: the aborted curated load must
    // not have written anything at all for dex 4 -- neither because it lost
    // the write-generation race (it never got that far) nor because
    // aborting somehow bypassed the guard.
    expect(getAllCachedCardsForDex('en', 4)).toEqual(showAllResult);
  });
});
