import { extractCardmarketAvgPrice, extractTcgplayerMarketPrice, fetchCardDetail } from '../api/tcgdex';
import { setCachedPricing } from '../storage/cardCache';
import type { CardPricing, OwnedRecord, WishlistRecord } from '../types';

export async function refreshMarketPrices(
  language: string,
  owned: Record<number, OwnedRecord>,
  wishlist: Record<number, WishlistRecord>,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const cardIds = new Set<string>();
  Object.values(owned).forEach((record) => cardIds.add(record.cardId));
  Object.values(wishlist).forEach((record) => cardIds.add(record.cardId));

  for (const cardId of cardIds) {
    const detail = await fetchCardDetail(cardId, language, fetchImpl);
    const pricing: CardPricing = {
      cardId,
      cardmarketEurAvg: extractCardmarketAvgPrice(detail.pricing),
      tcgplayerUsdMarket: extractTcgplayerMarketPrice(detail.pricing),
      fetchedAt: new Date().toISOString(),
    };
    setCachedPricing(cardId, pricing);
  }
}
