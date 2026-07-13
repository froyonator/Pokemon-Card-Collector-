// scripts/carddata/src/harvest/deepImageResolver.test.ts
import { describe, expect, it } from 'vitest';
import type { WikiImageInfo, WikiPageWikitext, WikiSearchResult } from './types';
import {
  buildArticleTitleCandidates,
  buildCardSearchQuery,
  cardCodesMatch,
  checkArticleMatchesPrint,
  isCardArticleShapedTitle,
  normalizeCardCode,
  parsePrintDisambiguator,
  pickBestCardSearchCandidate,
  resolveCardArticleLadder,
  resolveFilenameGuessBatch,
  scoreCardSearchCandidate,
  type DeepImageJobCard,
} from './deepImageResolver';

function card(overrides: Partial<DeepImageJobCard> = {}): DeepImageJobCard {
  return {
    cardId: 'wk-en-promoa-4',
    dexNumber: 25,
    generation: 1,
    name: 'Pikachu',
    localId: '4',
    rarity: 'Promo',
    setId: 'promoa',
    setName: 'Some Promo Set',
    ...overrides,
  };
}

function infoboxWikitext(imageFilename: string): string {
  return `{{CardInfobox\n|name=Pikachu\n|image=${imageFilename}\n|caption=Pikachu\n}}`;
}

describe('resolveFilenameGuessBatch', () => {
  it('resolves each card against its OWN setName, unlike a single-set-grouped batch', async () => {
    const cards = [card({ cardId: 'a', name: 'Bulbasaur', setName: 'Base Set', localId: '44' }), card({ cardId: 'b', name: 'Charmander', setName: 'Jungle', localId: '46' })];
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        const isReal = title === 'File:BulbasaurBaseSet44.jpg' || title === 'File:CharmanderJungle46.jpg';
        map.set(title, { fileTitle: title, url: isReal ? `https://example.invalid/${title}` : null, missing: !isReal });
      }
      return map;
    };

    const resolved = await resolveFilenameGuessBatch({ queryImageInfo }, cards);
    expect(resolved.get('a')?.fileTitle).toBe('File:BulbasaurBaseSet44.jpg');
    expect(resolved.get('b')?.fileTitle).toBe('File:CharmanderJungle46.jpg');
  });

  it('leaves a card unresolved (absent from the map) when neither jpg nor png guess exists', async () => {
    const cards = [card({ cardId: 'a' })];
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };
    const resolved = await resolveFilenameGuessBatch({ queryImageInfo }, cards);
    expect(resolved.has('a')).toBe(false);
  });
});

describe('normalizeCardCode', () => {
  it('uppercases the alpha prefix and strips leading zeros from the digit part', () => {
    expect(normalizeCardCode('sm198')).toBe('SM198');
    expect(normalizeCardCode('SWSH074')).toBe('SWSH74');
    expect(normalizeCardCode('037')).toBe('37');
    expect(normalizeCardCode('15A1')).toBe('15A1');
    expect(normalizeCardCode('057/191')).toBe('57');
  });
});

describe('cardCodesMatch', () => {
  it('matches exact normalized codes regardless of zero-padding and case', () => {
    expect(cardCodesMatch('SM198', 'sm198', 'anything')).toBe(true);
    expect(cardCodesMatch('037', '37', 'anything')).toBe(true);
  });

  it('matches a held prefixed code against a bare article number when the article set name accounts for the prefix -- the live SM promo convention', () => {
    expect(cardCodesMatch('SM198', '198', 'SM Promo')).toBe(true);
    expect(cardCodesMatch('SWSH074', '74', 'SWSH Promo')).toBe(true);
  });

  it('never matches when the prefix is unaccounted for -- "SM198" is not any old print numbered 198', () => {
    expect(cardCodesMatch('SM198', '198', 'XY Promo')).toBe(false);
    expect(cardCodesMatch('SM198', '198', 'Jungle')).toBe(false);
  });

  it('never matches different digit parts at all', () => {
    expect(cardCodesMatch('SM198', '199', 'SM Promo')).toBe(false);
  });
});

