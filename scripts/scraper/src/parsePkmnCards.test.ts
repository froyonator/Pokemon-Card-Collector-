import { describe, expect, it } from 'vitest';
import {
  isPokemonCard,
  parsePkmnCardsDetail,
  parsePkmnCardsSetList,
  parsePkmnCardsSetPage,
  type PkmnCardsRecord,
} from './parsePkmnCards';

describe('PkmnCards parsers', () => {
  it('parses and deduplicates set and card URLs', () => {
    expect(
      parsePkmnCardsSetList(
        '<a href="/set/151/">151 (MEW)</a><a href="https://pkmncards.com/set/151/">duplicate</a>'
      )
    ).toEqual([
      { setSlug: '151', name: '151', code: 'MEW', url: 'https://pkmncards.com/set/151/' },
    ]);
    expect(
      parsePkmnCardsSetPage('<a href="https://pkmncards.com/card/pikachu-fut20-001/"><img></a>')
    ).toEqual([
      {
        cardSlug: 'pikachu-fut20-001',
        url: 'https://pkmncards.com/card/pikachu-fut20-001/',
      },
    ]);
  });

  it('parses the semantic structure used by a card detail page', () => {
    const html = `
      <article><a class="card-image-link" href="/image.png"><img class="card-image"></a>
      <div class="tab text"><div class="name-hp-color"><span class="name">Pikachu on the Ball</span><span class="hp">60 HP</span><span class="color"><abbr title="Lightning"></abbr></span></div>
      <div class="type-evolves-is"><span class="type">Pokémon</span><span class="pokemon">Pikachu</span><span class="stage">Basic</span></div>
      <div class="text"><p><abbr class="ptcg-symbol-name" title="Lightning"></abbr><span>Lightning Shot</span> : 120<br>Flip a coin.</p></div></div>
      <div class="weak-resist-retreat"><span class="weak"><abbr class="ptcg-symbol-name" title="Fighting"></abbr><span title="Weakness Modifier">×2</span></span><span class="retreat"><abbr title="{C}">1</abbr></span></div>
      <div class="illus"><a title="Illustrator">The Pokémon Company Art Team</a></div>
      <div class="release-meta"><span title="Set"><a>Pokémon Futsal Promos 2020</a></span><span title="Set Abbreviation">FUT20</span><span class="number"><a title="Number">001</a></span><span class="out-of" title="Out Of">/005</span><span class="rarity"><abbr title="No Rarity"></abbr></span><span class="date">↘ Sep 11, 2020</span></div></article>`;
    const record = parsePkmnCardsDetail(html, 'https://pkmncards.com/card/pikachu-fut20-001/');
    expect(record).toMatchObject({
      sourceCardSlug: 'pikachu-fut20-001',
      name: 'Pikachu on the Ball',
      hp: 60,
      energyTypes: ['Lightning'],
      stage: 'Basic',
      pokemon: ['Pikachu'],
      expansionCode: 'FUT20',
      cardNumber: '001',
      printedTotal: '005',
      retreatCost: 1,
      rarity: 'No Rarity',
      illustrators: ['The Pokémon Company Art Team'],
      imageUrl: 'https://pkmncards.com/image.png',
    });
    expect(record.attacks[0]).toEqual({
      name: 'Lightning Shot',
      damage: '120',
      description: 'Flip a coin.',
      cost: ['Lightning'],
    });
  });

  it('identifies Pokémon cards by supertype, excluding Trainer and Energy cards', () => {
    expect(isPokemonCard({ supertype: 'Pokémon' } as PkmnCardsRecord)).toBe(true);
    expect(isPokemonCard({ supertype: 'Trainer' } as PkmnCardsRecord)).toBe(false);
    expect(isPokemonCard({ supertype: 'Energy' } as PkmnCardsRecord)).toBe(false);
  });
});
