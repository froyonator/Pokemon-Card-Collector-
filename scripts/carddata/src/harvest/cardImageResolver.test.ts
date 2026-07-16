// scripts/carddata/src/harvest/cardImageResolver.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  guessCardImageFilename,
  isCardShapedImage,
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

  describe('degenerate-guess guard (regression: bare "11.jpg" colliding with an unrelated merchandise photo)', () => {
    // Real evidence: clean() strips every non-ASCII-alphanumeric character,
    // so a card name and set name written entirely in katakana/hanzi both
    // clean to the empty string, and the guess degenerates to a bare
    // "11.jpg" -- which the reference wiki really hosts as an unrelated
    // merchandise photo. A guess missing any of its three identity
    // components carries no evidence tying it to this specific card, so it
    // must never be attempted.
    it('returns null when the card name is entirely non-ASCII (both name and set name vanish)', () => {
      expect(
        guessCardImageFilename({ cardName: 'スキプルーム', setName: '地図にない町', cardNumber: '011' })
      ).toBeNull();
    });

    it('returns null when only the set name cleans to empty (Latin card name, non-Latin set name)', () => {
      expect(
        guessCardImageFilename({ cardName: 'Skiploom', setName: '地図にない町', cardNumber: '011' })
      ).toBeNull();
    });

    it('returns null when only the card name cleans to empty (non-Latin card name, Latin set name)', () => {
      expect(
        guessCardImageFilename({ cardName: 'スキプルーム', setName: 'Uncharted Forest', cardNumber: '011' })
      ).toBeNull();
    });

    it('returns null when the card number has no numerator digits (an empty cardNumber)', () => {
      expect(guessCardImageFilename({ cardName: 'Skiploom', setName: 'Uncharted Forest', cardNumber: '' })).toBeNull();
    });

    it('still returns the ordinary guess when all three components are present', () => {
      expect(
        guessCardImageFilename({ cardName: 'Skiploom', setName: 'Uncharted Forest', cardNumber: '011/070' })
      ).toBe('SkiploomUnchartedForest11.jpg');
    });
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

  describe('printNumber guard (regression: the illustration-rare "parade" bug)', () => {
    // Real evidence: Pikachu (Collection 151) fetches to ONE shared article
    // whose infobox carries FOUR different reprints -- 170, 171, 172, 173 --
    // all recaptioned with the exact same "Collection 151" set name. Without
    // a print-number check, set-name matching alone picks the FIRST of the
    // four for every one of them, silently handing all four rows the same
    // scan. Only the reprintN filename itself distinguishes which print is
    // which.
    const parade =
      '{{PokémoncardInfobox|cardname=Pikachu' +
      '|image=Pikachu25PokémonCard151.jpg|caption=Regular print' +
      '|reprints=6' +
      '|reprint1=Pikachu173PokémonCard151.jpg|recaption1={{TCG|Illustration rare}} print' +
      '|reprint2=Pikachu170Collection151.jpg|recaption2={{ATCG|Collection 151}} "Journey" print' +
      '|reprint3=Pikachu171Collection151.jpg|recaption3={{ATCG|Collection 151}} "Hope" print' +
      '|reprint4=Pikachu172Collection151.jpg|recaption4={{ATCG|Collection 151}} "Scare" print' +
      '|reprint5=Pikachu173Collection151.jpg|recaption5={{ATCG|Collection 151}} "Gather" print}}';

    it('picks the reprint whose OWN filename carries this row print number, not just the first set-name match', () => {
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'], '170')).toBe('Pikachu170Collection151.jpg');
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'], '171')).toBe('Pikachu171Collection151.jpg');
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'], '172')).toBe('Pikachu172Collection151.jpg');
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'], '173')).toBe('Pikachu173Collection151.jpg');
    });

    it('never falls back to the first set-name match for a number this infobox does not carry', () => {
      // No reprint filename in `parade` carries "174" -- must stay
      // unresolved rather than guessing reprint2 (the old, buggy behavior).
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'], '174')).toBeNull();
    });

    it('does not confuse a substring digit run for the real print number', () => {
      // "17" must not match inside "170"/"171"/"172"/"173" or "173" (reprint1).
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'], '17')).toBeNull();
    });

    it('without a printNumber, preserves the pre-fix set-name-only behavior (first match)', () => {
      expect(parseCardInfoboxImageFilename(parade, ['Collection 151'])).toBe('Pikachu170Collection151.jpg');
    });

    it('still trusts a single unambiguous set-name match even when the filename does not carry the number', () => {
      const wikitext =
        '{{PokémoncardInfobox|cardname=Pikachu' +
        '|image=PikachuPaldeaEvolved62.jpg|caption={{TCG|Paldea Evolved}} print' +
        '|reprint1=PikachuPaldeanFates131.jpg|recaption1={{TCG|Paldean Fates}} print}}';
      // "18" (this row's own number) is not in "PikachuPaldeanFates131.jpg",
      // but it's the ONLY reprint candidate in the infobox, so it's still trusted.
      expect(parseCardInfoboxImageFilename(wikitext, ['Paldean Fates'], '18')).toBe('PikachuPaldeanFates131.jpg');
    });

    it('does not fall back to the bare image= field for a multi-print infobox with no number match', () => {
      // image= belongs to a DIFFERENT (Regular, #25) print -- must not be
      // handed to a row asking about #174, which this infobox never mentions.
      expect(parseCardInfoboxImageFilename(parade, [], '174')).toBeNull();
    });

    it('rejects a number-only coincidence against an UNRELATED product (regression: Team Up vs Shining Synergy)', () => {
      // Real evidence: "Eevee & Snorlax-GX" has exactly ONE wiki article --
      // its 2019 origin release, "Team Up". A numbered title guess for the
      // zh-cn-exclusive "Shining Synergy" print (also numbered 171, purely
      // by coincidence) redirects to this SAME Team Up article, whose own
      // reprint1 also happens to be numbered 171 -- but for a completely
      // different, unrelated product. The number matches; the set does not.
      const teamUpArticle =
        '{{PokémoncardInfobox|cardname=Eevee & Snorlax' +
        '|image=EeveeSnorlaxGXTeamUp120.jpg|caption={{TCG|Team Up}} Regular print' +
        '|reprint1=EeveeSnorlaxGXTeamUp171.jpg|recaption1={{TCG|Team Up}} Full Art print' +
        '|reprint2=EeveeSnorlaxGXTeamUp191.jpg|recaption2={{TCG|Team Up}} Rainbow Rare print}}';
      expect(parseCardInfoboxImageFilename(teamUpArticle, ['Shining Synergy Summon', 'Shining Synergy'], '171')).toBeNull();
    });

    it('DOES trust the bare image= field when its OWN filename carries this row print number', () => {
      // Real evidence: Mew ex (151 151)'s shared article -- the base print
      // (#151) is the bare `image=` field, while every reprintN entry names
      // a DIFFERENT numbered print (193, 205, ...). Row 151 asking about
      // itself should resolve via the bare field, on the same
      // number-in-filename evidence as any reprintN candidate.
      const mewArticle =
        '{{PokémoncardInfobox|cardname=Mew' +
        '|image=Mewex151PokémonCard151.jpg|caption=Regular print' +
        '|reprint1=Mewex193PokémonCard151.jpg|recaption1={{TCG|Ultra rare}} print' +
        '|reprint2=Mewex205PokémonCard151.jpg|recaption2={{TCG|Hyper rare}} print}}';
      expect(parseCardInfoboxImageFilename(mewArticle, ['Collection 151'], '151')).toBe('Mewex151PokémonCard151.jpg');
      // A number the article genuinely does not carry (a zh-cn-exclusive
      // print the source has no distinct scan for) still stays unresolved.
      expect(parseCardInfoboxImageFilename(mewArticle, ['Collection 151'], '185')).toBeNull();
    });
  });
});

describe('isCardShapedImage (aspect-ratio guard)', () => {
  it('accepts a real card scan-shaped image', () => {
    expect(isCardShapedImage({ width: 734, height: 1024 })).toBe(true);
  });

  it('rejects a landscape photo (e.g. a news photo of a hand holding a card)', () => {
    expect(isCardShapedImage({ width: 1200, height: 800 })).toBe(false);
  });

  it('rejects an implausibly narrow/tall image', () => {
    expect(isCardShapedImage({ width: 200, height: 1200 })).toBe(false);
  });

  it('treats missing dimensions as inconclusive (never rejects on missing metadata alone)', () => {
    expect(isCardShapedImage({})).toBe(true);
    expect(isCardShapedImage({ width: 500 })).toBe(true);
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
