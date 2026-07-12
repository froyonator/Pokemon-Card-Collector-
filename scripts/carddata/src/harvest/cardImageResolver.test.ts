// scripts/carddata/src/harvest/cardImageResolver.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  guessCardImageFilename,
  parseCardArticleDisambiguator,
  parseCardInfoboxImageFilename,
  resolveCardImages,
  toFileTitle,
} from './cardImageResolver';
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

describe('parseCardArticleDisambiguator', () => {
  it('splits a normal title into card name, set name, and number', () => {
    expect(parseCardArticleDisambiguator('Pikachu ex (Surging Sparks 57)')).toEqual({
      cardName: 'Pikachu ex',
      setName: 'Surging Sparks',
      number: '57',
    });
  });

  it('derives the origin set from a reprint row title, not the promo product it was listed under', () => {
    // Real evidence: this row lives in the "Trick or Trade 2022" promo set
    // list, but its own article title -- and therefore its real scan
    // filename -- belongs to Battle Styles.
    expect(parseCardArticleDisambiguator('Cubone (Battle Styles 69)')).toEqual({
      cardName: 'Cubone',
      setName: 'Battle Styles',
      number: '69',
    });
  });

  it('returns null for a bare literal title with no parenthetical', () => {
    expect(parseCardArticleDisambiguator('Pikachu')).toBeNull();
  });

  it('returns null for a parenthetical with no set/number split (a single word)', () => {
    expect(parseCardArticleDisambiguator('Ditto (Promo)')).toBeNull();
  });
});

describe('parseCardInfoboxImageFilename', () => {
  it('reads the bare image= field when there is no per-printing breakdown', () => {
    const wikitext = '{{PokémoncardInfobox|cardname=Cubone|image=CuboneBattleStyles69.jpg|caption=Cubone}}';
    expect(parseCardInfoboxImageFilename(wikitext, ['Battle Styles'])).toBe('CuboneBattleStyles69.jpg');
  });

  it('unwraps a [[File:...]]-style image value down to a bare filename', () => {
    const wikitext = '{{PokémoncardInfobox|cardname=Cubone|image=[[File:CuboneBattleStyles69.jpg|thumb]]}}';
    expect(parseCardInfoboxImageFilename(wikitext, ['Battle Styles'])).toBe('CuboneBattleStyles69.jpg');
  });

  it('prefers the numbered reprint field whose recaption companion names a target set (the real, confirmed field-naming convention)', () => {
    // Real evidence: Pikachu's shared article -- image=/caption= for the
    // FIRST-listed (Paldea Evolved) printing, reprint1=/recaption1= for a
    // Paldean Fates reprint, reprint2=/recaption2= for an SVP promo.
    const wikitext =
      '{{PokémoncardInfobox|cardname=Pikachu' +
      '|image=PikachuPaldeaEvolved62.jpg|caption={{TCG|Paldea Evolved}} print' +
      '|reprints=2' +
      '|reprint1=PikachuPaldeanFates131.jpg|recaption1={{TCG|Paldean Fates}} print' +
      '|reprint2=PikachuSVPPromo88.jpg|recaption2={{TCG|SVP Black Star Promos|SVP Promotional}} print}}';
    expect(parseCardInfoboxImageFilename(wikitext, ['Paldean Fates'])).toBe('PikachuPaldeanFates131.jpg');
    expect(parseCardInfoboxImageFilename(wikitext, ['SVP Black Star Promos'])).toBe('PikachuSVPPromo88.jpg');
  });

  it('also matches a set1=/image1=-style companion field, for robustness against a differently-named article', () => {
    const wikitext =
      '{{PokémoncardInfobox|cardname=Pikachu|image=PikachuPromo1.jpg' +
      '|set1=Battle Styles|image1=PikachuBattleStyles49.jpg' +
      '|set2=Evolving Skies|image2=PikachuEvolvingSkies49.jpg}}';
    expect(parseCardInfoboxImageFilename(wikitext, ['Evolving Skies'])).toBe('PikachuEvolvingSkies49.jpg');
  });

  it('falls back to the bare image= field when no numbered field matches a target set name', () => {
    const wikitext =
      '{{PokémoncardInfobox|cardname=Pikachu|image=PikachuPromo1.jpg' +
      '|set1=Battle Styles|image1=PikachuBattleStyles49.jpg}}';
    expect(parseCardInfoboxImageFilename(wikitext, ['Some Other Set'])).toBe('PikachuPromo1.jpg');
  });

  it('returns null when the wikitext has no infobox template at all', () => {
    expect(parseCardInfoboxImageFilename('Just some prose, no template here.', ['Battle Styles'])).toBeNull();
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
