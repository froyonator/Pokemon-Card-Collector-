import { describe, expect, it, vi } from 'vitest';
import {
  cardImageUrl,
  deriveSetId,
  extractCardmarketAvgPrice,
  extractTcgplayerMarketPrice,
  fetchAllCardsForDex,
  fetchCardDetail,
  fetchCardsForDexAndRarity,
  fetchSets,
} from './tcgdex';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchCardsForDexAndRarity', () => {
  it('queries dexId and rarity with eq filters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl);
    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/v2/en/cards');
    expect(calledUrl.searchParams.get('dexId')).toBe('eq:6');
    expect(calledUrl.searchParams.get('rarity')).toBe('eq:Ultra Rare');
  });

  it('filters out Pokemon TCG Pocket cards by image path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: 'https://assets.tcgdex.net/en/sv/sv03.5/199' },
        { id: 'A1a-086', localId: '086', name: 'Mew ex', image: 'https://assets.tcgdex.net/en/tcgp/A1a/086' },
      ])
    );
    const cards = await fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('sv03.5-199');
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl)).rejects.toThrow(
      'TCGdex request failed with status 500'
    );
  });

  it('passes an AbortSignal through to fetchImpl when given one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const controller = new AbortController();
    await fetchCardsForDexAndRarity(6, 'Ultra Rare', 'en', fetchImpl, controller.signal);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});

describe('fetchAllCardsForDex', () => {
  it('queries both dexId (no rarity filter) and name in parallel', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await fetchAllCardsForDex(4, 'Charmander', 'en', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = fetchImpl.mock.calls.map((call) => new URL(call[0] as string));
    const dexIdUrl = urls.find((u) => u.searchParams.has('dexId'));
    const nameUrl = urls.find((u) => u.searchParams.has('name'));
    expect(dexIdUrl?.pathname).toBe('/v2/en/cards');
    expect(dexIdUrl?.searchParams.get('dexId')).toBe('eq:4');
    expect(dexIdUrl?.searchParams.has('rarity')).toBe(false);
    expect(nameUrl?.pathname).toBe('/v2/en/cards');
    expect(nameUrl?.searchParams.get('name')).toBe('like:Charmander');
  });

  it('filters out Pokemon TCG Pocket cards by image path, same as the per-rarity fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'svp-044', localId: '044', name: 'Charmander', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
        { id: 'A1a-086', localId: '086', name: 'Mew ex', image: 'https://assets.tcgdex.net/en/tcgp/A1a/086' },
      ])
    );
    const cards = await fetchAllCardsForDex(4, 'Charmander', 'en', fetchImpl);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('svp-044');
  });

  it('merges dexId and name results by id, de-duplicating cards found by both', async () => {
    const shared = { id: 'svp-044', localId: '044', name: 'Charmander', image: 'https://assets.tcgdex.net/en/sv/svp/044' };
    const nameOnly = {
      id: 'me02.5-039',
      localId: '039',
      name: 'Mega Charmander ex',
      image: 'https://assets.tcgdex.net/en/me/me02.5/039',
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([shared]))
      .mockResolvedValueOnce(jsonResponse([shared, nameOnly]));
    const cards = await fetchAllCardsForDex(4, 'Charmander', 'en', fetchImpl);
    expect(cards.map((c) => c.id).sort()).toEqual(['me02.5-039', 'svp-044']);
  });

  it('drops name-matched cards that only substring-match, not whole-word-match, the pokemon name', async () => {
    const wholeWord = { id: 'a-1', localId: '1', name: 'Mega Gengar ex', image: 'https://assets.tcgdex.net/en/a/1' };
    const substringOnly = { id: 'a-2', localId: '2', name: 'Gengarite', image: 'https://assets.tcgdex.net/en/a/2' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([wholeWord, substringOnly]));
    const cards = await fetchAllCardsForDex(94, 'Gengar', 'en', fetchImpl);
    expect(cards.map((c) => c.id)).toEqual(['a-1']);
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchAllCardsForDex(4, 'Charmander', 'en', fetchImpl)).rejects.toThrow(
      'TCGdex request failed with status 500'
    );
  });

  it('passes an AbortSignal through to fetchImpl when given one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const controller = new AbortController();
    await fetchAllCardsForDex(4, 'Charmander', 'en', fetchImpl, controller.signal);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ signal: controller.signal });
  });
});

describe('fetchCardDetail', () => {
  it('fetches a single card by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ id: 'sv03.5-199', localId: '199', name: 'Charizard ex', set: { id: 'sv03.5', name: '151' } })
    );
    const card = await fetchCardDetail('sv03.5-199', 'en', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.tcgdex.net/v2/en/cards/sv03.5-199',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(card.set.name).toBe('151');
  });

  it('passes an AbortSignal through to fetchImpl when given one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ id: 'sv03.5-199', localId: '199', name: 'Charizard ex', set: { id: 'sv03.5', name: '151' } })
    );
    const controller = new AbortController();
    await fetchCardDetail('sv03.5-199', 'en', fetchImpl, controller.signal);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});

describe('cardImageUrl', () => {
  it('appends quality and extension to the base image path', () => {
    expect(cardImageUrl('https://assets.tcgdex.net/en/sv/sv03.5/199')).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
    );
    expect(cardImageUrl('https://assets.tcgdex.net/en/sv/sv03.5/199', 'high', 'png')).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });
});

describe('extractTcgplayerMarketPrice', () => {
  it('reads the market price from the first variant that has one', () => {
    const price = extractTcgplayerMarketPrice({
      tcgplayer: {
        updated: '2026-07-09',
        'unlimited-holofoil': { marketPrice: 570.67 },
      },
    });
    expect(price).toBe(570.67);
  });

  it('returns null when there is no tcgplayer pricing', () => {
    expect(extractTcgplayerMarketPrice(undefined)).toBeNull();
    expect(extractTcgplayerMarketPrice({})).toBeNull();
  });
});

describe('extractCardmarketAvgPrice', () => {
  it('reads the cardmarket average', () => {
    expect(extractCardmarketAvgPrice({ cardmarket: { avg: 372.8 } })).toBe(372.8);
  });

  it('returns null when there is no cardmarket pricing', () => {
    expect(extractCardmarketAvgPrice(undefined)).toBeNull();
  });
});

describe('fetchSets', () => {
  it('fetches the id/name list of sets for a language', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'sv03.5', name: '151' },
        { id: 'sv03', name: 'Obsidian Flames' },
      ])
    );
    const sets = await fetchSets('en', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.tcgdex.net/v2/en/sets',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(sets).toEqual([
      { id: 'sv03.5', name: '151' },
      { id: 'sv03', name: 'Obsidian Flames' },
    ]);
  });

  it('passes an AbortSignal through to fetchImpl when given one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const controller = new AbortController();
    await fetchSets('en', fetchImpl, controller.signal);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});

describe('deriveSetId', () => {
  it('strips the trailing -localId suffix from a card id', () => {
    expect(deriveSetId('sv03.5-199', '199')).toBe('sv03.5');
    expect(deriveSetId('sv10.5b-165', '165')).toBe('sv10.5b');
  });
});
