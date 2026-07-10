import { useEffect, useState } from 'react';
import { fetchUsdPivotRates } from './priceDisplay';

export function useUsdRates(): Record<string, number> | undefined {
  const [rates, setRates] = useState<Record<string, number> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchUsdPivotRates().then((result) => {
      if (!cancelled) setRates(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return rates;
}
