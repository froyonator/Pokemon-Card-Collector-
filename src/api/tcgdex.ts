export interface TcgdexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexCardDetail extends TcgdexCardBrief {
  rarity?: string;
  dexId?: number[];
  set: { id: string; name: string };
}

const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

// No fetch below waited on any deadline of its own before this existed: a
// single stalled connection (upstream hang, dropped packet, whatever) left
// its caller's promise pending forever, which is exactly what turned "Show
// all cards" into a several-minutes-and-counting spinner with no way out
// (see loadCardData.ts's loadAllPrintingsForDex, and Picker's loading
// state). 15s is generous for a small JSON response on a healthy
// connection, while still guaranteeing every request here eventually
// settles one way or another.
const FETCH_TIMEOUT_MS = 15000;

function isPocketCard(card: TcgdexCardBrief): boolean {
  return card.image ? card.image.includes('/tcgp/') : false;
}

// A fetch aborted via the composed signal below rejects with a
// DOMException (or, in some environments, a plain Error) named either
// 'AbortError' (a real cancellation) or 'TimeoutError' (AbortSignal.timeout
// firing) -- duck-typed on `.name` for the same cross-environment reason as
// loadCardData.ts's own isAbortError.
function isAbortLikeError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : (err as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

// Composes a caller-supplied signal (e.g. DexGrid cancelling a superseded
// load) with this module's own request-timeout watchdog, so a request is
// cancellable BOTH ways: by the caller choosing to abandon it, and by it
// simply taking too long. AbortSignal.any/AbortSignal.timeout are both
// broadly supported (Node 20+, all evergreen browsers); jsdom's own
// AbortSignal predates them, so the test environment polyfills them (see
// src/test/setup.ts) rather than this module working around their absence.
function composeSignalWithTimeout(callerSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

// Shared by every fetch below: builds the composed timeout signal, issues
// the request, and turns an abort into one of two distinct outcomes a
// caller can tell apart --
//   - the CALLER's own signal was what aborted it: rethrown completely
//     unchanged, so existing isAbortError handling upstream (loadCardData.ts)
//     keeps treating it as the expected, silent cancellation it already is.
//   - anything else that aborted the composed signal (i.e. this function's
//     own 15s watchdog, since nothing else feeds into it) is a REAL
//     failure, not a cancellation -- rethrown as a plain Error with a
//     distinct name, so it propagates as a genuine failure instead of
//     being silently swallowed as an expected abort by that same upstream
//     handling.
async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  callerSignal: AbortSignal | undefined
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: composeSignalWithTimeout(callerSignal),
    });
  } catch (err) {
    if (callerSignal?.aborted || !isAbortLikeError(err)) throw err;
    throw new Error('TCGdex request timed out');
  }
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
  const res = await fetchWithTimeout(url.toString(), fetchImpl, signal);
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
  const res = await fetchWithTimeout(url.toString(), fetchImpl, signal);
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
  const res = await fetchWithTimeout(`${TCGDEX_BASE}/${language}/cards/${cardId}`, fetchImpl, signal);
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

export interface TcgdexSetBrief {
  id: string;
  name: string;
}

export async function fetchSets(
  language: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TcgdexSetBrief[]> {
  const res = await fetchWithTimeout(`${TCGDEX_BASE}/${language}/sets`, fetchImpl, signal);
  if (!res.ok) {
    throw new Error(`TCGdex request failed with status ${res.status}`);
  }
  return res.json();
}

export function deriveSetId(cardId: string, localId: string): string {
  return cardId.slice(0, cardId.length - localId.length - 1);
}
