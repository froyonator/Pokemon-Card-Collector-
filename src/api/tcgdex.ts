export interface TcgdexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexPricingTcgplayerVariant {
  marketPrice?: number | null;
}

export interface TcgdexPricing {
  cardmarket?: {
    avg?: number | null;
    updated?: string;
  };
  tcgplayer?: {
    updated?: string;
    [variant: string]: TcgdexPricingTcgplayerVariant | string | undefined;
  };
}

export interface TcgdexCardDetail extends TcgdexCardBrief {
  rarity?: string;
  dexId?: number[];
  set: { id: string; name: string };
  pricing?: TcgdexPricing;
}

const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

function isPocketCard(card: TcgdexCardBrief): boolean {
  return card.image ? card.image.includes('/tcgp/') : false;
}

export async function fetchCardsForDexAndRarity(
  dexNumber: number,
  rarity: string,
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexCardBrief[]> {
  const url = new URL(`${TCGDEX_BASE}/${language}/cards`);
  url.searchParams.set('dexId', `eq:${dexNumber}`);
  url.searchParams.set('rarity', `eq:${rarity}`);
  const res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  const cards: TcgdexCardBrief[] = await res.json();
  return cards.filter((card) => !isPocketCard(card));
}

export async function fetchCardDetail(
  cardId: string,
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexCardDetail> {
  const res = await fetchImpl(`${TCGDEX_BASE}/${language}/cards/${cardId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  return res.json();
}

export function cardImageUrl(
  baseImage: string,
  quality: 'high' | 'low' = 'low',
  ext: 'png' | 'webp' = 'webp'
): string {
  return `${baseImage}/${quality}.${ext}`;
}

export function extractTcgplayerMarketPrice(pricing: TcgdexPricing | undefined): number | null {
  if (!pricing?.tcgplayer) return null;
  for (const [key, value] of Object.entries(pricing.tcgplayer)) {
    if (key === 'updated') continue;
    if (value && typeof value === 'object' && typeof value.marketPrice === 'number') {
      return value.marketPrice;
    }
  }
  return null;
}

export function extractCardmarketAvgPrice(pricing: TcgdexPricing | undefined): number | null {
  return pricing?.cardmarket?.avg ?? null;
}

export interface TcgdexSetBrief {
  id: string;
  name: string;
}

export async function fetchSets(
  language: string,
  fetchImpl: typeof fetch = fetch
): Promise<TcgdexSetBrief[]> {
  const res = await fetchImpl(`${TCGDEX_BASE}/${language}/sets`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  return res.json();
}

export function deriveSetId(cardId: string, localId: string): string {
  return cardId.slice(0, cardId.length - localId.length - 1);
}
