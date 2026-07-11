import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCardCache,
  getAllCachedRarities,
  getCachedCards,
  hasCachedDataForLanguage,
  isLatestWriteGeneration,
  reserveWriteGeneration,
  setCachedCards,
} from './cardCache';
import type { CardRecord } from '../types';

const sampleCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const promoCard: CardRecord = {
  id: 'svp-044',
  name: 'Charmander',
  dexNumber: 4,
  setId: 'svp',
  setName: 'SV Promos',
  localId: '044',
  rarity: 'Promo',
  imageBase: 'https://assets.tcgdex.net/en/svp/svp/044',
  language: 'en',
};

const commonCardJa: CardRecord = {
  id: 'sv2a-001',
  name: 'Charmander',
  dexNumber: 4,
  setId: 'sv2a',
  setName: '151',
  localId: '001',
  rarity: 'Common',
  imageBase: 'https://assets.tcgdex.net/ja/sv/sv2a/001',
  language: 'ja',
};

beforeEach(() => {
  localStorage.clear();
});

describe('card cache', () => {
  it('returns undefined for a dex number that has not been cached', () => {
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('falls back to undefined when the cached value is corrupted JSON', () => {
    localStorage.setItem('pcc:cardCache:v1', 'not valid json{');
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('round-trips a card list for a language and dex number', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('en', 6)).toEqual([sampleCard]);
  });

  it('keeps caches for different languages separate', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('ja', 6)).toBeUndefined();
  });

  it('clearCardCache empties the cache', () => {
    setCachedCards('en', 6, [sampleCard]);
    clearCardCache();
    expect(getCachedCards('en', 6)).toBeUndefined();
  });
});

describe('hasCachedDataForLanguage', () => {
  it('returns false when nothing has been cached for a language', () => {
    expect(hasCachedDataForLanguage('en')).toBe(false);
  });

  it('returns true once at least one dex number has been cached for that language', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(hasCachedDataForLanguage('en')).toBe(true);
    expect(hasCachedDataForLanguage('ja')).toBe(false);
  });
});

describe('in-memory parse caching (perf: avoid re-parsing the whole blob on every read)', () => {
  it('does not call JSON.parse for repeated reads once a value has been written through setCachedCards', () => {
    setCachedCards('en', 6, [sampleCard]);
    const parseSpy = vi.spyOn(JSON, 'parse');
    getCachedCards('en', 6);
    getCachedCards('en', 6);
    getCachedCards('en', 6);
    // setCachedCards' own writeJson call primes the in-memory cache with the
    // parsed value directly (it already had the object in hand -- no need
    // to round-trip through JSON.parse), so none of these three read-only
    // calls that follow, with no write in between, should re-parse.
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('parses freshly-seeded JSON exactly once across repeated reads, not once per call', () => {
    // A payload with a unique marker not written by any other test in this
    // file: the in-memory parse cache lives at module scope and isn't reset
    // between tests (only real localStorage is, via beforeEach), so a
    // coincidentally-identical JSON string left over from an earlier test
    // could otherwise make this look like a cache hit for a reason that has
    // nothing to do with the behavior under test.
    const uniqueCard: CardRecord = { ...sampleCard, id: 'unique-parse-cache-marker-card' };
    localStorage.setItem('pcc:cardCache:v1', JSON.stringify({ 'en:6': [uniqueCard] }));
    const parseSpy = vi.spyOn(JSON, 'parse');
    expect(getCachedCards('en', 6)).toEqual([uniqueCard]);
    expect(getCachedCards('en', 6)).toEqual([uniqueCard]);
    expect(getCachedCards('en', 6)).toEqual([uniqueCard]);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });

  it('a write immediately invalidates the cache so the very next read reflects it, not a stale parse (the perf fix must not reintroduce staleness)', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('en', 6)).toEqual([sampleCard]);

    setCachedCards('en', 6, [promoCard]);
    expect(getCachedCards('en', 6)).toEqual([promoCard]);

    // Also check a completely different key (dex 4) written afterward is
    // visible too, and that dex 6's value wasn't disturbed by it.
    setCachedCards('en', 4, [commonCardJa]);
    expect(getCachedCards('en', 4)).toEqual([commonCardJa]);
    expect(getCachedCards('en', 6)).toEqual([promoCard]);
  });

  it('re-parses when the underlying localStorage value changes via a direct write that bypasses this module entirely, not just through setCachedCards', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('en', 6)).toEqual([sampleCard]);

    // Simulate another code path (or a manual localStorage edit) writing
    // this same key directly, without going through writeJson.
    const raw = localStorage.getItem('pcc:cardCache:v1');
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    parsed['en:6'] = [promoCard];
    localStorage.setItem('pcc:cardCache:v1', JSON.stringify(parsed));

    expect(getCachedCards('en', 6)).toEqual([promoCard]);
  });

  it('reflects localStorage.clear() immediately rather than serving a stale in-memory parse', () => {
    setCachedCards('en', 6, [sampleCard]);
    expect(getCachedCards('en', 6)).toEqual([sampleCard]);

    localStorage.clear();

    expect(getCachedCards('en', 6)).toBeUndefined();
  });
});

