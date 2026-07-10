import { describe, expect, it, vi } from 'vitest';
import { convertAmount, fetchRates } from './fx';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('fetchRates', () => {
  it('requests the given base and symbols', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ amount: 1, base: 'USD', date: '2026-07-09', rates: { AUD: 1.441, EUR: 0.87451 } })
    );
    const rates = await fetchRates('USD', ['AUD', 'EUR'], fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD,EUR'
    );
    expect(rates.rates.AUD).toBe(1.441);
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchRates('USD', ['AUD'], fetchImpl)).rejects.toThrow(
      'Frankfurter request failed with status 500'
    );
  });
});

describe('convertAmount', () => {
  it('multiplies and rounds to 2 decimal places', () => {
    expect(convertAmount(699.99, 1.441)).toBe(1008.69);
  });

  it('returns the same amount for a rate of 1', () => {
    expect(convertAmount(100, 1)).toBe(100);
  });
});
