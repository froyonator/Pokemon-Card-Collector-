// scripts/carddata/src/normalizeRarities.test.ts
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_RARITIES,
  type CardDatabase,
  languageForFile,
  normalizeDatabaseRarities,
  normalizeRarity,
} from './normalizeRarities';

describe('normalizeRarity', () => {
  it('leaves an already-canonical value unchanged', () => {
    for (const canonical of CANONICAL_RARITIES) {
      expect(normalizeRarity(canonical)).toBe(canonical);
    }
  });

  it('maps single-letter base-tier codes onto the spelled-out canonical form', () => {
    expect(normalizeRarity('C')).toBe('Common');
    expect(normalizeRarity('U')).toBe('Uncommon');
    expect(normalizeRarity('R')).toBe('Rare');
  });

  it('maps the Chinese-exclusive Ponyta full art code (AR) onto the alt-art tier', () => {
    // This is the exact bug report: zh-cn's harvested rarity for the
    // Chinese-exclusive Ponyta full art is "AR", which matched no rarity
    // group before this normalization existed.
    expect(normalizeRarity('AR')).toBe('Illustration rare');
  });

  it('maps higher site-style tiers onto the closest existing special-art tier', () => {
    expect(normalizeRarity('SR')).toBe('Ultra Rare');
    expect(normalizeRarity('SAR')).toBe('Special illustration rare');
    expect(normalizeRarity('HR')).toBe('Hyper rare');
    expect(normalizeRarity('UR')).toBe('Secret Rare');
    expect(normalizeRarity('SSR')).toBe('Special illustration rare');
    expect(normalizeRarity('CHR')).toBe('Illustration rare');
    expect(normalizeRarity('CSR')).toBe('Special illustration rare');
    expect(normalizeRarity('RR')).toBe('Double rare');
    expect(normalizeRarity('RRR')).toBe('Ultra Rare');
  });

  it('maps Trainer Gallery codes onto the closest existing tier', () => {
    expect(normalizeRarity('TGH')).toBe('Illustration rare');
    expect(normalizeRarity('TGV')).toBe('Ultra Rare');
    expect(normalizeRarity('TGS')).toBe('Secret Rare');
  });

  it('maps promo/shiny/placeholder codes', () => {
    expect(normalizeRarity('PR')).toBe('Promo');
    expect(normalizeRarity('S')).toBe('Shiny rare');
    expect(normalizeRarity('-')).toBe('None');
  });

  it('maps "Gem <code>" legacy variants onto the same base tier as the un-prefixed code', () => {
    expect(normalizeRarity('Gem C')).toBe('Common');
    expect(normalizeRarity('Gem U')).toBe('Uncommon');
    expect(normalizeRarity('Gem R')).toBe('Rare');
    expect(normalizeRarity('Gem RR')).toBe('Double rare');
    expect(normalizeRarity('Gem RRR')).toBe('Ultra Rare');
  });

  it('fixes case-only variants onto the exact casing the app groups match against', () => {
    expect(normalizeRarity('Illustration Rare')).toBe('Illustration rare');
    expect(normalizeRarity('Special Illustration Rare')).toBe('Special illustration rare');
    expect(normalizeRarity('Shiny Rare')).toBe('Shiny rare');
    expect(normalizeRarity('Hyper Rare')).toBe('Hyper rare');
  });

  it('fixes word-order variants onto the canonical spelling', () => {
    expect(normalizeRarity('Rare Ultra')).toBe('Ultra Rare');
    expect(normalizeRarity('Rare Secret')).toBe('Secret Rare');
    expect(normalizeRarity('Rare Rainbow')).toBe('Secret Rare');
    expect(normalizeRarity('Rare Radiant')).toBe('Radiant Rare');
  });

  it('falls back to Unknown for a genuinely unrecognized code, without throwing', () => {
    expect(normalizeRarity('GGH')).toBe('Unknown');
    expect(normalizeRarity('GGU')).toBe('Unknown');
    expect(normalizeRarity('K')).toBe('Unknown');
    expect(normalizeRarity('totally-made-up')).toBe('Unknown');
  });

  it('treats null/undefined/empty/whitespace-only as Unknown', () => {
    expect(normalizeRarity(null)).toBe('Unknown');
    expect(normalizeRarity(undefined)).toBe('Unknown');
    expect(normalizeRarity('')).toBe('Unknown');
    expect(normalizeRarity('   ')).toBe('Unknown');
  });
});

function record(overrides: Partial<{ rarity: string; dexNumber: number; id: string }> = {}) {
  return {
    id: overrides.id ?? 'x',
    name: 'Ponyta',
    dexNumber: overrides.dexNumber ?? 77,
    setId: 'set1',
    setName: 'Set 1',
    localId: '001',
    rarity: overrides.rarity ?? 'C',
    imageBase: '',
    language: 'zh-cn',
  };
}

describe('normalizeDatabaseRarities', () => {
  it('normalizes every card in place and reports per-raw-value change counts', () => {
    const database: CardDatabase = {
      '77': [record({ id: 'a', rarity: 'AR' }), record({ id: 'b', rarity: 'AR' }), record({ id: 'c', rarity: 'Common' })],
    };
    const outcome = normalizeDatabaseRarities(database);

    expect(outcome.total).toBe(3);
    expect(outcome.changed).toBe(2);
    expect(database['77'][0].rarity).toBe('Illustration rare');
    expect(database['77'][1].rarity).toBe('Illustration rare');
    expect(database['77'][2].rarity).toBe('Common'); // already canonical, untouched

    expect(outcome.buckets).toEqual([{ rawRarity: 'AR', mappedTo: 'Illustration rare', count: 2, wasUnmapped: false }]);
  });

  it('reports an unmapped raw value with wasUnmapped=true and still normalizes it to Unknown', () => {
    const database: CardDatabase = { '77': [record({ id: 'a', rarity: 'GGH' })] };
    const outcome = normalizeDatabaseRarities(database);

    expect(database['77'][0].rarity).toBe('Unknown');
    expect(outcome.buckets).toEqual([{ rawRarity: 'GGH', mappedTo: 'Unknown', count: 1, wasUnmapped: true }]);
  });

  it('is idempotent: running it twice makes no further changes', () => {
    const database: CardDatabase = { '77': [record({ id: 'a', rarity: 'AR' })] };
    normalizeDatabaseRarities(database);
    const second = normalizeDatabaseRarities(database);
    expect(second.changed).toBe(0);
    expect(second.buckets).toEqual([]);
  });

  it('leaves an empty database untouched', () => {
    const database: CardDatabase = {};
    const outcome = normalizeDatabaseRarities(database);
    expect(outcome).toEqual({ total: 0, changed: 0, buckets: [] });
  });
});

describe('languageForFile', () => {
  it('derives the language from a Gen1 flat file', () => {
    expect(languageForFile('/cards', '/cards/zh-cn.json')).toBe('zh-cn');
  });

  it('derives the language from a per-generation file', () => {
    expect(languageForFile('/cards', '/cards/zh-cn/gen2.json')).toBe('zh-cn');
  });
});
