// scripts/carddata/src/normalizeRarities.test.ts
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_RARITIES,
  type CardDatabase,
  deriveLocalizedRarityAliases,
  EUROPEAN_RARITY_DICTIONARIES,
  languageForFile,
  LOCALIZED_RARITY_ALIAS_CONFLICTS,
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

  // Real values copied verbatim from the primary source's own translation
  // dictionaries (data/bulk-export/meta/translations/<lang>.json's `rarity`
  // object), one representative per language plus the two ambiguous base
  // tiers that were the original bug report (53-93% of each European
  // language's records carried one of these).
  it('maps real fr dictionary values onto their canonical spelling', () => {
    expect(normalizeRarity('Commune')).toBe('Common');
    expect(normalizeRarity('Peu Commune')).toBe('Uncommon');
    expect(normalizeRarity('Magnifique rare')).toBe('Secret Rare');
    expect(normalizeRarity('Illustration spéciale rare')).toBe('Special illustration rare');
    expect(normalizeRarity('Sans Rareté')).toBe('None');
  });

  it('maps real de dictionary values onto their canonical spelling', () => {
    expect(normalizeRarity('Häufig')).toBe('Common');
    expect(normalizeRarity('Selten')).toBe('Rare');
    expect(normalizeRarity('Ungewöhnlich')).toBe('Uncommon');
    expect(normalizeRarity('Versteckt Selten')).toBe('Secret Rare');
    expect(normalizeRarity('Selten, Holografisch')).toBe('Rare Holo');
  });

  it('maps real es dictionary values onto their canonical spelling', () => {
    expect(normalizeRarity('Común')).toBe('Common');
    expect(normalizeRarity('Rara')).toBe('Rare');
    expect(normalizeRarity('Rara Ilustración Especial')).toBe('Special illustration rare');
    expect(normalizeRarity('Ninguno')).toBe('None');
  });

  it('maps real it dictionary values onto their canonical spelling', () => {
    expect(normalizeRarity('Comune')).toBe('Common');
    expect(normalizeRarity('Non comune')).toBe('Uncommon');
    expect(normalizeRarity('Rara illustrazione')).toBe('Illustration rare');
    expect(normalizeRarity('Nessuna')).toBe('None');
  });

  it('maps real pt dictionary values onto their canonical spelling', () => {
    expect(normalizeRarity('Comum')).toBe('Common');
    expect(normalizeRarity('Incomum')).toBe('Uncommon');
    expect(normalizeRarity('Ilustração Rara')).toBe('Illustration rare');
    // pt's own dictionary maps both "Rare Holo" and "Holo Rare" to this
    // same literal string; the derivation resolves it to "Rare Holo" (see
    // deriveLocalizedRarityAliases's own describe block below) but either
    // way it must land on a real canonical value, not Unknown.
    expect(normalizeRarity('Rara Holo')).not.toBe('Unknown');
  });

  it('still falls through European site-style codes to the existing alias table (de "S"/"SSR")', () => {
    // Confirmed present in de's actual harvested data alongside the
    // localized words above -- these are NOT in the dictionary at all, so
    // this exercises the "route anything the dictionary doesn't cover
    // through the existing RARITY_ALIASES fallback" path.
    expect(normalizeRarity('S')).toBe('Shiny rare');
    expect(normalizeRarity('SSR')).toBe('Special illustration rare');
  });
});

describe('EUROPEAN_RARITY_DICTIONARIES', () => {
  it('covers exactly fr/de/es/it/pt', () => {
    expect(Object.keys(EUROPEAN_RARITY_DICTIONARIES).sort()).toEqual(['de', 'es', 'fr', 'it', 'pt']);
  });
});

describe('deriveLocalizedRarityAliases', () => {
  it('inverts a small real fr excerpt into raw -> canonical', () => {
    const { aliases, conflicts } = deriveLocalizedRarityAliases({
      fr: { Common: 'Commune', Rare: 'Rare', Uncommon: 'Peu Commune' },
    });
    expect(aliases).toEqual({ Commune: 'Common', 'Peu Commune': 'Uncommon' });
    expect(conflicts).toEqual([]);
    // "Rare" -> "Rare" is already canonical as-is: no alias entry needed,
    // and normalizeRarity() would pass it through via CANONICAL_SET anyway.
    expect(aliases.Rare).toBeUndefined();
  });

  it('drops a dictionary entry whose canonical key this app does not track', () => {
    const { aliases } = deriveLocalizedRarityAliases({
      fr: { 'One Star': 'Une Étoile', Common: 'Commune' },
    });
    expect(aliases).toEqual({ Commune: 'Common' });
  });

  it('ignores an empty localized value', () => {
    const { aliases } = deriveLocalizedRarityAliases({ fr: { Common: '' } });
    expect(aliases).toEqual({});
  });

  it('resolves a real cross-language collision (pt "Rara Holo") to the first-seen language and reports the loser', () => {
    // Reproduces the actual pt dictionary bug: both keys map to the same
    // literal string. Object key order is language iteration order, so
    // "es" (declared before "pt" in EUROPEAN_RARITY_DICTIONARIES) wins here
    // when the two are combined the same way.
    const { aliases, conflicts } = deriveLocalizedRarityAliases({
      es: { 'Rare Holo': 'Rara Holo' },
      pt: { 'Holo Rare': 'Rara Holo' },
    });
    expect(aliases['Rara Holo']).toBe('Rare Holo');
    expect(conflicts).toEqual([
      { raw: 'Rara Holo', keptCanonical: 'Rare Holo', keptLanguage: 'es', droppedCanonical: 'Holo Rare', droppedLanguage: 'pt' },
    ]);
  });

  it('derives a non-empty, conflict-minimal alias table from the real EUROPEAN_RARITY_DICTIONARIES', () => {
    const { aliases, conflicts } = deriveLocalizedRarityAliases(EUROPEAN_RARITY_DICTIONARIES);
    expect(Object.keys(aliases).length).toBeGreaterThan(90);
    // The one known upstream inconsistency (pt's duplicate "Rara Holo"
    // target) is the only conflict the real dictionaries produce.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].raw).toBe('Rara Holo');
  });

  it('exports the derivation over the real dictionaries as LOCALIZED_RARITY_ALIAS_CONFLICTS for the CLI to surface', () => {
    expect(LOCALIZED_RARITY_ALIAS_CONFLICTS).toHaveLength(1);
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