describe('write-generation guard (coordinates loadAllCardData vs. loadAllPrintingsForDex racing on the same cache key)', () => {
  it('reserveWriteGeneration returns strictly increasing numbers for the same key', () => {
    const first = reserveWriteGeneration('en', 6);
    const second = reserveWriteGeneration('en', 6);
    const third = reserveWriteGeneration('en', 6);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('isLatestWriteGeneration is true for the most recently reserved generation and false for an older one', () => {
    const stale = reserveWriteGeneration('en', 6);
    const fresh = reserveWriteGeneration('en', 6);
    expect(isLatestWriteGeneration('en', 6, fresh)).toBe(true);
    expect(isLatestWriteGeneration('en', 6, stale)).toBe(false);
  });

  it('tracks generations independently per language+dexNumber key', () => {
    const dex6Gen = reserveWriteGeneration('en', 6);
    const dex4Gen = reserveWriteGeneration('en', 4);
    const jaDex6Gen = reserveWriteGeneration('ja', 6);
    expect(isLatestWriteGeneration('en', 6, dex6Gen)).toBe(true);
    expect(isLatestWriteGeneration('en', 4, dex4Gen)).toBe(true);
    expect(isLatestWriteGeneration('ja', 6, jaDex6Gen)).toBe(true);
    // A generation number reserved for one key must not be mistaken for the
    // latest on a different key just because the raw numbers coincide.
    expect(isLatestWriteGeneration('en', 4, dex6Gen)).toBe(false);
  });

  it('a key that has never reserved a generation is never considered the latest for any generation number, including 0', () => {
    expect(isLatestWriteGeneration('en', 999, 0)).toBe(false);
    expect(isLatestWriteGeneration('en', 999, 1)).toBe(false);
  });
});

describe('writeJson resilience (QuotaExceededError must not crash or fail silently)', () => {
  it('setCachedCards does not throw when localStorage.setItem fails, and logs the failure', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => setCachedCards('en', 6, [sampleCard])).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();

    setItemSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('getAllCachedRarities', () => {
  it('returns an empty array when nothing has been cached', () => {
    expect(getAllCachedRarities()).toEqual([]);
  });

  it('returns the deduplicated set of rarities across every language and dex number', () => {
    setCachedCards('en', 6, [sampleCard]);
    setCachedCards('en', 4, [promoCard, sampleCard]);
    setCachedCards('ja', 4, [commonCardJa]);

    const rarities = getAllCachedRarities();
    expect(new Set(rarities)).toEqual(
      new Set(['Special illustration rare', 'Promo', 'Common'])
    );
    expect(rarities).toHaveLength(3);
  });
});
