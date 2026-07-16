// scripts/carddata/src/harvest/runHarvest.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { deriveSetNameFromArticleTitle, extractCsCode, parseSetPageWikitext } from './setlistParser';
import type { SetlistRow, WikiImageInfo, WikiPageWikitext } from './types';
import {
  buildCardIdIndex,
  buildDeepImageQueue,
  buildDeepSetArticleCandidates,
  buildImageJobs,
  buildRowImageCandidates,
  chunkQueue,
  clearMissingSetFailure,
  computeEnrichmentFills,
  computeEnrichmentMatchRate,
  DEEP_IMAGE_CHUNK_SIZE,
  deriveImageGuessCardName,
  emptyProgress,
  ENRICHMENT_MATCH_THRESHOLD,
  extractNumerator,
  filterGen1Rows,
  type Gen1MatchedRow,
  harvestFromResolvedArticles,
  imageJobCardToGen1Row,
  isDeepImageCardDone,
  isEnrichDone,
  matchDeepCardsToSetRows,
  isImagesDone,
  isMissingSetDone,
  isMissingSetFailed,
  isMissingSetZeroRow,
  matchGen1DexEntry,
  normalizeNumerator,
  parseArgs,
  recordMissingSetFailure,
  resolveHarvestedCardImages,
  resolveImageJobCards,
  resolveZhCnSetId,
  selectPendingJobs,
  selectRetryTargets,
  type LanguageGenerationFiles,
  type ProgressFile,
} from './runHarvest';
import type { ResolvedArticle } from './retryResolution';
import type { DeepImageJobCard } from './deepImageResolver';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/harvest/${name}`, import.meta.url)), 'utf-8');
}

describe('matchGen1DexEntry', () => {
  it('matches a bare species name', () => {
    expect(matchGen1DexEntry('Charizard')?.number).toBe(6);
  });

  it('matches a suffixed form on a word boundary', () => {
    expect(matchGen1DexEntry('Pikachu ex')?.number).toBe(25);
    expect(matchGen1DexEntry('Charizard V')?.number).toBe(6);
  });

  it('does not match a later-gen or non-Pokemon name', () => {
    expect(matchGen1DexEntry('Enriching Energy')).toBeNull();
    expect(matchGen1DexEntry('Iron Hands ex')).toBeNull();
  });

  it('does not false-positive-match a name that merely starts with the same letters', () => {
    expect(matchGen1DexEntry('Pikachuuu')).toBeNull();
  });
});

describe('filterGen1Rows against the real surging-sparks fixture', () => {
  it('keeps only the Gen1 rows (Exeggcute, Pikachu x2) and drops the Energy card', () => {
    const { cardListRows } = parseSetPageWikitext(fixture('surging-sparks-card-list.wikitext'));
    const kept = filterGen1Rows(cardListRows);
    expect(kept).toHaveLength(3);
    expect(kept.map((m) => m.dex.name).sort()).toEqual(['Exeggcute', 'Pikachu', 'Pikachu']);
    expect(kept.some((m) => m.row.cardArticleTitle.includes('Enriching Energy'))).toBe(false);
  });
});

describe('extractNumerator / normalizeNumerator', () => {
  it('keeps leading zeros for extractNumerator', () => {
    expect(extractNumerator('001/191')).toBe('001');
  });

  it('strips leading zeros for normalizeNumerator', () => {
    expect(normalizeNumerator('001/191')).toBe('1');
    expect(normalizeNumerator('057')).toBe('57');
  });
});

describe('deriveImageGuessCardName', () => {
  it('strips the trailing (Set Number) disambiguator', () => {
    expect(deriveImageGuessCardName('Pikachu ex (Surging Sparks 57)')).toBe('Pikachu ex');
  });

  it('passes through a title with no parenthetical', () => {
    expect(deriveImageGuessCardName('Pikachu')).toBe('Pikachu');
  });
});

function makeRow(overrides: Partial<SetlistRow>): SetlistRow {
  return {
    cardNumber: '001/100',
    regulationMark: null,
    displayName: 'Test',
    cardArticleTitle: 'Test (Test Set 1)',
    primaryType: null,
    secondaryField: null,
    rarity: null,
    promoNote: null,
    nameSource: 'literal',
    originSetName: null,
    ...overrides,
  };
}

describe('buildRowImageCandidates', () => {
  it('strategy (a): derives the filename from the cardArticleTitle disambiguator, ignoring the promo set name entirely', () => {
    // Real evidence: this row lives in the "Trick or Trade 2022" promo set
    // list, but its scan really files under Battle Styles.
    const row = makeRow({
      cardNumber: '069/163',
      cardArticleTitle: 'Cubone (Battle Styles 69)',
      originSetName: 'Battle Styles',
    });
    expect(buildRowImageCandidates('Trick or Trade 2022', row)).toEqual([
      'CuboneBattleStyles69.jpg',
      'CuboneBattleStyles69.png',
    ]);
  });

  it('strategy (b): falls back to the promo set name, plus originSetName, when the title has no disambiguator', () => {
    const row = makeRow({
      cardNumber: '069/163',
      displayName: 'Cubone',
      cardArticleTitle: 'Cubone',
      originSetName: 'Battle Styles',
      nameSource: 'literal',
    });
    expect(buildRowImageCandidates('Trick or Trade 2022', row)).toEqual([
      'CuboneTrickorTrade202269.jpg',
      'CuboneTrickorTrade202269.png',
      'CuboneBattleStyles69.jpg',
      'CuboneBattleStyles69.png',
    ]);
  });

  it('strategy (b) without an originSetName only tries the promo set name', () => {
    const row = makeRow({ cardNumber: '5/30', cardArticleTitle: 'Bare Name' });
    expect(buildRowImageCandidates('Some Promo', row)).toEqual(['BareNameSomePromo5.jpg', 'BareNameSomePromo5.png']);
  });

  it('yields no candidates for a literal row whose name and set are both non-Latin -- every guess would degenerate to a bare number', () => {
    // Real evidence: a katakana card name against a katakana promo set name
    // both clean to the empty string, degenerating every guess to a bare
    // numeric filename that collides with unrelated files on the reference
    // wiki. No candidate carries any identity evidence, so none is emitted.
    const row = makeRow({
      cardNumber: '011/070',
      displayName: 'スキプルーム',
      cardArticleTitle: 'スキプルーム',
      nameSource: 'literal',
    });
    expect(buildRowImageCandidates('地図にない町', row)).toEqual([]);
  });
});

describe('resolveHarvestedCardImages', () => {
  it('prefers a resolved jpg guess and marks the card resolved', async () => {
    const { cardListRows } = parseSetPageWikitext(fixture('surging-sparks-card-list.wikitext'));
    const gen1Rows = filterGen1Rows(cardListRows).filter((r) => r.dex.name === 'Exeggcute');
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        map.set(title, { fileTitle: title, url: `https://example.invalid/${title}`, missing: false });
      }
      return map;
    };

    const [card] = await resolveHarvestedCardImages({ queryImageInfo }, 'Surging Sparks', gen1Rows);

    expect(card.imageMissing).toBe(false);
    expect(card.imageUrl).toBe('https://example.invalid/File:ExeggcuteSurgingSparks1.jpg');
    expect(card.dexNumber).toBe(102);
    expect(card.localId).toBe('001');
  });

  it('falls back to a png guess when the jpg guess is missing', async () => {
    const { cardListRows } = parseSetPageWikitext(fixture('surging-sparks-card-list.wikitext'));
    const gen1Rows = filterGen1Rows(cardListRows).filter((r) => r.dex.name === 'Exeggcute');
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        const isPng = title.endsWith('.png');
        map.set(title, {
          fileTitle: title,
          url: isPng ? `https://example.invalid/${title}` : null,
          missing: !isPng,
        });
      }
      return map;
    };

    const [card] = await resolveHarvestedCardImages({ queryImageInfo }, 'Surging Sparks', gen1Rows);

    expect(card.imageMissing).toBe(false);
    expect(card.imageUrl).toBe('https://example.invalid/File:ExeggcuteSurgingSparks1.png');
  });

  it('marks a card imageMissing when neither guess resolves', async () => {
    const { cardListRows } = parseSetPageWikitext(fixture('surging-sparks-card-list.wikitext'));
    const gen1Rows = filterGen1Rows(cardListRows).filter((r) => r.dex.name === 'Exeggcute');
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };

    const [card] = await resolveHarvestedCardImages({ queryImageInfo }, 'Surging Sparks', gen1Rows);

    expect(card.imageMissing).toBe(true);
    expect(card.imageUrl).toBeNull();
  });

  it('returns an empty array without any network call for an empty row list', async () => {
    const queryImageInfo = async () => {
      throw new Error('should not be called');
    };
    const result = await resolveHarvestedCardImages({ queryImageInfo }, 'Surging Sparks', []);
    expect(result).toEqual([]);
  });

  it('resolves a reprint row against its origin set via the cardArticleTitle disambiguator, not the promo set it was listed under', async () => {
    const { cardListRows } = parseSetPageWikitext(fixture('trick-or-trade-2022-card-list.wikitext'));
    const gen1Rows = filterGen1Rows(cardListRows).filter((r) => r.dex.name === 'Cubone');
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        const isRealFile = title === 'File:CuboneBattleStyles69.jpg';
        map.set(title, { fileTitle: title, url: isRealFile ? `https://example.invalid/${title}` : null, missing: !isRealFile });
      }
      return map;
    };

    const [card] = await resolveHarvestedCardImages({ queryImageInfo }, 'Trick or Trade 2022', gen1Rows);

    expect(card.localId).toBe('069');
    expect(card.imageMissing).toBe(false);
    expect(card.imageUrl).toBe('https://example.invalid/File:CuboneBattleStyles69.jpg');
  });

  it('falls back to the card article infobox (strategy c) when the filename guesses all miss, and skips it when parsePageWikitext is not provided', async () => {
    const row = makeRow({
      cardNumber: '5/30',
      displayName: 'Bulbasaur',
      cardArticleTitle: 'Bulbasaur',
      originSetName: 'Origin Set',
    });
    const gen1Rows = filterGen1Rows([row]);
    const missAll = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };

    const withoutInfobox = await resolveHarvestedCardImages({ queryImageInfo: missAll }, 'Promo Set', gen1Rows);
    expect(withoutInfobox[0].imageMissing).toBe(true);

    const parsePageWikitext = async (title: string): Promise<WikiPageWikitext> => {
      expect(title).toBe('Bulbasaur');
      return {
        title,
        pageId: 1,
        wikitext: '{{PokémoncardInfobox|cardname=Bulbasaur|image=BulbasaurOriginSet5.jpg}}',
      };
    };
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        const isRealFile = title === 'File:BulbasaurOriginSet5.jpg';
        map.set(title, { fileTitle: title, url: isRealFile ? `https://example.invalid/${title}` : null, missing: !isRealFile });
      }
      return map;
    };

    const [card] = await resolveHarvestedCardImages({ queryImageInfo, parsePageWikitext }, 'Promo Set', gen1Rows);
    expect(card.imageMissing).toBe(false);
    expect(card.imageUrl).toBe('https://example.invalid/File:BulbasaurOriginSet5.jpg');
  });

  it('strategy (c) targets the cardArticleTitle disambiguator set name, not just originSetName/promoSetName, against a shared multi-printing infobox', async () => {
    // Real evidence: "Pikachu (Paldean Fates 18)" resolves (via a wiki
    // redirect) to Pikachu's shared article, whose bare `image=` belongs to
    // a DIFFERENT (Paldea Evolved) printing -- only the disambiguator's own
    // "Paldean Fates" set name, matched against the `reprintN`/`recaptionN`
    // fields, finds the right one.
    const row = makeRow({
      cardNumber: '018/091',
      displayName: 'Pikachu',
      cardArticleTitle: 'Pikachu (Paldean Fates 18)',
    });
    const gen1Rows = filterGen1Rows([row]);
    const parsePageWikitext = async (title: string): Promise<WikiPageWikitext> => {
      expect(title).toBe('Pikachu (Paldean Fates 18)');
      return {
        title: 'Pikachu (Paldea Evolved 62)', // the article redirects to the shared/primary printing
        pageId: 1,
        wikitext:
          '{{PokémoncardInfobox|cardname=Pikachu' +
          '|image=PikachuPaldeaEvolved62.jpg|caption={{TCG|Paldea Evolved}} print' +
          '|reprint1=PikachuPaldeanFates131.jpg|recaption1={{TCG|Paldean Fates}} print}}',
      };
    };
    // Every filename-guess candidate misses; only the infobox-derived one
    // ("PikachuPaldeanFates131.jpg", found via strategy c) is real.
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        const isRealFile = title === 'File:PikachuPaldeanFates131.jpg';
        map.set(title, { fileTitle: title, url: isRealFile ? `https://example.invalid/${title}` : null, missing: !isRealFile });
      }
      return map;
    };

    const [resolved] = await resolveHarvestedCardImages(
      { queryImageInfo, parsePageWikitext },
      'Trick or Trade 2024',
      gen1Rows
    );
    expect(resolved.imageMissing).toBe(false);
    expect(resolved.imageUrl).toBe('https://example.invalid/File:PikachuPaldeanFates131.jpg');
  });

  it('regression: an illustration-rare "parade" of same-set rows each gets its OWN image, never a shared one', async () => {
    // Real evidence (the reported bug): four DIFFERENT Collection 151
    // Pikachu prints -- 170, 171, 172, 173 -- all fetch (via redirect) to
    // ONE shared article whose infobox recaptions every one of them with
    // the exact same "Collection 151" set name. Before the printNumber
    // guard, strategy (c) handed all four rows the SAME first-matching
    // reprint image.
    const paradeWikitext =
      '{{PokémoncardInfobox|cardname=Pikachu' +
      '|image=Pikachu25PokémonCard151.jpg|caption=Regular print' +
      '|reprint1=Pikachu173PokémonCard151.jpg|recaption1={{TCG|Illustration rare}} print' +
      '|reprint2=Pikachu170Collection151.jpg|recaption2={{ATCG|Collection 151}} "Journey" print' +
      '|reprint3=Pikachu171Collection151.jpg|recaption3={{ATCG|Collection 151}} "Hope" print' +
      '|reprint4=Pikachu172Collection151.jpg|recaption4={{ATCG|Collection 151}} "Scare" print' +
      '|reprint5=Pikachu173Collection151.jpg|recaption5={{ATCG|Collection 151}} "Gather" print}}';

    const rows = ['170', '171', '172', '173'].map((n) =>
      makeRow({
        cardNumber: `${n}/165`,
        displayName: 'Pikachu',
        cardArticleTitle: `Pikachu (Collection 151 ${n})`,
      })
    );
    const gen1Rows = filterGen1Rows(rows);

    // The redirect lands on the SAME shared page for every row, regardless
    // of which numbered title was requested.
    const parsePageWikitext = async (): Promise<WikiPageWikitext> => ({
      title: 'Pikachu (151 25)',
      pageId: 1,
      wikitext: paradeWikitext,
    });
    // Every filename-guess candidate misses -- only the infobox fallback
    // (strategy c) can resolve these.
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      const realFiles = new Set([
        'File:Pikachu170Collection151.jpg',
        'File:Pikachu171Collection151.jpg',
        'File:Pikachu172Collection151.jpg',
        'File:Pikachu173Collection151.jpg',
      ]);
      for (const title of fileTitles) {
        map.set(title, { fileTitle: title, url: realFiles.has(title) ? `https://example.invalid/${title}` : null, missing: !realFiles.has(title) });
      }
      return map;
    };

    const resolved = await resolveHarvestedCardImages({ queryImageInfo, parsePageWikitext }, 'Collection 151', gen1Rows);

    expect(resolved.map((c) => c.imageUrl)).toEqual([
      'https://example.invalid/File:Pikachu170Collection151.jpg',
      'https://example.invalid/File:Pikachu171Collection151.jpg',
      'https://example.invalid/File:Pikachu172Collection151.jpg',
      'https://example.invalid/File:Pikachu173Collection151.jpg',
    ]);
    // Every resolved image is DISTINCT -- the whole point of the fix.
    expect(new Set(resolved.map((c) => c.imageUrl)).size).toBe(4);
  });

  describe('strategy (c) guard for a bare literal cardArticleTitle (regression: a same-named non-card article)', () => {
    // Real evidence: an image-only job's row has NO "(Set Number)"
    // disambiguator at all (imageJobCardToGen1Row builds cardArticleTitle as
    // the bare card name), so nothing previously verified the fetched page
    // was even a CARD article for this print. "Armored Mewtwo" fetched a
    // franchise-character article of the same name, whose infobox image= is
    // a video still, and the parser's final fallback handed it over anyway.
    it('rejects the fetched page and leaves the card imageMissing when it carries no disambiguator at all', async () => {
      const row = makeRow({
        cardNumber: 'SM228',
        displayName: 'Armored Mewtwo',
        cardArticleTitle: 'Armored Mewtwo',
        nameSource: 'literal',
      });
      const gen1Rows: Gen1MatchedRow[] = [{ row, dex: { number: 150, name: 'Mewtwo' } }];

      const queriedTitles: string[] = [];
      const queryImageInfo = async (fileTitles: string[]) => {
        queriedTitles.push(...fileTitles);
        const map = new Map<string, WikiImageInfo>();
        for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
        return map;
      };
      const parsePageWikitext = async (title: string): Promise<WikiPageWikitext> => {
        expect(title).toBe('Armored Mewtwo');
        return {
          title: 'Armored Mewtwo', // no disambiguator -- this article was never established as a card article
          pageId: 1,
          wikitext: '{{Infobox character|name=Armored Mewtwo|image=SomeStill.png}}',
        };
      };

      const [card] = await resolveHarvestedCardImages(
        { queryImageInfo, parsePageWikitext },
        'SM Black Star Promos',
        gen1Rows
      );

      expect(card.imageMissing).toBe(true);
      expect(queriedTitles).not.toContain('File:SomeStill.png');
    });

    it('accepts the fetched page when parsePageWikitext resolves (via redirect) to the true disambiguated card article', async () => {
      const row = makeRow({
        cardNumber: 'SM228',
        displayName: 'Armored Mewtwo',
        cardArticleTitle: 'Armored Mewtwo',
        nameSource: 'literal',
      });
      const gen1Rows: Gen1MatchedRow[] = [{ row, dex: { number: 150, name: 'Mewtwo' } }];

      const parsePageWikitext = async (title: string): Promise<WikiPageWikitext> => {
        expect(title).toBe('Armored Mewtwo');
        return {
          title: 'Armored Mewtwo (SM Promo 228)', // redirect resolved to the real, disambiguated card article
          pageId: 1,
          wikitext: '{{PokémoncardInfobox|cardname=Armored Mewtwo|image=ArmoredMewtwoSMPromo228.jpg}}',
        };
      };
      const queryImageInfo = async (fileTitles: string[]) => {
        const map = new Map<string, WikiImageInfo>();
        for (const title of fileTitles) {
          const isRealFile = title === 'File:ArmoredMewtwoSMPromo228.jpg';
          map.set(title, { fileTitle: title, url: isRealFile ? `https://example.invalid/${title}` : null, missing: !isRealFile });
        }
        return map;
      };

      const [card] = await resolveHarvestedCardImages(
        { queryImageInfo, parsePageWikitext },
        'SM Black Star Promos',
        gen1Rows
      );

      expect(card.imageMissing).toBe(false);
      expect(card.imageUrl).toBe('https://example.invalid/File:ArmoredMewtwoSMPromo228.jpg');
    });
  });
});

