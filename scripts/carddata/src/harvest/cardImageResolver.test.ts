// scripts/carddata/src/harvest/cardImageResolver.test.ts
import { describe, expect, it, vi } from 'vitest';
import { guessCardImageFilename, resolveCardImages, toFileTitle } from './cardImageResolver';
import type { WikiImageInfo } from './types';

describe('toFileTitle', () => {
  it('prefixes a bare filename with the File: namespace', () => {
    expect(toFileTitle('PikachuexSurgingSparks57.jpg')).toBe('File:PikachuexSurgingSparks57.jpg');
  });

  it('leaves an already-prefixed title untouched', () => {
    expect(toFileTitle('File:PikachuexSurgingSparks57.jpg')).toBe('File:PikachuexSurgingSparks57.jpg');
  });
});

describe('guessCardImageFilename', () => {
  it('matches the real observed PascalCase-concatenated naming convention', () => {
    // Real filename confirmed live for Pikachu ex, Surging Sparks #57.
    expect(
      guessCardImageFilename({ cardName: 'Pikachu ex', setName: 'Surging Sparks', cardNumber: '057/191' })
    ).toBe('PikachuexSurgingSparks57.jpg');
  });

  it('strips leading zeros from the card number but keeps significant digits', () => {
    expect(
      guessCardImageFilename({ cardName: 'Exeggcute', setName: 'Surging Sparks', cardNumber: '001/191' })
    ).toBe('ExeggcuteSurgingSparks1.jpg');
  });

  it('supports a png extension override', () => {
    expect(
      guessCardImageFilename({
        cardName: 'Caterpie',
        setName: 'Battle Partners',
        cardNumber: '001/100',
        extension: 'png',
      })
    ).toBe('CaterpieBattlePartners1.png');
  });
});

describe('resolveCardImages', () => {
  it('prefixes bare filenames with File: before delegating to the client', async () => {
    const queryImageInfo = vi.fn(async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        map.set(title, { fileTitle: title, url: `https://example.invalid/${title}`, missing: false });
      }
      return map;
    });

    const result = await resolveCardImages({ queryImageInfo }, ['PikachuexSurgingSparks57.jpg']);

    expect(queryImageInfo).toHaveBeenCalledWith(['File:PikachuexSurgingSparks57.jpg']);
    expect(result.get('File:PikachuexSurgingSparks57.jpg')?.url).toBe(
      'https://example.invalid/File:PikachuexSurgingSparks57.jpg'
    );
  });
});
