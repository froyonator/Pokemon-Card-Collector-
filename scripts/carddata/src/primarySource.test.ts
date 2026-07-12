import { describe, expect, it, vi } from 'vitest';
import {
  fetchJsonWithRetry,
  highResolutionImageUrl,
  isPokemonCard,
  isSafePrimarySourceId,
  primarySourceUrl,
  validatePrimarySourceCard,
  type PrimarySourceCardDetail,
} from './primarySource';

const card: PrimarySourceCardDetail = {
  id: 'sv03.5-001',
  localId: '001',
  name: 'Bulbasaur',
  image: 'https://assets.tcgdex.net/en/sv/sv03.5/001',
  set: { id: 'sv03.5', name: '151' },
};

describe('primary source adapter', () => {
  it('builds encoded API and high-resolution image URLs', () => {
    expect(primarySourceUrl('zh-tw', 'sets', 'sv03.5')).toBe(
      'https://api.tcgdex.net/v2/zh-tw/sets/sv03.5'
    );
    expect(highResolutionImageUrl(card.image!)).toBe(
      'https://assets.tcgdex.net/en/sv/sv03.5/001/high.webp'
    );
  });

  it('validates card, set, and paired image identity', () => {
    expect(validatePrimarySourceCard(card, { cardId: card.id, setId: 'sv03.5' })).toEqual([]);
    expect(
      validatePrimarySourceCard(
        {
          ...card,
          id: 'wrong',
          set: { id: 'wrong', name: 'Wrong' },
          image: 'https://example.com/x',
        },
        { cardId: card.id, setId: 'sv03.5' }
      )
    ).toEqual([
      'card id does not match the requested card',
      'set id does not match the requested set',
      'image base URL is not hosted by the primary source assets host',
    ]);
  });

  it('allows metadata-only cards while still validating any supplied image host', () => {
    expect(
      validatePrimarySourceCard({ ...card, image: undefined }, { cardId: card.id, setId: 'sv03.5' })
    ).toEqual([]);
  });

  it('identifies Pokemon cards by category, excluding Trainer and Energy', () => {
    expect(isPokemonCard({ ...card, category: 'Pokemon' })).toBe(true);
    expect(isPokemonCard({ ...card, category: 'Trainer' })).toBe(false);
    expect(isPokemonCard({ ...card, category: 'Energy' })).toBe(false);
  });

  it('recognizes the accented "Pokémon" spelling used by fr/de/es/it/pt, and their own localized Trainer/Energy names', () => {
    expect(isPokemonCard({ ...card, category: 'Pokémon' })).toBe(true);
    expect(isPokemonCard({ ...card, category: 'Dresseur' })).toBe(false);
    expect(isPokemonCard({ ...card, category: 'Allenatore' })).toBe(false);
    expect(isPokemonCard({ ...card, category: 'Énergie' })).toBe(false);
  });

  it('accepts real observed primary-source id formats, including mixed case and periods', () => {
    expect(isSafePrimarySourceId('sv03.5-001')).toBe(true);
    expect(isSafePrimarySourceId('sv03.5')).toBe(true);
    expect(isSafePrimarySourceId('swsh4.5sv-SV018')).toBe(true);
    expect(isSafePrimarySourceId('SC2b-001')).toBe(true);
  });

  it('rejects a path-traversal id before it could ever reach path.join', () => {
    expect(isSafePrimarySourceId('../../evil')).toBe(false);
    expect(isSafePrimarySourceId('..\\..\\evil')).toBe(false);
    // No slashes at all, but ".." alone as a single path segment still walks
    // up one directory when passed to path.join -- the character-class check
    // alone would let this through since dots and hyphens are both allowed
    // in real ids (e.g. "sv03.5-001"), so it needs its own explicit check.
    expect(isSafePrimarySourceId('..')).toBe(false);
    expect(isSafePrimarySourceId('.')).toBe(false);
    expect(isSafePrimarySourceId('a/b')).toBe(false);
    expect(isSafePrimarySourceId('a\0b')).toBe(false);
    expect(isSafePrimarySourceId('')).toBe(false);
  });

  it('retries transient HTTP failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(
      fetchJsonWithRetry<{ ok: boolean }>('https://example.test/data', {
        fetchImpl: fetchMock as unknown as typeof fetch,
        retryDelayMs: 0,
      })
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