describe('harvestFromResolvedArticles (multi-article concatenation)', () => {
  function resolvedArticle(title: string, wikitext: string): ResolvedArticle {
    return { title, fetchedTitle: title, wikitext, page: parseSetPageWikitext(wikitext) };
  }

  it('concatenates rows/cards from multiple articles, each resolving images against its own real set name', async () => {
    const blackCollection = resolvedArticle(
      'Black Collection (TCG)',
      '{{Setlist/entry|001/53|H|{{TCG ID|Black Collection|Bulbasaur|1}}|Grass||Common}}'
    );
    const whiteCollection = resolvedArticle(
      'White Collection (TCG)',
      '{{Setlist/entry|001/53|H|{{TCG ID|White Collection|Charmander|1}}|Fire||Common}}'
    );

    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: `https://example.invalid/${title}`, missing: false });
      return map;
    };

    const result = await harvestFromResolvedArticles({ queryImageInfo }, [blackCollection, whiteCollection]);

    expect(result.totalRows).toBe(2);
    expect(result.gen1Count).toBe(2);
    expect(result.cards.map((c) => c.name).sort()).toEqual(['Bulbasaur', 'Charmander']);
    expect(result.sourceArticleTitles).toEqual(['Black Collection (TCG)', 'White Collection (TCG)']);
    expect(result.realSetName).toBe('Black Collection / White Collection');
    // Each card's image guess used its OWN article's set name, not the other one's.
    expect(result.cards.find((c) => c.name === 'Bulbasaur')?.imageUrl).toContain('BlackCollection');
    expect(result.cards.find((c) => c.name === 'Charmander')?.imageUrl).toContain('WhiteCollection');
  });

  it('collapses to a single real set name (no " / ") for a single-article resolution', async () => {
    const article = resolvedArticle(
      'Fusion Arts (TCG)',
      '{{Setlist/entry|001/100|H|{{TCG ID|Fusion Arts|Squirtle|1}}|Water||Common}}'
    );
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };
    const result = await harvestFromResolvedArticles({ queryImageInfo }, [article]);
    expect(result.realSetName).toBe('Fusion Arts');
    expect(result.sourceArticleTitles).toEqual(['Fusion Arts (TCG)']);
  });

  it('returns zero totals for an empty article list without any network call', async () => {
    const queryImageInfo = async () => {
      throw new Error('should not be called');
    };
    const result = await harvestFromResolvedArticles({ queryImageInfo }, []);
    expect(result).toEqual({ totalRows: 0, gen1Count: 0, cards: [], realSetName: '', sourceArticleTitles: [] });
  });

  it('a section-targeted article contributes only its own section rows to the total', async () => {
    const shared = [
      '==Card list==',
      '{{Setlist/entry|001/10|H|{{TCG ID|Shared|EnglishCard|1}}|Grass||Common}}',
      '==Set list==',
      '{{Setlist/entry|001/10|I|{{TCG ID|Shared|JapaneseCard|1}}|Grass||C}}',
    ].join('\n');
    const article: ResolvedArticle = {
      title: 'Sword & Shield (TCG)',
      sectionTitle: 'Set list',
      fetchedTitle: 'Sword & Shield (TCG)',
      wikitext: shared,
      page: parseSetPageWikitext(shared, { sectionTitle: 'Set list' }),
    };
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };
    const result = await harvestFromResolvedArticles({ queryImageInfo }, [article]);
    expect(result.totalRows).toBe(1);
  });
});

