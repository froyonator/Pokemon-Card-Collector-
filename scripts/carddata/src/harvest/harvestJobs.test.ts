// scripts/carddata/src/harvest/harvestJobs.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildMissingSetJobs,
  deriveProposedSetId,
  deriveWikiArticleTitle,
  type GapManifest,
} from './harvestJobs';

describe('deriveWikiArticleTitle', () => {
  it('appends the (TCG) namespace for a main-language set', () => {
    expect(deriveWikiArticleTitle("McDonald's Collection 2011", 'en')).toBe(
      "McDonald's Collection 2011 (TCG)"
    );
  });

  it('strips a gap-audit gloss parenthetical before appending the namespace', () => {
    expect(deriveWikiArticleTitle('ADV Expansion Pack (EX Ruby & Sapphire JP)', 'ja')).toBe(
      'ADV Expansion Pack (TCG)'
    );
  });

  it('uses the (ATCG) namespace for regional-catalog languages', () => {
    expect(deriveWikiArticleTitle('First Impact', 'id')).toBe('First Impact (ATCG)');
    expect(deriveWikiArticleTitle('First Impact', 'th')).toBe('First Impact (ATCG)');
  });
});

describe('deriveProposedSetId', () => {
  it('lowercases and strips punctuation from a manifest code', () => {
    expect(deriveProposedSetId({ name: "McDonald's Collection 2011", code: 'M11' })).toBe('m11');
    expect(deriveProposedSetId({ name: 'Trick or Trade 2022', code: 'TT22' })).toBe('tt22');
  });

  it('takes only the first sub-code of a split regional code', () => {
    expect(deriveProposedSetId({ name: 'First Impact', code: 'AS1a / AS1b' })).toBe('as1a');
  });

  it('falls back to a compact slug of the name when there is no code', () => {
    expect(
      deriveProposedSetId({ name: 'ADV Expansion Pack (EX Ruby & Sapphire JP)', code: null })
    ).toBe('advexpansionpack');
  });

  it('never returns an empty string', () => {
    expect(deriveProposedSetId({ name: '!!!', code: null })).toBe('set');
  });
});

describe('buildMissingSetJobs', () => {
  const manifest: GapManifest = {
    languages: {
      en: {
        missingSets: [
          { name: "McDonald's Collection 2011", code: 'M11', cardCount: 12, releaseDate: 'June 17, 2011' },
          { name: 'POP Series 1', code: 'POP1', cardCount: 17, releaseDate: 'September 2004' },
        ],
      },
      ja: {
        missingSets: [{ name: 'Some Old Set (Some EN Set JP)', code: null, cardCount: 55, releaseDate: null }],
      },
      fr: { missingSets: [{ name: 'Should Not Appear', code: 'X1', cardCount: 1, releaseDate: null }] },
    },
  };

  it('builds one job per missingSets entry across the requested languages only', () => {
    const jobs = buildMissingSetJobs(manifest, ['en', 'ja']);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((job) => job.language !== 'fr')).toBe(true);
  });

  it('carries setName, proposedSetId, cardCount, and releaseDate through', () => {
    const [first] = buildMissingSetJobs(manifest, ['en']);
    expect(first).toEqual({
      language: 'en',
      setName: "McDonald's Collection 2011 (TCG)",
      proposedSetId: 'm11',
      cardCount: 12,
      releaseDate: 'June 17, 2011',
    });
  });

  it('defaults cardCount/releaseDate to null when absent', () => {
    const manifestNoCounts: GapManifest = {
      languages: { en: { missingSets: [{ name: 'Bare Set', code: null }] } },
    };
    const [job] = buildMissingSetJobs(manifestNoCounts, ['en']);
    expect(job.cardCount).toBeNull();
    expect(job.releaseDate).toBeNull();
  });

  it('returns an empty list for a language with no missingSets entry', () => {
    expect(buildMissingSetJobs({ languages: {} }, ['en'])).toEqual([]);
  });

  it('defaults to en/ja/id/th when no languages are passed', () => {
    const jobs = buildMissingSetJobs(manifest);
    expect(jobs.some((job) => job.language === 'fr')).toBe(false);
    expect(jobs.some((job) => job.language === 'en')).toBe(true);
  });
});
