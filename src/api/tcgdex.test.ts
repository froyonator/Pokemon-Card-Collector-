import { describe, expect, it, vi } from 'vitest';
import {
  cardImageUrl,
  deriveSetId,
  extractCardmarketAvgPrice,
  extractTcgplayerMarketPrice,
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
});

describe('deriveSetId', () => {
  it('strips the trailing -localId suffix from a card id', () => {
    expect(deriveSetId('sv03.5-199', '199')).toBe('sv03.5');
    expect(deriveSetId('sv10.5b-165', '165')).toBe('sv10.5b');
  });
});