describe('buildImageJobs', () => {
  function heldCard(overrides: Partial<CardRecord> = {}): CardRecord {
    return {
      id: 'base1-44',
      name: 'Bisasam',
      dexNumber: 1,
      setId: 'base1',
      setName: 'Grundset',
      localId: '44',
      rarity: 'Häufig',
      imageBase: '',
      language: 'de',
      ...overrides,
    };
  }

  it('selects only cards with no image at all, grouped by setId', () => {
    const db: Record<string, CardRecord[]> = {
      '1': [
        heldCard({ id: 'base1-44' }),
        heldCard({ id: 'base1-2', localId: '2', imageBase: 'https://example.invalid/2' }),
        heldCard({ id: 'base1-9', localId: '9', hostedThumbUrl: 'https://example.invalid/thumb.webp' }),
      ],
      '25': [heldCard({ id: 'dp3-77', setId: 'dp3', setName: 'DP3', localId: '77', dexNumber: 25, name: 'Pikachu' })],
    };

    const jobs = buildImageJobs(db, 'de');

    expect(jobs).toHaveLength(2);
    const base1Job = jobs.find((j) => j.setId === 'base1')!;
    expect(base1Job.language).toBe('de');
    expect(base1Job.setName).toBe('Grundset');
    expect(base1Job.cards).toEqual([{ cardId: 'base1-44', dexNumber: 1, name: 'Bisasam', localId: '44', rarity: 'Häufig' }]);
  });

  it('returns an empty array when nothing is missing an image', () => {
    const db: Record<string, CardRecord[]> = {
      '1': [heldCard({ imageBase: 'https://example.invalid/1' })],
    };
    expect(buildImageJobs(db, 'de')).toEqual([]);
  });

  it('sorts jobs by setId and cards within a job by numeric localId', () => {
    const db: Record<string, CardRecord[]> = {
      '1': [
        heldCard({ id: 'zzz-10', setId: 'zzz', localId: '10' }),
        heldCard({ id: 'zzz-2', setId: 'zzz', localId: '2' }),
        heldCard({ id: 'aaa-1', setId: 'aaa', localId: '1' }),
      ],
    };
    const jobs = buildImageJobs(db, 'de');
    expect(jobs.map((j) => j.setId)).toEqual(['aaa', 'zzz']);
    expect(jobs.find((j) => j.setId === 'zzz')!.cards.map((c) => c.localId)).toEqual(['2', '10']);
  });
});

