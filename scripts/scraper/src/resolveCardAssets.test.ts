import { describe, expect, it } from 'vitest';
import { resolveCardAssets, type FallbackAssetIndexes } from './resolveCardAssets';
import type { CardRecord } from './buildStaticDatabase';
import type { ArtofpkmIndex, PkmnCardsIndex } from './crossValidateStaticDatabase';
import type { PkmnCardsRecord } from './parsePkmnCards';
import type { ArtOfPkmRecord } from './parseArtOfPkm';

const baseCard: CardRecord = {
  id: 'me01-001',
  name: 'Bulbasaur',
  dexNumber: 1,
  setId: 'me01',
  setName: 'Base Set',
  localId: '1',
  rarity: 'Common',
  imageBase: '',
  language: 'en',
};

const basePkmRecord: PkmnCardsRecord = {
  sourceCardSlug: 'bulbasaur-base-set-1',
  name: 'Bulbasaur',
  supertype: 'Pokémon',
  hp: 40,
  energyTypes: ['Grass'],
  stage: 'Basic',
  pokemon: ['Bulbasaur'],
  attacks: [],
  weakness: null,
  resistance: null,
  retreatCost: 1,
  expansionName: 'Base Set',
  expansionCode: 'BS',
  cardNumber: '1',
  printedTotal: '102',
  rarity: 'Common',
  illustrators: [],
  releaseDate: null,
  imageUrl: 'https://example.invalid/bulbasaur.jpg',
};

function englishIndex(record: (PkmnCardsRecord & { imageFile?: string }) | null): FallbackAssetIndexes['english'] {
  const matchIndex: PkmnCardsIndex = {
    bySetAndLocal: new Map([
      ['base set', new Map(record ? [['1', [record]]] : [])],
    ]),
    setKeys: new Set(['base set']),
  };
  return {
    matchIndex,
    setSlugByCardSlug: record ? new Map([[record.sourceCardSlug, 'base-set']]) : new Map(),
  };
}

const baseArtRecord: ArtOfPkmRecord = {
  sourceCardId: '11',
  name: 'Metapod',
  japaneseName: 'トランセル',
  expansionId: '10',
  expansionName: '151',
  japaneseExpansionName: 'ポケモンカード151',
  cardNumber: '011/151',
  illustrators: [],
  pokedexNumbers: [],
  imageUrl: 'https://example.invalid/metapod.png',
};

function japaneseIndex(record: (ArtOfPkmRecord & { imageFile?: string }) | null): FallbackAssetIndexes['japanese'] {
  const matchIndex: ArtofpkmIndex = {
    bySet: new Map([['ポケモンカード151', record ? [record] : []]]),
    setKeys: new Set(['ポケモンカード151']),
  };
  return { matchIndex };
}

