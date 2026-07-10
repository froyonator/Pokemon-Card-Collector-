export interface FxRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

export async function fetchRates(
  base: string,
  symbols: string[],
  fetchImpl: typeof fetch = fetch
): Promise<FxRates> {
  const url = `${FRANKFURTER_BASE}/latest?base=${base}&symbols=${symbols.join(',')}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Frankfurter request failed with status ${res.status}`);
  }
  return res.json();
}

export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