describe('imageJobCardToGen1Row', () => {
  it('adapts a held card into a bare-name Gen1MatchedRow with no disambiguator', () => {
    const result = imageJobCardToGen1Row({ cardId: 'base1-44', dexNumber: 1, name: 'Bisasam', localId: '44', rarity: 'Häufig' });
    expect(result.dex).toEqual({ number: 1, name: 'Bisasam' });
    expect(result.row).toMatchObject({
      cardNumber: '44',
      displayName: 'Bisasam',
      cardArticleTitle: 'Bisasam',
      rarity: 'Häufig',
      originSetName: null,
    });
  });
});

describe('buildDeepImageQueue', () => {
  function heldCard(overrides: Partial<CardRecord> = {}): CardRecord {
    return {
      id: 'base1-44',
      name: 'Bisasam',
      dexNumber: 1,
      setId: 'base1',
      setName: 'Grundset',
      localId: '44',
      rarity: 'Häufig',
      imageBase: '',
      language: 'de',
      ...overrides,
    };
  }

  it('orders Gen1 ascending by dex, then Gen2 ascending, ... across every loaded generation file', () => {
    const files: LanguageGenerationFiles = new Map<number, Record<string, CardRecord[]>>([
      [
        1,
        {
          '25': [heldCard({ id: 'gen1-25', dexNumber: 25, name: 'Pikachu' })],
          '1': [heldCard({ id: 'gen1-1', dexNumber: 1, name: 'Bisasam' })],
        },
      ],
      [
        2,
        {
          '155': [heldCard({ id: 'gen2-155', dexNumber: 155, name: 'Feurigel' })],
          '152': [heldCard({ id: 'gen2-152', dexNumber: 152, name: 'Chikorita' })],
        },
      ],
    ]);

    const queue = buildDeepImageQueue(files);
    expect(queue.map((c) => c.cardId)).toEqual(['gen1-1', 'gen1-25', 'gen2-152', 'gen2-155']);
    expect(queue.map((c) => c.generation)).toEqual([1, 1, 2, 2]);
  });

  it('filters out any card that already has an image, by any of the three image fields', () => {
    const files: LanguageGenerationFiles = new Map([
      [
        1,
        {
          '1': [
            heldCard({ id: 'no-image' }),
            heldCard({ id: 'has-imageBase', imageBase: 'https://example.invalid/1' }),
            heldCard({ id: 'has-thumb', hostedThumbUrl: 'https://example.invalid/thumb.webp' }),
            heldCard({ id: 'has-full', hostedFullUrl: 'https://example.invalid/full.webp' }),
          ],
        },
      ],
    ]);
    const queue = buildDeepImageQueue(files);
    expect(queue.map((c) => c.cardId)).toEqual(['no-image']);
  });

  it('skips a generation with no loaded file entirely, rather than erroring', () => {
    const files: LanguageGenerationFiles = new Map([[1, { '1': [heldCard()] }]]);
    expect(() => buildDeepImageQueue(files)).not.toThrow();
    expect(buildDeepImageQueue(files)).toHaveLength(1);
  });

  it('carries setId/setName/rarity through onto each queued card', () => {
    const files: LanguageGenerationFiles = new Map([[1, { '1': [heldCard({ setId: 'base1', setName: 'Grundset', rarity: 'Häufig' })] }]]);
    const [queued] = buildDeepImageQueue(files);
    expect(queued).toMatchObject({ setId: 'base1', setName: 'Grundset', rarity: 'Häufig', localId: '44', name: 'Bisasam' });
  });
});

