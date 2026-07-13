// scripts/carddata/src/harvest/harvestJobs.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildMissingSetJobs,
  buildZhCnJobs,
  deriveProposedSetId,
  deriveWikiArticleTitle,
  deriveZhCnSetId,
  type GapManifest,
  type ZhCnArticleMappingFile,
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

describe('buildMissingSetJobs for the European languages (fr/de/es/it/pt)', () => {
  // These manifest entries use ENGLISH set names (the gap audit diffs
  // fr/de/es/it/pt structurally against en.json's setId universe -- see
  // GAP-REPORT.md Part 3), which is exactly what deriveWikiArticleTitle
  // expects for a non-regional-namespace language.
  const euManifest: GapManifest = {
    languages: {
      fr: {
        missingSets: [
          { name: 'Base Set 2', code: 'base4', cardCount: 100, releaseDate: 'February 24, 2000' },
          { name: 'Legendary Collection', code: 'lc', cardCount: 99, releaseDate: 'May 24, 2002' },
        ],
      },
      pt: {
        missingSets: [{ name: 'Base Set', code: 'base1', cardCount: 69, releaseDate: 'January 9, 1999' }],
      },
    },
  };

  it('produces the ordinary "(TCG)" article title (not the ATCG regional namespace) for each EU language', () => {
    for (const language of ['fr', 'de', 'es', 'it', 'pt']) {
      expect(deriveWikiArticleTitle('Base Set 2', language)).toBe('Base Set 2 (TCG)');
    }
  });

  it('builds jobs for fr with the manifest code used verbatim as proposedSetId', () => {
    const jobs = buildMissingSetJobs(euManifest, ['fr']);
    expect(jobs).toEqual([
      { language: 'fr', setName: 'Base Set 2 (TCG)', proposedSetId: 'base4', cardCount: 100, releaseDate: 'February 24, 2000' },
      { language: 'fr', setName: 'Legendary Collection (TCG)', proposedSetId: 'lc', cardCount: 99, releaseDate: 'May 24, 2002' },
    ]);
  });

  it('builds jobs independently per EU language, each scoped to its own manifest entries', () => {
    const jobs = buildMissingSetJobs(euManifest, ['fr', 'pt']);
    expect(jobs.filter((j) => j.language === 'fr')).toHaveLength(2);
    expect(jobs.filter((j) => j.language === 'pt')).toHaveLength(1);
    expect(jobs.find((j) => j.language === 'pt')?.proposedSetId).toBe('base1');
  });

  it('is a no-op (empty list) for an EU language with no manifest entries', () => {
    expect(buildMissingSetJobs(euManifest, ['de'])).toEqual([]);
  });
});

describe('deriveZhCnSetId', () => {
  it('lowercases and strips punctuation from a single csCode', () => {
    expect(deriveZhCnSetId({ csCode: 'CS35', key: 'scorching-skies', articleTitle: 'Scorching Skies (ATCG)' })).toBe(
      'cs35'
    );
  });

  it('takes only the first sub-code of a split csCode', () => {
    expect(
      deriveZhCnSetId({ csCode: 'CS5a / CS5b', key: 'gallant-galaxy', articleTitle: 'Gallant Galaxy (ATCG)' })
    ).toBe('cs5a');
  });

  it('falls back to a compact slug of the article title when csCode is null', () => {
    expect(
      deriveZhCnSetId({ csCode: null, key: 'collection-151', articleTitle: 'Collection 151 (ATCG)' })
    ).toBe('collection151');
  });

  it('falls back to a compact slug of the mapping key when there is no article title either', () => {
    expect(deriveZhCnSetId({ csCode: null, key: 'sv-era-promo-packs', articleTitle: null })).toBe('sverapromopacks');
  });
});

describe('buildZhCnJobs', () => {
  const mapping: ZhCnArticleMappingFile = {
    sets: [
      {
        key: 'scorching-skies',
        articleTitle: 'Scorching Skies (ATCG)',
        csCode: 'CS35',
        notes: 'sample-parsed',
        cardCount: 90,
      },
      {
        key: 'gallant-galaxy',
        articleTitle: 'Gallant Galaxy (ATCG)',
        csCode: 'CS5a / CS5b',
        notes: 'sample-parsed, two subsets',
      },
      {
        key: 'ardent-obsidian',
        articleTitle: 'Ardent Obsidian (ATCG)',
        csCode: null,
        notes: 'in the 29-article search, code unconfirmed',
      },
      {
        key: 'sv-era-promo-packs',
        articleTitle: null,
        csCode: null,
        notes: 'no known article found in this recon pass',
      },
    ],
  };

  it('builds a job per entry with a known article title, using it verbatim as setName', () => {
    const { jobs } = buildZhCnJobs(mapping);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((job) => job.language === 'zh-cn')).toBe(true);
    expect(jobs.map((job) => job.setName)).toEqual([
      'Scorching Skies (ATCG)',
      'Gallant Galaxy (ATCG)',
      'Ardent Obsidian (ATCG)',
    ]);
  });

  it('derives proposedSetId per entry (code-derived, sub-code, and name-slug fallback)', () => {
    const { jobs } = buildZhCnJobs(mapping);
    expect(jobs.map((job) => job.proposedSetId)).toEqual(['cs35', 'cs5a', 'ardentobsidian']);
  });

  it('carries cardCount through when the mapping recorded one, else null', () => {
    const { jobs } = buildZhCnJobs(mapping);
    expect(jobs[0].cardCount).toBe(90);
    expect(jobs[1].cardCount).toBeNull();
  });

  it('routes null-article entries to unresolved instead of producing a job', () => {
    const { jobs, unresolved } = buildZhCnJobs(mapping);
    expect(jobs.some((job) => job.setName === null)).toBe(false);
    expect(unresolved).toEqual([
      { key: 'sv-era-promo-packs', notes: 'no known article found in this recon pass' },
    ]);
  });

  it('returns empty jobs/unresolved for an empty mapping', () => {
    expect(buildZhCnJobs({ sets: [] })).toEqual({ jobs: [], unresolved: [] });
  });
});