describe('parsePrintDisambiguator', () => {
  it('parses the ordinary numbered form', () => {
    expect(parsePrintDisambiguator('Bulbasaur (SM Promo 198)')).toEqual({ cardName: 'Bulbasaur', setName: 'SM Promo', number: '198' });
  });

  it('parses the number-less form the wiki uses for a set-unique print', () => {
    expect(parsePrintDisambiguator('Squirtle (My First Battle)')).toEqual({ cardName: 'Squirtle', setName: 'My First Battle', number: null });
  });

  it('does not mistake a trailing word for a number', () => {
    const parsed = parsePrintDisambiguator('Pikachu (Battle Academy)');
    expect(parsed?.number).toBeNull();
    expect(parsed?.setName).toBe('Battle Academy');
  });

  it('returns null for a title with no parenthetical', () => {
    expect(parsePrintDisambiguator('Pikachu')).toBeNull();
  });
});

describe('buildArticleTitleCandidates', () => {
  it('leads with the direct guess, followed by orthographic variants', () => {
    const candidates = buildArticleTitleCandidates(card({ name: 'Pikachu', setName: 'Pokemon Center', localId: '4' }));
    expect(candidates[0]).toBe('Pikachu (Pokemon Center 4)');
    expect(candidates).toContain('Pikachu (Pokémon Center 4)');
  });

  it('normalizes the code in the direct guess -- the wiki never zero-pads its title numbers', () => {
    const candidates = buildArticleTitleCandidates(card({ name: 'Bulbasaur', setName: 'Base Set', localId: '044' }));
    expect(candidates[0]).toBe('Bulbasaur (Base Set 44)');
  });

  it('adds the wiki promo-article convention for a Black Star Promos set -- the confirmed live "SM Promo 198" form', () => {
    const candidates = buildArticleTitleCandidates(card({ name: 'Bulbasaur', setName: 'SM Black Star Promos', localId: 'SM198' }));
    expect(candidates).toContain('Bulbasaur (SM Promo 198)');
  });

  it('adds the number-less "Name (Set)" form -- the confirmed live "Squirtle (My First Battle)" convention', () => {
    const candidates = buildArticleTitleCandidates(card({ name: 'Squirtle', setName: 'My First Battle', localId: '25' }));
    expect(candidates).toContain('Squirtle (My First Battle)');
  });
});