describe('resolveCardAssets', () => {
  it('uses the primary source hosted image as-is when the card already has its own image, without consulting any fallback index', () => {
    const card: CardRecord = { ...baseCard, imageBase: 'https://assets.example/en/me01/001' };
    // Deliberately no fallbackIndexes provided at all -- a lookup here would throw.
    const resolved = resolveCardAssets(card, {});
    expect(resolved).toEqual({
      thumbUrl: 'https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/en/me01/me01-001/thumb.webp',
      fullUrl: 'https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/en/me01/me01-001/original.webp',
    });
  });

  it('falls back to the English fallback source hosted image when the primary source has none and a fuzzy match is found', () => {
    const record = { ...basePkmRecord, imageFile: 'image.png' };
    const fallbackIndexes: FallbackAssetIndexes = { english: englishIndex(record) };
    const resolved = resolveCardAssets(baseCard, fallbackIndexes);
    expect(resolved).toEqual({
      thumbUrl:
        'https://raw.githubusercontent.com/froyonator/pcc-assets-b/main/en/base-set/bulbasaur-base-set-1/thumb.webp',
      fullUrl:
        'https://raw.githubusercontent.com/froyonator/pcc-assets-b/main/en/base-set/bulbasaur-base-set-1/original.png',
    });
  });

  it('leaves both URLs undefined when the primary source has no image and no fallback match is found', () => {
    const noMatchCard: CardRecord = { ...baseCard, setName: 'Some Unrelated Set', localId: '99' };
    const fallbackIndexes: FallbackAssetIndexes = { english: englishIndex(basePkmRecord) };
    const resolved = resolveCardAssets(noMatchCard, fallbackIndexes);
    expect(resolved).toEqual({});
  });

  it('overrides a Japanese card name that looks like an untranslated English placeholder when the fallback match has a plausible native-language name', () => {
    const card: CardRecord = {
      ...baseCard,
      id: 'me01-011',
      name: 'Metapod', // untranslated English left in the "Japanese" name field
      setName: 'ポケモンカード151',
      localId: '11',
      language: 'ja',
      imageBase: 'https://assets.example/ja/me01/011', // primary already has its own image
    };
    const fallbackIndexes: FallbackAssetIndexes = { japanese: japaneseIndex(baseArtRecord) };
    const resolved = resolveCardAssets(card, fallbackIndexes);
    expect(resolved.resolvedName).toBe('トランセル');
    // Image resolution is untouched by the name override -- primary already had its own image.
    expect(resolved.thumbUrl).toBe(
      'https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/ja/me01/me01-011/thumb.webp'
    );
  });

  it('does not override the name when the primary source name already looks like genuine Japanese text', () => {
    const card: CardRecord = {
      ...baseCard,
      id: 'me01-011',
      name: 'トランセル', // already a plausible Japanese name, no Latin letters
      setName: 'ポケモンカード151',
      localId: '11',
      language: 'ja',
    };
    const fallbackIndexes: FallbackAssetIndexes = { japanese: japaneseIndex(baseArtRecord) };
    const resolved = resolveCardAssets(card, fallbackIndexes);
    expect(resolved.resolvedName).toBeUndefined();
  });

  it('does not override the name when a fallback match exists but its own name is also an untranslated placeholder', () => {
    const card: CardRecord = {
      ...baseCard,
      id: 'me01-011',
      name: 'Metapod',
      setName: 'ポケモンカード151',
      localId: '11',
      language: 'ja',
    };
    const implausibleArtRecord: ArtOfPkmRecord = { ...baseArtRecord, japaneseName: 'Metapod' };
    const fallbackIndexes: FallbackAssetIndexes = { japanese: japaneseIndex(implausibleArtRecord) };
    const resolved = resolveCardAssets(card, fallbackIndexes);
    expect(resolved.resolvedName).toBeUndefined();
  });

  it('falls back to the Japanese fallback source hosted image when the primary source has none, using the record\'s own extension', () => {
    const card: CardRecord = {
      ...baseCard,
      id: 'me01-011',
      name: 'Metapod',
      setName: 'ポケモンカード151',
      localId: '11',
      language: 'ja',
      imageBase: '',
    };
    const record = { ...baseArtRecord, imageFile: 'image.png' };
    const fallbackIndexes: FallbackAssetIndexes = { japanese: japaneseIndex(record) };
    const resolved = resolveCardAssets(card, fallbackIndexes);
    expect(resolved.thumbUrl).toBe(
      'https://raw.githubusercontent.com/froyonator/pcc-assets-c/main/ja/10/11/thumb.webp'
    );
    expect(resolved.fullUrl).toBe(
      'https://raw.githubusercontent.com/froyonator/pcc-assets-c/main/ja/10/11/original.png'
    );
  });

  it('leaves assets and name untouched for a language neither fallback source covers, even with no primary image', () => {
    const card: CardRecord = { ...baseCard, language: 'fr', imageBase: '' };
    const resolved = resolveCardAssets(card, {
      english: englishIndex(basePkmRecord),
      japanese: japaneseIndex(baseArtRecord),
    });
    expect(resolved).toEqual({});
  });
});
