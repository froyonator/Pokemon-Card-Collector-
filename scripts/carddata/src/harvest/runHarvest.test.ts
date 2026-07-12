// scripts/carddata/src/harvest/runHarvest.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { deriveSetNameFromArticleTitle, extractCsCode, parseSetPageWikitext } from './setlistParser';
import type { SetlistRow, WikiImageInfo, WikiPageWikitext } from './types';
import {
  buildCardIdIndex,
  buildRowImageCandidates,
  computeEnrichmentFills,
  computeEnrichmentMatchRate,
  deriveImageGuessCardName,
  emptyProgress,
  ENRICHMENT_MATCH_THRESHOLD,
  extractNumerator,
  filterGen1Rows,
  isEnrichDone,
  isMissingSetDone,
  matchGen1DexEntry,
  normalizeNumerator,
  parseArgs,
  resolveHarvestedCardImages,
  resolveZhCnSetId,
  selectPendingJobs,
  type ProgressFile,
} from './runHarvest';

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

  it('isMissingSetDone/isEnrichDone reflect recorded completions', () => {
    const progress: ProgressFile = {
      missingSets: { en: { m11: { setName: 'X', gen1Count: 1, totalRows: 1, completedAt: 'now' } } },
      enrich: { ja: { SV2a: { needsRarity: true, needsSetName: false, appliedCount: 1, completedAt: 'now' } } },
    };
    expect(isMissingSetDone(progress, 'en', 'm11')).toBe(true);
    expect(isMissingSetDone(progress, 'en', 'tt22')).toBe(false);
    expect(isEnrichDone(progress, 'ja', 'SV2a')).toBe(true);
    expect(isEnrichDone(progress, 'zh-tw', 'SV2a')).toBe(false);
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
    });
  });

  it('defaults dryRun to false and limit to undefined', () => {
    expect(parseArgs(['--lang', 'ja', '--job', 'enrich'])).toEqual({
      language: 'ja',
      job: 'enrich',
      limit: undefined,
      dryRun: false,
    });
  });

  it('throws when --lang is missing', () => {
    expect(() => parseArgs(['--job', 'enrich'])).toThrow(/Usage/);
  });

  it('throws when --job is missing or invalid', () => {
    expect(() => parseArgs(['--lang', 'en'])).toThrow(/--job is required/);
    expect(() => parseArgs(['--lang', 'en', '--job', 'bogus'])).toThrow(/--job must be/);
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