describe('chunkQueue', () => {
  it('splits into fixed-size chunks with a shorter final chunk', () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    expect(chunkQueue(items, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
  });

  it('defaults to DEEP_IMAGE_CHUNK_SIZE (25)', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const chunks = chunkQueue(items);
    expect(chunks[0]).toHaveLength(DEEP_IMAGE_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(5);
  });

  it('returns an empty array for an empty queue', () => {
    expect(chunkQueue([])).toEqual([]);
  });
});

describe('images-deep checkpointing', () => {
  it('isDeepImageCardDone reflects a recorded cardId, independent of chunk boundaries', () => {
    const progress: ProgressFile = {
      missingSets: {},
      enrich: {},
      images: {},
      imagesDeep: { en: { doneCardIds: { 'wk-en-a-1': true }, nextChunk: 3 } },
      failed: {},
    };
    expect(isDeepImageCardDone(progress, 'en', 'wk-en-a-1')).toBe(true);
    expect(isDeepImageCardDone(progress, 'en', 'wk-en-a-2')).toBe(false);
    expect(isDeepImageCardDone(progress, 'ja', 'wk-en-a-1')).toBe(false);
  });

  it('isDeepImageCardDone on a progress.json written before this job type existed (no imagesDeep bucket) is false, not a throw', () => {
    const legacyProgress = { missingSets: {}, enrich: {}, images: {}, failed: {} } as ProgressFile;
    expect(() => isDeepImageCardDone(legacyProgress, 'en', 'anything')).not.toThrow();
    expect(isDeepImageCardDone(legacyProgress, 'en', 'anything')).toBe(false);
  });

  it('selectPendingJobs composes with the queue + doneCardIds to resume mid-run regardless of chunk grouping', () => {
    function heldCard(overrides: Partial<CardRecord> = {}): CardRecord {
      return {
        id: 'a-1',
        name: 'X',
        dexNumber: 1,
        setId: 'a',
        setName: 'A',
        localId: '1',
        rarity: 'Unknown',
        imageBase: '',
        language: 'en',
        ...overrides,
      };
    }
    const files: LanguageGenerationFiles = new Map<number, Record<string, CardRecord[]>>([
      [
        1,
        {
          '1': [heldCard({ id: 'a-1', localId: '1' }), heldCard({ id: 'a-2', localId: '2' }), heldCard({ id: 'a-3', localId: '3' })],
        },
      ],
    ]);
    const queue = buildDeepImageQueue(files);
    const doneCardIds: Record<string, true> = { 'a-2': true };
    const pending = selectPendingJobs(queue, (c) => Boolean(doneCardIds[c.cardId]));
    // a-2 was "done" by a prior run even though it's in the MIDDLE of the
    // queue -- resume must skip it by cardId, not by a stale chunk offset.
    expect(pending.map((c) => c.cardId)).toEqual(['a-1', 'a-3']);
  });
});

describe('resolveImageJobCards', () => {
  it('resolves each held card in the job via the same candidate-guess strategy as a fresh harvest', async () => {
    const job = {
      language: 'de',
      setId: 'base1',
      setName: 'Grundset',
      cards: [{ cardId: 'base1-44', dexNumber: 1, name: 'Bisasam', localId: '44', rarity: 'Häufig' }],
    };
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) {
        const isRealFile = title === 'File:BisasamGrundset44.jpg';
        map.set(title, { fileTitle: title, url: isRealFile ? `https://example.invalid/${title}` : null, missing: !isRealFile });
      }
      return map;
    };

    const [resolved] = await resolveImageJobCards({ queryImageInfo }, job);

    expect(resolved).toEqual({
      cardId: 'base1-44',
      dexNumber: 1,
      localId: '44',
      imageFileTitle: 'File:BisasamGrundset44.jpg',
      imageUrl: 'https://example.invalid/File:BisasamGrundset44.jpg',
      imageMissing: false,
    });
  });

  it('marks a card imageMissing when no candidate resolves and no infobox client is given', async () => {
    const job = {
      language: 'de',
      setId: 'base1',
      setName: 'Grundset',
      cards: [{ cardId: 'base1-44', dexNumber: 1, name: 'Bisasam', localId: '44', rarity: null }],
    };
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };

    const [resolved] = await resolveImageJobCards({ queryImageInfo }, job);
    expect(resolved.imageMissing).toBe(true);
    expect(resolved.imageUrl).toBeNull();
  });

  it('preserves cardId/order alignment across multiple cards in one job', async () => {
    const job = {
      language: 'de',
      setId: 'base1',
      setName: 'Grundset',
      cards: [
        { cardId: 'base1-1', dexNumber: 1, name: 'Bisasam', localId: '1', rarity: null },
        { cardId: 'base1-2', dexNumber: 2, name: 'Bisaknosp', localId: '2', rarity: null },
      ],
    };
    const queryImageInfo = async (fileTitles: string[]) => {
      const map = new Map<string, WikiImageInfo>();
      for (const title of fileTitles) map.set(title, { fileTitle: title, url: null, missing: true });
      return map;
    };

    const resolved = await resolveImageJobCards({ queryImageInfo }, job);
    expect(resolved.map((c) => c.cardId)).toEqual(['base1-1', 'base1-2']);
    expect(resolved.map((c) => c.localId)).toEqual(['1', '2']);
  });
});

