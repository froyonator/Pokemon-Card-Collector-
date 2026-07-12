// scripts/carddata/src/parseCardDetail.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCardDetail } from './parseCardDetail';

const pokemonFixtureHtml = readFileSync(
  fileURLToPath(new URL('./fixtures/card-detail-pokemon.html', import.meta.url)),
  'utf-8'
);

describe('parseCardDetail', () => {
  it("extracts a Pokemon card's full record from a real detail page", () => {
    const record = parseCardDetail(pokemonFixtureHtml, { cardId: '70354' });
    expect(record).toMatchObject({
      cardId: '70354',
      name: 'Weedle',
      supertype: 'Pokémon',
      hp: 50,
      stage: 'Basic',
      cardNumber: '001/164',
      expansionName: 'Shadowy Threats',
      expansionCode: 'MA5',
      rarity: 'Common (C)',
      illustrators: ['sowsow'],
      pokedexNumber: 13,
    });
    expect(record.attacks).toEqual([
      { name: 'Surprise Attack', damage: '30', description: 'Flip a coin. If tails, this attack does nothing.', cost: ['Grass'] },
    ]);
    expect(record.weakness).toEqual({ type: 'Fire', multiplier: '×2' });
    expect(record.resistance).toBeNull();
    expect(record.imageUrl).toMatch(/^https:\/\/static\.tcgcollector\.com\/.*\.webp$/);
  });

  it('picks the HIGHEST resolution image URL from the srcset, not the default (lowest) src', () => {
    const record = parseCardDetail(pokemonFixtureHtml, { cardId: '70354' });
    // The fixture's srcset includes a 320w, 640w, and 868w candidate --
    // this must pick the 868w one, not the plain `src` attribute (which is
    // the 320w default shown before srcset is considered).
    expect(record.imageUrl).toContain('6fbabb5298db92700e022b509530cf66c508cee07e909495dbc0b6a3e23cdfb6');
  });

  it('handles a Trainer/Energy card with no HP, attacks, weakness, or stage', () => {
    const trainerFixtureHtml = readFileSync(
      fileURLToPath(new URL('./fixtures/card-detail-trainer.html', import.meta.url)),
      'utf-8'
    );
    const record = parseCardDetail(trainerFixtureHtml, { cardId: '70517' });
    expect(record.hp).toBeNull();
    expect(record.attacks).toEqual([]);
    expect(record.weakness).toBeNull();
    expect(record.stage).toBeNull();
    expect(record.name).not.toBe('');
    expect(record.imageUrl).toMatch(/^https:\/\/static\.tcgcollector\.com\//);
  });
});
