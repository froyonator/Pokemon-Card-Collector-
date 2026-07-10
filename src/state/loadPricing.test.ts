import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshMarketPrices } from './loadPricing';
import { getCachedPricing } from '../storage/cardCache';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe('refreshMarketPrices', () => {
  it('fetches pricing only for owned and wishlisted card ids, deduplicated', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'sv03.5-199',
        localId: '199',
        name: 'Charizard ex',
        set: { id: 'sv03.5', name: '151' },
        pricing: { cardmarket: { avg: 372.8 }, tcgplayer: { 'unlimited-holofoil': { marketPrice: 699.99 } } },
      })
    );

    await refreshMarketPrices(
      'en',
      { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
      { 1: { dexNumber: 1, cardId: 'sv03.5-199', addedAt: '' } },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const cached = getCachedPricing('sv03.5-199');
    expect(cached).toMatchObject({ cardmarketEurAvg: 372.8, tcgplayerUsdMarket: 699.99 });
  });

  it('makes no fetch calls when there is nothing owned or wishlisted', async () => {
    const fetchImpl = vi.fn();
    await refreshMarketPrices('en', {}, {}, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches pricing for each distinct card id when there is more than one', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('sv03.5-199')) {
        return jsonResponse({
          id: 'sv03.5-199',
          localId: '199',
          name: 'Charizard ex',
          set: { id: 'sv03.5', name: '151' },
          pricing: { cardmarket: { avg: 372.8 }, tcgplayer: { 'unlimited-holofoil': { marketPrice: 699.99 } } },
        });
      }
      return jsonResponse({
        id: 'sv03.5-6',
        localId: '6',
        name: 'Pikachu ex',
        set: { id: 'sv03.5', name: '151' },
        pricing: { cardmarket: { avg: 12.5 }, tcgplayer: { 'unlimited-holofoil': { marketPrice: 15.99 } } },
      });
    });

    await refreshMarketPrices(
      'en',
      { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } },
      { 25: { dexNumber: 25, cardId: 'sv03.5-6', addedAt: '' } },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getCachedPricing('sv03.5-199')).toMatchObject({ cardmarketEurAvg: 372.8 });
    expect(getCachedPricing('sv03.5-6')).toMatchObject({ cardmarketEurAvg: 12.5 });
  });
});