describe('computeEnrichmentFills', () => {
  const rows = parseSetPageWikitext(fixture('surging-sparks-card-list.wikitext')).cardListRows;
  const idIndex = new Map<string, Pick<CardRecord, 'localId'>>([
    ['held-exeggcute', { localId: '1' }],
    ['held-pikachu-57', { localId: '057' }],
    ['held-unmatched', { localId: '999' }],
  ]);

  it('fills rarity and setName when both are requested and a row matches by numerator', () => {
    const fills = computeEnrichmentFills(
      { cardIds: ['held-exeggcute'], needsRarity: true, needsSetName: true },
      rows,
      idIndex,
      'Surging Sparks'
    );
    expect(fills).toEqual([{ cardId: 'held-exeggcute', rarity: 'Common', setName: 'Surging Sparks' }]);
  });

  it('only fills the requested field', () => {
    const fills = computeEnrichmentFills(
      { cardIds: ['held-pikachu-57'], needsRarity: false, needsSetName: true },
      rows,
      idIndex,
      'Surging Sparks'
    );
    expect(fills).toEqual([{ cardId: 'held-pikachu-57', rarity: null, setName: 'Surging Sparks' }]);
  });

  it('drops a card id with no matching row', () => {
    const fills = computeEnrichmentFills(
      { cardIds: ['held-unmatched'], needsRarity: true, needsSetName: true },
      rows,
      idIndex,
      'Surging Sparks'
    );
    expect(fills).toEqual([]);
  });

  it('drops a card id not present in the index at all', () => {
    const fills = computeEnrichmentFills(
      { cardIds: ['not-held'], needsRarity: true, needsSetName: true },
      rows,
      idIndex,
      'Surging Sparks'
    );
    expect(fills).toEqual([]);
  });
});

describe('computeEnrichmentMatchRate', () => {
  const rows = parseSetPageWikitext(fixture('surging-sparks-card-list.wikitext')).cardListRows;

  it('returns 1 when every held card matches a parsed row by (zero-stripped) localId', () => {
    const idIndex = new Map<string, Pick<CardRecord, 'localId'>>([
      ['held-exeggcute', { localId: '001' }],
      ['held-pikachu-57', { localId: '57' }],
    ]);
    expect(computeEnrichmentMatchRate(['held-exeggcute', 'held-pikachu-57'], rows, idIndex)).toBe(1);
  });

  it('returns a fraction when only some held cards match', () => {
    const idIndex = new Map<string, Pick<CardRecord, 'localId'>>([
      ['held-exeggcute', { localId: '001' }],
      ['held-nomatch', { localId: '999' }],
    ]);
    expect(computeEnrichmentMatchRate(['held-exeggcute', 'held-nomatch'], rows, idIndex)).toBe(0.5);
  });

  it('returns 0 when no held card id resolves in the index at all', () => {
    const idIndex = new Map<string, Pick<CardRecord, 'localId'>>();
    expect(computeEnrichmentMatchRate(['not-held'], rows, idIndex)).toBe(0);
  });

  it('the below-threshold case that the enrichment guard is meant to catch', () => {
    // A wrong-article resolution: none of our held cards' localIds show up
    // in the (unrelated) parsed set list.
    const idIndex = new Map<string, Pick<CardRecord, 'localId'>>([
      ['held-a', { localId: '5' }],
      ['held-b', { localId: '6' }],
      ['held-c', { localId: '7' }],
    ]);
    const rate = computeEnrichmentMatchRate(['held-a', 'held-b', 'held-c'], rows, idIndex);
    expect(rate).toBeLessThan(ENRICHMENT_MATCH_THRESHOLD);
  });
});

describe('buildCardIdIndex', () => {
  it('indexes every record across every dex bucket by id', () => {
    const db: Record<string, CardRecord[]> = {
      '25': [
        {
          id: 'a',
          name: 'Pikachu',
          dexNumber: 25,
          setId: 's',
          setName: 'S',
          localId: '1',
          rarity: 'Common',
          imageBase: '',
          language: 'en',
        },
      ],
    };
    const index = buildCardIdIndex(db);
    expect(index.get('a')?.localId).toBe('1');
    expect(index.size).toBe(1);
  });
});

