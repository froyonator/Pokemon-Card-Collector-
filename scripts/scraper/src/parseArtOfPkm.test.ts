import { describe, expect, it } from 'vitest';
import {
  isPokemonCard,
  parseArtOfPkmDetail,
  parseArtOfPkmSetList,
  parseArtOfPkmSetPage,
  type ArtOfPkmRecord,
} from './parseArtOfPkm';

describe('Art of Pokémon parsers', () => {
  it('parses set and card source identities', () => {
    expect(parseArtOfPkmSetList('<a class="set" href="/sets/594">Premium Deck</a>')).toEqual([
      { setId: '594', name: 'Premium Deck', url: 'https://www.artofpkm.com/sets/594' },
    ]);
    expect(
      parseArtOfPkmSetPage(
        '<div id="cards-container"><a data-lightbox-url="/sets/594/card/1" data-lightbox-title="Cherubi, Premium Deck"></a></div>',
        '594'
      )
    ).toEqual([
      { sourceCardId: '1', name: 'Cherubi', url: 'https://www.artofpkm.com/sets/594/card/1' },
    ]);
  });

  it('dedupes multiple thumbnails that share the same sourceCardId, keeping only the first', () => {
    // Real-world case confirmed live on set 458 ("Starter Set VSTAR, Lucario"
    // -- a multi-product bundle page): the site reuses the identical
    // /sets/458/card/3 lightbox URL for three genuinely different cards
    // (Scyther, Meditite, Lucario V), distinguished only by a client-side
    // lightbox modal, not a real distinct URL. Fetching that one URL always
    // returns the same detail page regardless of which thumbnail linked to
    // it, so keeping all three just meant re-fetching the identical page
    // twice more and failing to write the same card directory a second and
    // third time (EEXIST). The other two cards aren't reachable through this
    // site's public URL scheme at all -- deduping stops the wasted
    // duplicate-fetch/error noise, it can't recover them.
    const html = `<div id="cards-container">
      <a data-lightbox-url="/sets/458/card/3" data-lightbox-title="Scyther, Starter Set VSTAR, Lucario"></a>
      <a data-lightbox-url="/sets/458/card/3" data-lightbox-title="Meditite, Starter Set VSTAR, Lucario"></a>
      <a data-lightbox-url="/sets/458/card/3" data-lightbox-title="Lucario V, Starter Set VSTAR, Lucario"></a>
      <a data-lightbox-url="/sets/458/card/4" data-lightbox-title="Riolu, Starter Set VSTAR, Lucario"></a>
    </div>`;
    expect(parseArtOfPkmSetPage(html, '458')).toEqual([
      { sourceCardId: '3', name: 'Scyther', url: 'https://www.artofpkm.com/sets/458/card/3' },
      { sourceCardId: '4', name: 'Riolu', url: 'https://www.artofpkm.com/sets/458/card/4' },
    ]);
  });

  it('parses Japanese card identity and its image from one detail page', () => {
    const html = `<main><a href="/sets/594"><div class="font-bold">Premium Deck</div><div class="ja">プレミアムデッキ</div></a>
      <div><img data-card-image-loader-target="image" src="/card.png">
      <div class="flex flex-col gap-1">
        <div class="flex gap-2"><div class="italic">002/040</div></div>
        <div class="flex flex-wrap gap-x-2 items-baseline"><h1>Cherubi</h1><h3 class="ja">チェリンボ</h3></div>
      </div>
      <a href="/illustrators/41">Kurata So</a><a href="/pokemon/420"></a></div></main>`;
    expect(parseArtOfPkmDetail(html, 'https://www.artofpkm.com/sets/594/card/1')).toEqual({
      sourceCardId: '1',
      name: 'Cherubi',
      japaneseName: 'チェリンボ',
      expansionId: '594',
      expansionName: 'Premium Deck',
      japaneseExpansionName: 'プレミアムデッキ',
      cardNumber: '002/040',
      illustrators: ['Kurata So'],
      pokedexNumbers: [420],
      imageUrl: 'https://www.artofpkm.com/card.png',
    });
  });

  it('preserves source identity for an unnumbered card', () => {
    const html = `<main><a href="/sets/592"><div class="font-bold">Celebration</div></a>
      <div><img data-card-image-loader-target="image" src="/energy.png">
      <div class="flex flex-col gap-1">
        <div class="flex gap-2"><div class="italic"></div></div>
        <div class="flex flex-wrap gap-x-2 items-baseline"><h1>Basic Grass Energy</h1><h3 class="ja">基本草エネルギー</h3></div>
      </div></div></main>`;
    expect(parseArtOfPkmDetail(html, 'https://www.artofpkm.com/sets/592/card/19')).toMatchObject({
      sourceCardId: '19',
      cardNumber: '',
      name: 'Basic Grass Energy',
    });
  });

  it('falls back to the Japanese name when a card has no official English name', () => {
    // Real-world case: Trainer/Item cards like "おいしいおむすび" (Delicious
    // Onigiri) render with no `h1` at all -- just the `h3.ja` -- since the
    // site has no English localization for them. cardNumber and
    // japaneseName must still resolve since they're no longer derived by
    // walking outward from `h1`.
    const html = `<main><a href="/sets/595"><div class="font-bold">Storm Emeralda</div><div class="ja">ストームエメラルダ</div></a>
      <div><img data-card-image-loader-target="image" src="/onigiri.png">
      <div class="flex flex-col gap-1">
        <div class="flex gap-2"><div class="italic">063/076</div></div>
        <div class="flex flex-wrap gap-x-2 items-baseline"><h3 class="ja">おいしいおむすび</h3></div>
      </div>
      <a href="/illustrators/129">AYUMI ODASHIMA</a></div></main>`;
    expect(parseArtOfPkmDetail(html, 'https://www.artofpkm.com/sets/595/card/11')).toMatchObject({
      sourceCardId: '11',
      name: '',
      japaneseName: 'おいしいおむすび',
      cardNumber: '063/076',
      illustrators: ['AYUMI ODASHIMA'],
    });
  });

  it('identifies a Pokemon card by the presence of pokedexNumbers', () => {
    const baseRecord: ArtOfPkmRecord = {
      sourceCardId: '1',
      name: 'Cherubi',
      japaneseName: 'チェリンボ',
      expansionId: '594',
      expansionName: 'Premium Deck',
      japaneseExpansionName: 'プレミアムデッキ',
      cardNumber: '002/040',
      illustrators: ['Kurata So'],
      pokedexNumbers: [420],
      imageUrl: 'https://www.artofpkm.com/card.png',
    };
    // Cherubi, from the first detail test above: a genuine Pokemon card
    // links to its own Pokedex entry.
    expect(isPokemonCard(baseRecord)).toBe(true);
    // おいしいおむすび (Delicious Onigiri), from the fallback test above: a
    // Trainer/Item card links to no Pokedex entry at all.
    expect(isPokemonCard({ ...baseRecord, pokedexNumbers: [] })).toBe(false);
  });
});
