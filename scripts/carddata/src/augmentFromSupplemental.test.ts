import { describe, expect, it } from 'vitest';
import {
  dedupKey,
  mergeSupplemental,
  normalizeSetCode,
  supplementalToCards,
  type CardRecord,
} from './augmentFromSupplemental';

const baseRecord = {
  url: 'https://example.invalid/tw/card-search/detail/10795/',
  name: '烈咬陸鯊ex',
  img: 'https://example.invalid/tw/card-img/tw00010795.png',
  card_type: 'Pokémon',
  set_name: ' SVTG.png',
  set_full_name: '戰術牌組「太晶烈咬陸鯊ex」',
  number: '001',
  pokedex_number: '25',
};

function appCard(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id: 'SV2a-001',
    name: 'Bulbasaur',
    dexNumber: 1,
    setId: 'SV2a',
    setName: '寶可夢卡牌151',
    localId: '001',
    rarity: 'Common',
    imageBase: '',
    language: 'zh-tw',
    ...overrides,
  };
}

describe('normalizeSetCode', () => {
  it('strips the documented scrape artifacts: stray spaces, trailing image extensions, and a trailing F marker', () => {
    expect(normalizeSetCode(' SVTG.png')).toBe('SVTG');
    expect(normalizeSetCode('SV2a F')).toBe('SV2a');
    expect(normalizeSetCode('SV3 F')).toBe('SV3');
    expect(normalizeSetCode('SV11BF')).toBe('SV11BF'); // a real trailing F inside the code survives
    expect(normalizeSetCode('BW1-Bw')).toBe('BW1-Bw');
  });
});

describe('dedupKey', () => {
  it('collides the same card written with different casing and zero-padding', () => {
    expect(dedupKey('SV2a', '001')).toBe(dedupKey('SV2A', '1'));
  });

  it('does not collide different card numbers in the same set', () => {
    expect(dedupKey('SV2a', '001')).not.toBe(dedupKey('SV2a', '010'));
  });
});

describe('supplementalToCards', () => {
  it('maps a record onto the app CardRecord shape with official image URLs in the hosted fields', () => {
    const cards = supplementalToCards(baseRecord, 'zh-tw');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'two-10795',
      name: '烈咬陸鯊ex',
      dexNumber: 25,
      setId: 'SVTG',
      setName: '戰術牌組「太晶烈咬陸鯊ex」',
      localId: '001',
      rarity: 'Unknown',
      imageBase: '',
      language: 'zh-tw',
      hostedThumbUrl: 'https://example.invalid/tw/card-img/tw00010795.png',
      hostedFullUrl: 'https://example.invalid/tw/card-img/tw00010795.png',
    });
  });

  it('prefers the numeric jp_id over URL parsing for Japanese records', () => {
    const cards = supplementalToCards(
      { ...baseRecord, jp_id: 27173, url: 'https://example.invalid/details.php/card/27173' },
      'ja'
    );
    expect(cards[0].id).toBe('jpo-27173');
  });

  it('skips trainers, dex-less records, and records with no image', () => {
    expect(supplementalToCards({ ...baseRecord, card_type: 'Trainer' }, 'zh-tw')).toEqual([]);
    expect(supplementalToCards({ ...baseRecord, pokedex_number: '' }, 'zh-tw')).toEqual([]);
    expect(supplementalToCards({ ...baseRecord, img: undefined }, 'zh-tw')).toEqual([]);
  });

  it('drops out-of-range dex numbers while keeping in-range ones', () => {
    const cards = supplementalToCards({ ...baseRecord, pokedex_number: '445' }, 'zh-tw');
    expect(cards).toEqual([]);
    const mixed = supplementalToCards({ ...baseRecord, pokedex_number: '3, 445' }, 'zh-tw');
    expect(mixed.map((c) => c.dexNumber)).toEqual([3]);
  });
});

describe('mergeSupplemental', () => {
  it('adds only cards we do not already have, keyed by normalized set + number', () => {
    const existing: Record<string, CardRecord[]> = { 1: [appCard()] };
    const outcome = mergeSupplemental(existing, [
      // Same physical card as the existing one (different id scheme, padded
      // number) -- must be skipped.
      appCard({ id: 'two-1', setId: 'SV2A', localId: '1' }),
      // Genuinely new card.
      appCard({ id: 'two-2', dexNumber: 2, localId: '099' }),
    ]);
    expect(outcome.added).toBe(1);
    expect(outcome.skippedExisting).toBe(1);
    expect(existing[2]).toHaveLength(1);
    expect(existing[1]).toHaveLength(1);
  });

  it('dedupes repeated supplemental listings of the same card, first one winning', () => {
    const existing: Record<string, CardRecord[]> = {};
    const outcome = mergeSupplemental(existing, [
      appCard({ id: 'two-10', dexNumber: 5, localId: '007' }),
      appCard({ id: 'two-11', dexNumber: 5, localId: '7' }),
    ]);
    expect(outcome.added).toBe(1);
    expect(existing[5]).toHaveLength(1);
    expect(existing[5][0].id).toBe('two-10');
  });
});