describe('checkpoint/resume', () => {
  it('emptyProgress starts with no completed jobs', () => {
    const progress = emptyProgress();
    expect(isMissingSetDone(progress, 'en', 'm11')).toBe(false);
    expect(isEnrichDone(progress, 'ja', 'SV2a')).toBe(false);
  });

  it('isMissingSetDone/isEnrichDone/isImagesDone reflect recorded completions', () => {
    const progress: ProgressFile = {
      missingSets: { en: { m11: { setName: 'X', gen1Count: 1, totalRows: 1, completedAt: 'now' } } },
      enrich: { ja: { SV2a: { needsRarity: true, needsSetName: false, appliedCount: 1, completedAt: 'now' } } },
      images: { de: { base1: { cardCount: 1, imagesResolved: 1, completedAt: 'now' } } },
      failed: {},
    };
    expect(isMissingSetDone(progress, 'en', 'm11')).toBe(true);
    expect(isMissingSetDone(progress, 'en', 'tt22')).toBe(false);
    expect(isEnrichDone(progress, 'ja', 'SV2a')).toBe(true);
    expect(isEnrichDone(progress, 'zh-tw', 'SV2a')).toBe(false);
    expect(isImagesDone(progress, 'de', 'base1')).toBe(true);
    expect(isImagesDone(progress, 'de', 'base2')).toBe(false);
  });

  it('recordMissingSetFailure/clearMissingSetFailure/isMissingSetFailed round-trip', () => {
    const progress = emptyProgress();
    expect(isMissingSetFailed(progress, 'en', 'pps1')).toBe(false);

    recordMissingSetFailure(progress, 'en', 'pps1', {
      setName: 'Play! Pokemon Prize Pack Series One (TCG)',
      reason: 'page does not exist',
      failedAt: 'now',
    });
    expect(isMissingSetFailed(progress, 'en', 'pps1')).toBe(true);
    expect(isMissingSetFailed(progress, 'en', 'pps2')).toBe(false);

    clearMissingSetFailure(progress, 'en', 'pps1');
    expect(isMissingSetFailed(progress, 'en', 'pps1')).toBe(false);
  });

  it('clearMissingSetFailure on a language/setId with no recorded failure is a harmless no-op', () => {
    const progress = emptyProgress();
    expect(() => clearMissingSetFailure(progress, 'en', 'nothing-there')).not.toThrow();
  });

  it('isMissingSetZeroRow reflects a completed job that produced zero rows, distinct from a genuine failure', () => {
    const progress: ProgressFile = {
      missingSets: {
        'zh-cn': {
          ardentobsidian: { setName: 'Ardent Obsidian', gen1Count: 0, totalRows: 0, completedAt: 'now' },
          gallantgalaxy: { setName: 'Gallant Galaxy', gen1Count: 48, totalRows: 354, completedAt: 'now' },
        },
      },
      enrich: {},
      images: {},
      failed: {},
    };
    expect(isMissingSetZeroRow(progress, 'zh-cn', 'ardentobsidian')).toBe(true);
    expect(isMissingSetZeroRow(progress, 'zh-cn', 'gallantgalaxy')).toBe(false);
    expect(isMissingSetZeroRow(progress, 'zh-cn', 'never-attempted')).toBe(false);
  });

  it('selectRetryTargets returns the union of recorded failures and zero-row completions for one language, deduplicated', () => {
    const progress: ProgressFile = {
      missingSets: {
        'zh-cn': {
          ardentobsidian: { setName: 'Ardent Obsidian', gen1Count: 0, totalRows: 0, completedAt: 'now' },
          gallantgalaxy: { setName: 'Gallant Galaxy', gen1Count: 48, totalRows: 354, completedAt: 'now' },
        },
        en: { m11: { setName: "McDonald's Collection", gen1Count: 0, totalRows: 21, completedAt: 'now' } },
      },
      enrich: {},
      images: {},
      failed: {
        en: {
          pps1: { setName: 'Play! Pokemon Prize Pack Series One (TCG)', reason: '404', failedAt: 'now' },
        },
      },
    };
    expect(selectRetryTargets(progress, 'zh-cn')).toEqual(['ardentobsidian']);
    expect(selectRetryTargets(progress, 'en')).toEqual(['pps1']);
    expect(selectRetryTargets(progress, 'th')).toEqual([]);
  });

  it('selectRetryTargets on a synthetic progress.json with no failed bucket at all (pre-migration shape) still works via zero-row records', () => {
    const legacyProgress = {
      missingSets: { en: { pop1: { setName: 'POP Series 1', gen1Count: 0, totalRows: 0, completedAt: 'now' } } },
      enrich: {},
      images: {},
    } as unknown as ProgressFile;
    expect(selectRetryTargets(legacyProgress, 'en')).toEqual(['pop1']);
  });

  it('selectPendingJobs drops done jobs and honors a limit', () => {
    const jobs = ['a', 'b', 'c', 'd'];
    const done = new Set(['b']);
    expect(selectPendingJobs(jobs, (j) => done.has(j))).toEqual(['a', 'c', 'd']);
    expect(selectPendingJobs(jobs, (j) => done.has(j), 2)).toEqual(['a', 'c']);
    expect(selectPendingJobs(jobs, (j) => done.has(j), 0)).toEqual([]);
  });
});