describe('checkArticleMatchesPrint', () => {
  it('accepts a title whose disambiguator matches name/number exactly and set closely', () => {
    const result = checkArticleMatchesPrint('Pikachu (Some Promo Set 4)', card());
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('accepts a set name that only overlaps, not matches exactly -- the whole reason this job exists', () => {
    const result = checkArticleMatchesPrint('Pikachu (Promo Set A 4)', card({ setName: 'Some Promo Set' }));
    expect(result.ok).toBe(true);
  });

  it('rejects a title with no disambiguator at all', () => {
    const result = checkArticleMatchesPrint('Pikachu', card());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no "\(Set Number\)" disambiguator/);
  });

  it('rejects a mismatched card name', () => {
    const result = checkArticleMatchesPrint('Raichu (Some Promo Set 4)', card());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not match held name/);
  });

  it('rejects a mismatched print number', () => {
    const result = checkArticleMatchesPrint('Pikachu (Some Promo Set 99)', card());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not match held localId/);
  });

  it('rejects a set name with insufficient token overlap', () => {
    const result = checkArticleMatchesPrint('Pikachu (Totally Unrelated Product 4)', card({ setName: 'Some Promo Set' }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not sufficiently match held set/);
  });

  it('accepts the live SM promo convention: prefixed held code, bare article number, singular/plural set fork', () => {
    const result = checkArticleMatchesPrint(
      'Bulbasaur (SM Promo 198)',
      card({ name: 'Bulbasaur', setName: 'SM Black Star Promos', localId: 'SM198' })
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a number-less title when the set name matches ours convincingly -- the live "Squirtle (My First Battle)" case', () => {
    const result = checkArticleMatchesPrint('Squirtle (My First Battle)', card({ name: 'Squirtle', setName: 'My First Battle', localId: '25' }));
    expect(result.ok).toBe(true);
  });

  it('rejects a number-less title whose set name matches only loosely -- no number means the set must carry the whole proof', () => {
    const result = checkArticleMatchesPrint('Pikachu (Some Battle)', card({ setName: 'Some Promo Set' }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/number-less/);
  });
});

describe('isCardArticleShapedTitle', () => {
  it('accepts a "Name (Set Number)" title and rejects a bare species title', () => {
    expect(isCardArticleShapedTitle('Pikachu (Jungle 60)')).toBe(true);
    expect(isCardArticleShapedTitle('Pikachu')).toBe(false);
  });
});

describe('buildCardSearchQuery', () => {
  it('combines the card name and setName', () => {
    expect(buildCardSearchQuery(card({ name: 'Pikachu', setName: 'Some Promo Set' }))).toBe('Pikachu Some Promo Set');
  });
});

describe('scoreCardSearchCandidate', () => {
  it('scores a matching print above the minimum bar', () => {
    const score = scoreCardSearchCandidate('Pikachu (Promo Set A 4)', card({ setName: 'Some Promo Set A' }));
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(1);
  });

  it('disqualifies (returns null for) a non-card-shaped title', () => {
    expect(scoreCardSearchCandidate('Pikachu', card())).toBeNull();
  });

  it('disqualifies a different Pokemon entirely, never guessing wrong art on name alone', () => {
    expect(scoreCardSearchCandidate('Raichu (Some Promo Set 4)', card())).toBeNull();
  });

  it('disqualifies a mismatched print number', () => {
    expect(scoreCardSearchCandidate('Pikachu (Some Promo Set 99)', card())).toBeNull();
  });

  it('disqualifies a set name with insufficient overlap', () => {
    expect(scoreCardSearchCandidate('Pikachu (Totally Unrelated Product 4)', card({ setName: 'Some Promo Set' }))).toBeNull();
  });
});

describe('pickBestCardSearchCandidate', () => {
  it('returns none when nothing qualifies', () => {
    const results: WikiSearchResult[] = [{ title: 'Pikachu' }, { title: 'Raichu (Some Promo Set 4)' }];
    expect(pickBestCardSearchCandidate(results, card())).toEqual({ status: 'none' });
  });

  it('returns a single high-confidence hit', () => {
    const results: WikiSearchResult[] = [{ title: 'Pikachu (Some Promo Set 4)' }, { title: 'Raichu (Some Promo Set 4)' }];
    const outcome = pickBestCardSearchCandidate(results, card());
    expect(outcome.status).toBe('hit');
    if (outcome.status === 'hit') expect(outcome.title).toBe('Pikachu (Some Promo Set 4)');
  });

  it('flags ambiguity when two qualifying candidates tie for the top score, never guessing between them', () => {
    // Both share the SAME setName token overlap against 'Promo Set A' -- an
    // engineered tie, not a realistic pair, but exactly the case the guard
    // must catch: two distinct real articles both plausibly the right print.
    const results: WikiSearchResult[] = [{ title: 'Pikachu (Promo Set A 4)' }, { title: 'Pikachu (Promo Set B 4)' }];
    const outcome = pickBestCardSearchCandidate(results, card({ setName: 'Promo Set' }));
    expect(outcome.status).toBe('ambiguous');
    if (outcome.status === 'ambiguous') {
      expect(outcome.candidates).toEqual(['Pikachu (Promo Set A 4)', 'Pikachu (Promo Set B 4)']);
    }
  });
});

describe('resolveCardArticleLadder', () => {
  function stubClient(overrides: {
    parsePageWikitext?: (title: string) => Promise<WikiPageWikitext>;
    searchPageTitles?: () => Promise<WikiSearchResult[]>;
    queryImageInfo?: (fileTitles: string[]) => Promise<Map<string, WikiImageInfo>>;
  }) {
    return {
      parsePageWikitext: overrides.parsePageWikitext ?? (async () => { throw new Error('not found'); }),
      searchPageTitles: overrides.searchPageTitles ?? (async () => []),
      queryImageInfo: overrides.queryImageInfo ?? (async (fileTitles: string[]) => {
        const map = new Map<string, WikiImageInfo>();
        for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
        return map;
      }),
    };
  }

  it('resolves via the direct article-title guess when it exists and matches', async () => {
    const theCard = card({ name: 'Pikachu', setName: 'Some Promo Set', localId: '4' });
    const client = stubClient({
      parsePageWikitext: async (title) => {
        if (title === 'Pikachu (Some Promo Set 4)') {
          return { title, pageId: 1, wikitext: infoboxWikitext('PikachuSomePromoSet4.jpg') };
        }
        throw new Error('not found');
      },
      queryImageInfo: async (fileTitles) => {
        const map = new Map<string, WikiImageInfo>();
        for (const title of fileTitles) {
          const isReal = title === 'File:PikachuSomePromoSet4.jpg';
          map.set(title, { fileTitle: title, url: isReal ? 'https://example.invalid/real.jpg' : null, missing: !isReal });
        }
        return map;
      },
    });

    const result = await resolveCardArticleLadder(client, theCard);
    expect(result).toEqual({
      cardId: theCard.cardId,
      dexNumber: theCard.dexNumber,
      localId: theCard.localId,
      imageFileTitle: 'File:PikachuSomePromoSet4.jpg',
      imageUrl: 'https://example.invalid/real.jpg',
      imageMissing: false,
      method: 'article-direct',
      skipReason: null,
    });
  });

  it('falls through to an orthographic variant when the direct guess 404s', async () => {
    const theCard = card({ name: 'Pikachu', setName: 'Pokemon Center', localId: '4' });
    const client = stubClient({
      parsePageWikitext: async (title) => {
        if (title === 'Pikachu (Pokémon Center 4)') {
          return { title, pageId: 1, wikitext: infoboxWikitext('PikachuPokemonCenter4.jpg') };
        }
        throw new Error('not found');
      },
      queryImageInfo: async (fileTitles) => {
        const map = new Map<string, WikiImageInfo>();
        for (const title of fileTitles) {
          const isReal = title === 'File:PikachuPokemonCenter4.jpg';
          map.set(title, { fileTitle: title, url: isReal ? 'https://example.invalid/real.jpg' : null, missing: !isReal });
        }
        return map;
      },
    });

    const result = await resolveCardArticleLadder(client, theCard);
    expect(result.method).toBe('article-variant');
    expect(result.imageMissing).toBe(false);
  });

  it('resolves via a scored title search when every direct/variant guess 404s and the real title differs too much for a variant to bridge', async () => {
    // The direct guess ("Our Stored Name") and the real wiki title
    // ("Stored Name Extra") share enough tokens to clear the guard's
    // overlap bar, but differ by more than any Pokemon/&/ATCG substitution
    // titleVariants knows -- exactly the case only a title search can save.
    const theCard = card({ name: 'Pikachu', setName: 'Our Stored Name', localId: '4' });
    const realTitle = 'Pikachu (Stored Name Extra 4)';
    const client = stubClient({
      parsePageWikitext: async (title) => {
        if (title === realTitle) return { title, pageId: 1, wikitext: infoboxWikitext('PikachuStoredNameExtra4.jpg') };
        throw new Error('not found');
      },
      searchPageTitles: async () => [{ title: realTitle }],
      queryImageInfo: async (fileTitles) => {
        const map = new Map<string, WikiImageInfo>();
        for (const title of fileTitles) {
          const isReal = title === 'File:PikachuStoredNameExtra4.jpg';
          map.set(title, { fileTitle: title, url: isReal ? 'https://example.invalid/real.jpg' : null, missing: !isReal });
        }
        return map;
      },
    });

    const result = await resolveCardArticleLadder(client, theCard);
    expect(result.method).toBe('article-search');
    expect(result.imageMissing).toBe(false);
    expect(result.imageUrl).toBe('https://example.invalid/real.jpg');
  });

  it('logs and skips (never guesses wrong art) when the only fetchable article names a different print', async () => {
    const theCard = card({ name: 'Pikachu', setName: 'Our Stored Name', localId: '4' });
    const client = stubClient({
      parsePageWikitext: async (title) => {
        if (title === 'Pikachu (Our Stored Name 4)') {
          // Exists, but is actually a DIFFERENT print (wrong number) --
          // e.g. our guess happened to collide with an unrelated article.
          return { title: 'Pikachu (Our Stored Name 99)', pageId: 1, wikitext: infoboxWikitext('PikachuWrongPrint.jpg') };
        }
        throw new Error('not found');
      },
    });

    const result = await resolveCardArticleLadder(client, theCard);
    expect(result.imageMissing).toBe(true);
    expect(result.imageUrl).toBeNull();
    expect(result.method).toBeNull();
    expect(result.skipReason).toMatch(/does not match held localId/);
  });

  it('logs and skips on an ambiguous search result rather than guessing between two plausible prints', async () => {
    const theCard = card({ name: 'Pikachu', setName: 'Promo Set', localId: '4' });
    const client = stubClient({
      searchPageTitles: async () => [{ title: 'Pikachu (Promo Set A 4)' }, { title: 'Pikachu (Promo Set B 4)' }],
    });

    const result = await resolveCardArticleLadder(client, theCard);
    expect(result.imageMissing).toBe(true);
    expect(result.method).toBeNull();
    expect(result.skipReason).toMatch(/ambiguous title search/);
  });

  it('reports "not found" (no skipReason) when nothing at all matched, distinct from a guard rejection', async () => {
    const theCard = card();
    const client = stubClient({});
    const result = await resolveCardArticleLadder(client, theCard);
    expect(result.imageMissing).toBe(true);
    expect(result.skipReason).toBeNull();
  });
});
