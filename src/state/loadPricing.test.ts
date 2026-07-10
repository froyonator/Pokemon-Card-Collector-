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
});
