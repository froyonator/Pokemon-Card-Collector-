// scripts/carddata/src/harvest/runHarvest.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { parseSetPageWikitext } from './setlistParser';
import type { WikiImageInfo } from './types';
import {
  buildCardIdIndex,
  computeEnrichmentFills,
  deriveImageGuessCardName,
  emptyProgress,
  extractNumerator,
  filterGen1Rows,
  isEnrichDone,
  isMissingSetDone,
  matchGen1DexEntry,
  normalizeNumerator,
  parseArgs,
  resolveHarvestedCardImages,
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
