import { describe, expect, it } from 'vitest';
import { buildTcgplayerSearchUrl } from './tcgplayerSearch';

describe('buildTcgplayerSearchUrl', () => {
  it('builds a TCGplayer product-search URL from the card name, its own local id, and set name', () => {
    const url = buildTcgplayerSearchUrl({
      name: 'Charmander',
      localId: '044',
      setName: 'SVP Black Star Promos',
    });
    expect(url).toBe(
      `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
        'Charmander 044 SVP Black Star Promos'
      )}`
    );
  });

  it('URL-encodes special characters in the query', () => {
    const url = buildTcgplayerSearchUrl({
      name: "Farfetch'd",
      localId: '083',
      setName: 'Base Set & Jungle',
    });
    expect(url).toBe(
      `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
        "Farfetch'd 083 Base Set & Jungle"
      )}`
    );
  });

  // The whole point of using localId here is that it's the card's position
  // within its OWN set (e.g. "004"), not the Pokemon's national dex number
  // (e.g. Charmander is dex #4) -- those are different numbers that happen
  // to collide in this fixture, so the assertion checks the actual query
  // string shape rather than just presence of a digit.
  it('uses the local id field, not any other numeric identifier', () => {
    const url = buildTcgplayerSearchUrl({ name: 'Charmander', localId: '004', setName: 'Base' });
    expect(url).toBe(
      `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent('Charmander 004 Base')}`
    );
  });
});
