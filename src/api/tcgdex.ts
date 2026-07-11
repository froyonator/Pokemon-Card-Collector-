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
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TcgdexCardBrief[]> {
  const url = new URL(`${TCGDEX_BASE}/${language}/cards`);
  url.searchParams.set('dexId', `eq:${dexNumber}`);
  url.searchParams.set('rarity', `eq:${rarity}`);
  const res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  const cards: TcgdexCardBrief[] = await res.json();
  return cards.filter((card) => !isPocketCard(card));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchCardsByQuery(
  params: Record<string, string>,
  language: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<TcgdexCardBrief[]> {
  const url = new URL(`${TCGDEX_BASE}/${language}/cards`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  const cards: TcgdexCardBrief[] = await res.json();
  return cards.filter((card) => !isPocketCard(card));
}

export async function fetchAllCardsForDex(
  dexNumber: number,
  pokemonName: string,
  language: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TcgdexCardBrief[]> {
  // A dexId-only query misses any card TCGdex has left dexId: null on --
  // confirmed for every card in the very recent "Ascended Heroes" set (a
  // real, upstream data-completeness gap, not something wrong with this
  // query). A name-based search catches those instead, since the name field
  // is populated even when dexId isn't. Run both and merge, since neither
  // alone is a superset of the other (a card can have a populated dexId but
  // an unexpected name, or vice versa).
  const [byDexId, byName] = await Promise.all([
    fetchCardsByQuery({ dexId: `eq:${dexNumber}` }, language, fetchImpl, signal),
    fetchCardsByQuery({ name: `like:${pokemonName}` }, language, fetchImpl, signal),
  ]);

  const merged = new Map<string, TcgdexCardBrief>();
  for (const card of byDexId) merged.set(card.id, card);

  // `like` is a substring match, which would incorrectly pull in e.g.
  // "Mewtwo" cards when searching for "Mew". Only keep name-matched cards
  // where the Pokemon's name appears as a whole word (so "Mega Gengar ex"
  // matches a search for "Gengar", but "Mewtwo ex" doesn't match "Mew").
  const wholeWordMatch = new RegExp(`\\b${escapeRegExp(pokemonName)}\\b`, 'i');
  for (const card of byName) {
    if (!merged.has(card.id) && wholeWordMatch.test(card.name)) {
      merged.set(card.id, card);
    }
  }

  return Array.from(merged.values());
}

export async function fetchCardDetail(
  cardId: string,
  language: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TcgdexCardDetail> {
  const res = await fetchImpl(`${TCGDEX_BASE}/${language}/cards/${cardId}`, {
    headers: { Accept: 'application/json' },
    signal,
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
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TcgdexSetBrief[]> {
  const res = await fetchImpl(`${TCGDEX_BASE}/${language}/sets`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  return res.json();
}

export function deriveSetId(cardId: string, localId: string): string {
  return cardId.slice(0, cardId.length - localId.length - 1);
}
