// scripts/carddata/src/harvest/zhCnDiscovery.test.ts
import { describe, expect, it } from 'vitest';
import { mergeDiscoveredZhCnArticles, slugifyArticleTitle } from './zhCnDiscovery';
import type { ZhCnArticleMappingFile } from './harvestJobs';
import type { WikiSearchResult } from './types';

describe('slugifyArticleTitle', () => {
  it('strips the (ATCG) suffix and slugifies the rest', () => {
    expect(slugifyArticleTitle('Polychromatic Gathering (ATCG)')).toBe('polychromatic-gathering');
  });

  it('handles punctuation inside the title', () => {
    expect(slugifyArticleTitle("Gem Pack Vol. 5 (ATCG)")).toBe('gem-pack-vol-5');
  });

  it('never returns an empty string', () => {
    expect(slugifyArticleTitle('??? (ATCG)')).toBe('set');
  });
});

describe('mergeDiscoveredZhCnArticles', () => {
  const baseMapping: ZhCnArticleMappingFile = {
    sets: [
      { key: 'gallant-galaxy', articleTitle: 'Gallant Galaxy (ATCG)', csCode: 'CS5a / CS5b', notes: 'curated' },
      { key: 'scorching-skies', articleTitle: 'Scorching Skies (ATCG)', csCode: 'CS35', notes: 'curated' },
      { key: 'cs-series-unmatched-remainder', articleTitle: null, csCode: null, notes: 'unresolved bucket' },
    ],
  };

  it('appends a new entry per not-already-known (ATCG) title', () => {
    const discovered: WikiSearchResult[] = [{ title: 'Brand New Set (ATCG)' }];
    const result = mergeDiscoveredZhCnArticles(baseMapping, discovered);
    expect(result.addedCount).toBe(1);
    expect(result.addedKeys).toEqual(['brand-new-set']);
    expect(result.mapping.sets).toHaveLength(4);
    expect(result.mapping.sets.at(-1)).toMatchObject({
      key: 'brand-new-set',
      articleTitle: 'Brand New Set (ATCG)',
      csCode: null,
    });
  });

  it('never overwrites or duplicates an already-known article title (case-insensitive)', () => {
    const discovered: WikiSearchResult[] = [{ title: 'gallant galaxy (atcg)' }, { title: 'Scorching Skies (ATCG)' }];
    const result = mergeDiscoveredZhCnArticles(baseMapping, discovered);
    expect(result.addedCount).toBe(0);
    expect(result.mapping.sets).toEqual(baseMapping.sets);
  });

  it('skips a search hit that is not actually in the (ATCG) namespace', () => {
    const discovered: WikiSearchResult[] = [{ title: 'Some Unrelated Page' }];
    const result = mergeDiscoveredZhCnArticles(baseMapping, discovered);
    expect(result.addedCount).toBe(0);
  });

  it('disambiguates a slug collision with an existing key by appending a numeric suffix', () => {
    const mapping: ZhCnArticleMappingFile = {
      sets: [{ key: 'brand-new-set', articleTitle: 'Old Different Title (ATCG)', csCode: null, notes: 'curated' }],
    };
    const discovered: WikiSearchResult[] = [{ title: 'Brand New Set (ATCG)' }];
    const result = mergeDiscoveredZhCnArticles(mapping, discovered);
    expect(result.addedKeys).toEqual(['brand-new-set-2']);
  });

  it('leaves every existing entry, including unresolved null-article ones, completely untouched', () => {
    const result = mergeDiscoveredZhCnArticles(baseMapping, []);
    expect(result.mapping.sets).toEqual(baseMapping.sets);
    expect(result.addedCount).toBe(0);
  });
});
