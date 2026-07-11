export const TCGDEX_API_BASE = 'https://api.tcgdex.net/v2';

export interface TcgdexSetBrief {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

export interface TcgdexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexSetDetail extends TcgdexSetBrief {
  cards: TcgdexCardBrief[];
  releaseDate?: string;
  serie?: { id: string; name: string };
}

export interface TcgdexCardDetail extends TcgdexCardBrief {
  set: { id: string; name: string };
  [key: string]: unknown;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry<T>(
  url: string,
  options: { fetchImpl?: typeof fetch; attempts?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = options.attempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 500;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (response.ok) return (await response.json()) as T;

      const error = new Error(`TCGdex request failed with HTTP ${response.status}: ${url}`);
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts) throw lastError;
    }
    await delay(retryDelayMs * attempt);
  }

  throw lastError ?? new Error(`TCGdex request failed: ${url}`);
}

export function tcgdexUrl(language: string, resource: 'sets' | 'cards', id?: string): string {
  const suffix = id ? `/${encodeURIComponent(id)}` : '';
  return `${TCGDEX_API_BASE}/${encodeURIComponent(language)}/${resource}${suffix}`;
}

export function validateTcgdexCard(
  card: TcgdexCardDetail,
  expected: { cardId: string; setId: string }
): string[] {
  const errors: string[] = [];
  if (card.id !== expected.cardId) errors.push('card id does not match the requested card');
  if (!card.localId) errors.push('local id is missing');
  if (!card.name) errors.push('name is missing');
  if (card.set?.id !== expected.setId) errors.push('set id does not match the requested set');
  if (card.image && !card.image.startsWith('https://assets.tcgdex.net/')) {
    errors.push('image base URL is not hosted by TCGdex assets');
  }
  return errors;
}

export function highResolutionImageUrl(imageBase: string): string {
  return `${imageBase}/high.webp`;
}

// snapshotTcgdex.ts uses `set.id`/`card.id` verbatim as filesystem path
// segments (`path.join(stagingRoot, language, set.id, card.id)`). Both ids
// come straight from TCGdex's JSON API response with no character-class
// validation elsewhere in this module -- `validateTcgdexCard` only checks
// equality against the requested id, which is no safety net since that
// expected value is itself taken from the same unsanitized response.
// `tcgdexUrl` above does `encodeURIComponent` the id, but only for the
// outbound HTTP request URL, never before the raw id reaches a local
// `path.join`. Every other scraper source in this codebase already
// constrains its equivalent identifier to a safe character class before
// using it as a path segment; this closes the same gap for TCGdex.
//
// Real TCGdex ids are mixed-case and contain periods (e.g. "sv03.5-001",
// "swsh4.5sv-SV018"), so the allow-list can't be the narrower `[a-z0-9-]+`
// used by the other sources. Letters/digits/dot/hyphen excludes `/`, `\`,
// and null bytes outright. It does NOT by itself exclude ".." (a dot-only
// id is still made up of allowed characters), and ".." as a single path
// segment walks up one directory when passed to `path.join` with no slash
// involved at all -- so a dot-only id is rejected explicitly as well.
const SAFE_ID_PATTERN = /^[A-Za-z0-9.-]+$/;
const DOT_ONLY_PATTERN = /^\.+$/;

export function isSafeTcgdexId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id) && !DOT_ONLY_PATTERN.test(id);
}

// TCGdex localizes the category field per language, not just the card name:
// fr/de/es/it/pt all render it as "Pokémon" (with the accent) rather than
// English's "Pokemon" -- confirmed live across all 15 supported languages,
// e.g. Trainer is "Dresseur" in French, "Allenatore" in Italian, "Trainer"
// (unchanged) in German, while Energy is "Énergie" in French. Checking only
// the unaccented spelling silently skipped 100% of cards in 5 languages.
const POKEMON_CATEGORY_SPELLINGS = new Set(['Pokemon', 'Pokémon']);

export function isPokemonCard(card: TcgdexCardDetail): boolean {
  return POKEMON_CATEGORY_SPELLINGS.has(String(card.category));
}