describe('parseArgs', () => {
  it('parses lang/job/limit/dry-run', () => {
    expect(parseArgs(['--lang', 'en', '--job', 'missing-sets', '--limit', '1', '--dry-run'])).toEqual({
      language: 'en',
      job: 'missing-sets',
      limit: 1,
      dryRun: true,
      dumpWikitext: false,
    });
  });

  it('defaults dryRun/dumpWikitext to false and limit to undefined', () => {
    expect(parseArgs(['--lang', 'ja', '--job', 'enrich'])).toEqual({
      language: 'ja',
      job: 'enrich',
      limit: undefined,
      dryRun: false,
      dumpWikitext: false,
    });
  });

  it('parses --dump-wikitext', () => {
    expect(parseArgs(['--lang', 'en', '--job', 'retry-failed', '--dump-wikitext'])).toEqual({
      language: 'en',
      job: 'retry-failed',
      limit: undefined,
      dryRun: false,
      dumpWikitext: true,
    });
  });

  it('accepts the "retry-failed" and "discover-zh-cn" jobs', () => {
    expect(parseArgs(['--lang', 'zh-cn', '--job', 'retry-failed']).job).toBe('retry-failed');
    expect(parseArgs(['--lang', 'zh-cn', '--job', 'discover-zh-cn']).job).toBe('discover-zh-cn');
  });

  it('throws when --lang is missing', () => {
    expect(() => parseArgs(['--job', 'enrich'])).toThrow(/Usage/);
  });

  it('throws when --job is missing or invalid', () => {
    expect(() => parseArgs(['--lang', 'en'])).toThrow(/--job is required/);
    expect(() => parseArgs(['--lang', 'en', '--job', 'bogus'])).toThrow(/--job must be/);
  });

  it('accepts the "images" job', () => {
    expect(parseArgs(['--lang', 'de', '--job', 'images'])).toEqual({
      language: 'de',
      job: 'images',
      limit: undefined,
      dryRun: false,
      dumpWikitext: false,
    });
  });

  it('accepts the "images-deep" job', () => {
    expect(parseArgs(['--lang', 'en', '--job', 'images-deep', '--limit', '40'])).toEqual({
      language: 'en',
      job: 'images-deep',
      limit: 40,
      dryRun: false,
      dumpWikitext: false,
    });
  });

  it('throws on a negative or non-integer limit', () => {
    expect(() => parseArgs(['--lang', 'en', '--job', 'enrich', '--limit', '-1'])).toThrow(/--limit/);
    expect(() => parseArgs(['--lang', 'en', '--job', 'enrich', '--limit', 'x'])).toThrow(/--limit/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--lang', 'en', '--job', 'enrich', '--bogus'])).toThrow(/Unknown option/);
  });
});

describe('resolveZhCnSetId', () => {
  it('keeps the mapping proposal when the infobox carries no CS code', () => {
    expect(resolveZhCnSetId('ardentobsidian', null)).toEqual({ setId: 'ardentobsidian', mismatched: false });
  });

  it('keeps the mapping proposal when the infobox CS code agrees (case/format-insensitively)', () => {
    expect(resolveZhCnSetId('cs35', 'CS35')).toEqual({ setId: 'cs35', mismatched: false });
  });

  it('prefers the infobox CS code and flags a mismatch when the mapping guessed wrong', () => {
    expect(resolveZhCnSetId('scorchingskies', 'CS35')).toEqual({ setId: 'cs35', mismatched: true });
  });
});

describe('end-to-end: zh-cn (ATCG) fixture', () => {
  it('parses the infobox and set list, Gen1-filters the rows, and resolves the CS code -- all from static fixtures, no network', () => {
    const infoboxWikitext = fixture('zh-cn-gallant-galaxy-infobox.wikitext');
    const setListWikitext = fixture('zh-cn-gallant-galaxy-set-list.wikitext');

    const { setInfo } = parseSetPageWikitext(infoboxWikitext);
    const { cardListRows } = parseSetPageWikitext(setListWikitext);

    expect(deriveSetNameFromArticleTitle('Gallant Galaxy (ATCG)')).toBe('Gallant Galaxy');
    expect(extractCsCode(setInfo)).toBe('CS5a');

    const gen1Rows = filterGen1Rows(cardListRows);
    expect(gen1Rows.map((m) => m.dex.name)).toEqual(['Charmander', 'Magikarp']);
    expect(gen1Rows.every((m) => m.row.cardArticleTitle.includes('Miraidon'))).toBe(false);

    const resolution = resolveZhCnSetId('gallantgalaxy', extractCsCode(setInfo));
    expect(resolution).toEqual({ setId: 'cs5a', mismatched: true });
  });
});

describe('matchDeepCardsToSetRows', () => {
  function row(overrides: Partial<SetlistRow> = {}): SetlistRow {
    return {
      cardNumber: 'SM198',
      regulationMark: null,
      displayName: 'Bulbasaur',
      cardArticleTitle: 'Bulbasaur (SM Promo 198)',
      primaryType: null,
      secondaryField: null,
      rarity: null,
      promoNote: null,
      nameSource: 'tcgIdMacro',
      originSetName: null,
      ...overrides,
    };
  }
  function deepCard(overrides: Partial<DeepImageJobCard> = {}): DeepImageJobCard {
    return {
      cardId: 'smp-SM198',
      dexNumber: 1,
      generation: 1,
      name: 'Bulbasaur',
      localId: 'SM198',
      rarity: null,
      setId: 'smp',
      setName: 'SM Black Star Promos',
      ...overrides,
    };
  }

  it('matches a held card to its row by exact normalized code, zero-padding notwithstanding', () => {
    const rows = [row({ cardNumber: '1/12', cardArticleTitle: "Weedle (McDonald's Collection 1)" })];
    const cards = [deepCard({ cardId: '2014xy-1', localId: '1', name: 'Weedle', setName: "McDonald's Collection 2014" })];
    const matches = matchDeepCardsToSetRows(cards, rows, "McDonald's Collection 2014");
    expect(matches).toHaveLength(1);
    expect(matches[0].row.cardArticleTitle).toBe("Weedle (McDonald's Collection 1)");
  });

  it('matches prefix-tolerantly via the row article title context when the row number is bare', () => {
    const rows = [row({ cardNumber: '198', cardArticleTitle: 'Bulbasaur (SM Promo 198)' })];
    const matches = matchDeepCardsToSetRows([deepCard()], rows, 'SM Black Star Promos');
    expect(matches).toHaveLength(1);
  });

  it('leaves a card unmatched rather than guessing when no row code agrees', () => {
    const rows = [row({ cardNumber: 'SM199' })];
    expect(matchDeepCardsToSetRows([deepCard()], rows, 'SM Black Star Promos')).toHaveLength(0);
  });

  it('never lets one row satisfy two cards', () => {
    const rows = [row()];
    const cards = [deepCard(), deepCard({ cardId: 'dup' })];
    expect(matchDeepCardsToSetRows(cards, rows, 'SM Black Star Promos')).toHaveLength(1);
  });
});

describe('buildDeepSetArticleCandidates', () => {
  it('leads with the plain (TCG) title and includes orthographic variants', () => {
    const candidates = buildDeepSetArticleCandidates('Pokemon GO');
    expect(candidates[0]).toBe('Pokemon GO (TCG)');
    expect(candidates).toContain('Pokémon GO (TCG)');
  });
});
