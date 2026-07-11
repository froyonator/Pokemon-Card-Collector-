import { describe, expect, it } from 'vitest';
import type { CardRecord } from './parseCardDetail';
import { validateCardRecord } from './validateCardRecord';

const validRecord: CardRecord = {
  cardId: '70354',
  name: 'Weedle',
  supertype: 'Pokémon',
  hp: 50,
  energyTypes: ['Grass'],
  stage: 'Basic',
  attacks: [],
  weakness: null,
  resistance: null,
  retreatCost: 1,
  expansionName: 'Shadowy Threats',
  expansionCode: 'SV10.5',
  expansionId: '11921',
  cardNumber: '001/164',
  rarity: 'Common',
  illustrators: [],
  pokedexNumber: 13,
  imageUrl: 'https://static.tcgcollector.com/content/images/card.webp',
};

describe('validateCardRecord', () => {
  it('accepts a structurally complete record from the requested card and set', () => {
    expect(validateCardRecord(validRecord, { cardId: '70354', setId: '11921' })).toEqual([]);
  });

  it('rejects an interstitial or wrong page before it can be written', () => {
    const invalidRecord: CardRecord = {
      ...validRecord,
      name: '',
      supertype: '',
      expansionName: '',
      expansionId: '99999',
      cardNumber: '',
      imageUrl: '',
    };

    expect(validateCardRecord(invalidRecord, { cardId: '70354', setId: '11921' })).toEqual([
      'name is missing',
      'supertype is missing',
      'expansion name is missing',
      'expansion id does not match the requested set',
      'card number is missing',
      'image URL is invalid',
    ]);
  });

  it('rejects malformed HP and mismatched card identity', () => {
    expect(
      validateCardRecord(
        { ...validRecord, cardId: 'other', hp: Number.NaN },
        { cardId: '70354', setId: '11921' }
      )
    ).toEqual(['card id does not match the requested card', 'hp is invalid']);
  });
});
