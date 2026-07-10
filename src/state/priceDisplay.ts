import { convertAmount, fetchRates } from '../api/fx';
import type { CardPricing, Currency } from '../types';

export interface PriceDisplayResult {
  amount: number | null;
  currency: Currency;
  isConverted: boolean;
}

export async function fetchUsdPivotRates(
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, number>> {
  const result = await fetchRates('USD', ['EUR', 'AUD', 'GBP', 'CAD'], fetchImpl);
  return { USD: 1, ...result.rates };
}

export function convertViaUsdPivot(
  amount: number,
  nativeCurrency: 'USD' | 'EUR',
  targetCurrency: Currency,
  usdRates: Record<string, number>
): number | null {
  if (nativeCurrency === targetCurrency) {
    return amount;
  }
  const eurPerUsd = usdRates.EUR;
  const usdAmount = nativeCurrency === 'USD' ? amount : eurPerUsd ? amount / eurPerUsd : null;
  if (usdAmount === null) return null;
  const targetPerUsd = usdRates[targetCurrency];
  if (targetPerUsd === undefined) return null;
  return convertAmount(usdAmount, targetPerUsd);
}

export function priceInCurrency(
  pricing: CardPricing | undefined,
  source: 'cardmarket' | 'tcgplayer',
  targetCurrency: Currency,
  usdRates: Record<string, number> | undefined
): PriceDisplayResult {
  const nativeAmount =
    source === 'cardmarket' ? (pricing?.cardmarketEurAvg ?? null) : (pricing?.tcgplayerUsdMarket ?? null);
  const nativeCurrency: 'USD' | 'EUR' = source === 'cardmarket' ? 'EUR' : 'USD';

  if (nativeAmount === null) {
    return { amount: null, currency: targetCurrency, isConverted: false };
  }
  if (nativeCurrency === targetCurrency) {
    return { amount: nativeAmount, currency: targetCurrency, isConverted: false };
  }
  if (!usdRates) {
    return { amount: null, currency: targetCurrency, isConverted: false };
  }
  const converted = convertViaUsdPivot(nativeAmount, nativeCurrency, targetCurrency, usdRates);
  return { amount: converted, currency: targetCurrency, isConverted: converted !== null };
}
