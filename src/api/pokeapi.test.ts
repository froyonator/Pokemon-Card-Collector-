import { describe, expect, it } from 'vitest';
import { spriteUrl } from './pokeapi';

describe('spriteUrl', () => {
  it('builds the official artwork URL for a dex number', () => {
    expect(spriteUrl(6)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png'
    );
  });

  it('works for the last Gen 1 entry', () => {
    expect(spriteUrl(151)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/151.png'
    );
  });
});
