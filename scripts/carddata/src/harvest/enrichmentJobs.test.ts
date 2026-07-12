// scripts/carddata/src/harvest/enrichmentJobs.test.ts
import { describe, expect, it } from 'vitest';
import { buildEnrichmentJobs, type LocalIncompleteManifest } from './enrichmentJobs';

const manifest: LocalIncompleteManifest = {
  languages: {
    ja: {
      issues: {
        rarityMissing: {
          count: 3,
          bySet: {
            SV2a: ['SV2a-166', 'SV2a-167'],
            'BW4-B': ['jpo-1'],
          },
        },
        setNameIsBareCode: {
          count: 2,
          bySet: {
            'BW4-B': ['jpo-1', 'jpo-2'],
          },
        },
      },
    },
    'zh-tw': {
      issues: {
        rarityMissing: {
          count: 2,
          bySet: { SV2a: ['two-1', 'two-2'] },
        },
      },
    },
    en: {
      issues: {
        rarityMissing: { count: 1, bySet: { XYZ: ['en-1'] } },
      },
    },
  },
};

describe('buildEnrichmentJobs', () => {
  it('builds one job per (language, setId) pair with at least one issue', () => {
    const jobs = buildEnrichmentJobs(manifest, ['ja', 'zh-tw']);
    const keys = jobs.map((j) => `${j.language}:${j.setId}`).sort();
    expect(keys).toEqual(['ja:BW4-B', 'ja:SV2a', 'zh-tw:SV2a']);
  });

  it('unions rarity and bare-code card ids for a set affected by both issues', () => {
    const jobs = buildEnrichmentJobs(manifest, ['ja']);
    const bw4b = jobs.find((j) => j.setId === 'BW4-B');
    expect(bw4b).toMatchObject({ needsRarity: true, needsSetName: true });
    expect(bw4b?.cardIds.sort()).toEqual(['jpo-1', 'jpo-2']);
  });

  it('marks needsSetName false for a set only affected by rarity', () => {
    const jobs = buildEnrichmentJobs(manifest, ['ja']);
    const sv2a = jobs.find((j) => j.setId === 'SV2a');
    expect(sv2a).toMatchObject({ needsRarity: true, needsSetName: false });
    expect(sv2a?.cardIds.sort()).toEqual(['SV2a-166', 'SV2a-167']);
  });

  it('does not build jobs for a language outside the requested list, even with issues', () => {
    const jobs = buildEnrichmentJobs(manifest, ['ja', 'zh-tw']);
    expect(jobs.some((j) => j.language === 'en')).toBe(false);
  });

  it('defaults to ja/zh-tw when no languages are passed', () => {
    const jobs = buildEnrichmentJobs(manifest);
    expect(jobs.some((j) => j.language === 'en')).toBe(false);
    expect(jobs.some((j) => j.language === 'ja')).toBe(true);
    expect(jobs.some((j) => j.language === 'zh-tw')).toBe(true);
  });

  it('returns an empty list when a requested language has no issues at all', () => {
    expect(buildEnrichmentJobs({ languages: {} }, ['ja'])).toEqual([]);
  });
});
