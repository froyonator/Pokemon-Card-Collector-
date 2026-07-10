import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllCachedCardsForDex, loadAllCardData } from './loadCardData';

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
});
