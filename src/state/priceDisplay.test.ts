import { describe, expect, it, vi } from 'vitest';
import { convertViaUsdPivot, fetchUsdPivotRates, priceInCurrency } from './priceDisplay';
import type { CardPricing } from '../types';

const pricing: CardPricing = {
  cardId: 'sv03.5-199',
  cardmarketEurAvg: 100,
  tcgplayerUsdMarket: 200,
  fetchedAt: '2026-07-09T00:00:00.000Z',
};

const usdRates = { USD: 1, EUR: 0.87451, AUD: 1.441, GBP: 0.75, CAD: 1.35 };

describe('convertViaUsdPivot', () => {
  it('returns the amount unchanged when currencies match', () => {
    expect(convertViaUsdPivot(100, 'USD', 'USD', usdRates)).toBe(100);
  });

  it('converts USD directly using the target rate', () => {
    expect(convertViaUsdPivot(200, 'USD', 'AUD', usdRates)).toBe(288.2);
  });

  it('converts EUR by pivoting through USD', () => {
    const result = convertViaUsdPivot(100, 'EUR', 'AUD', usdRates);
    expect(result).toBeCloseTo(164.79, 1);
  });

  it('returns null when the target rate is missing', () => {
    expect(convertViaUsdPivot(100, 'USD', 'AUD', { USD: 1 })).toBeNull();
  });
});

describe('priceInCurrency', () => {
  it('returns the native cardmarket price unconverted when target is EUR', () => {
    const result = priceInCurrency(pricing, 'cardmarket', 'EUR', usdRates);
    expect(result).toEqual({ amount: 100, currency: 'EUR', isConverted: false });
  });

  it('returns the native tcgplayer price unconverted when target is USD', () => {
    const result = priceInCurrency(pricing, 'tcgplayer', 'USD', usdRates);
    expect(result).toEqual({ amount: 200, currency: 'USD', isConverted: false });
  });

  it('converts tcgplayer USD price to a non-native currency', () => {
    const result = priceInCurrency(pricing, 'tcgplayer', 'AUD', usdRates);
    expect(result.isConverted).toBe(true);
    expect(result.amount).toBe(288.2);
  });

  it('returns a null amount when there is no pricing for that source', () => {
    const result = priceInCurrency(undefined, 'cardmarket', 'EUR', usdRates);
    expect(result.amount).toBeNull();
  });
});

describe('fetchUsdPivotRates', () => {
  it('requests USD-based rates and includes USD itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ amount: 1, base: 'USD', date: '2026-07-09', rates: { EUR: 0.87451, AUD: 1.441, GBP: 0.75, CAD: 1.35 } }),
    } as unknown as Response);
    const rates = await fetchUsdPivotRates(fetchImpl);
    expect(rates.USD).toBe(1);
    expect(rates.AUD).toBe(1.441);
  });
});
