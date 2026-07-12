// scripts/carddata/src/harvest/retryResolution.test.ts
import { describe, expect, it } from 'vitest';
import {
  lookupOverride,
  overrideKey,
  pickBestSearchCandidate,
  resolveJobArticles,
  scoreSearchCandidate,
  type ArticleOverrideFile,
} from './retryResolution';
import type { WikiPageWikitext, WikiSearchResult } from './types';

function page(title: string, wikitext: string): WikiPageWikitext {
  return { title, pageId: 1, wikitext };
}

const ROW = (name: string, set: string) =>
  `{{Setlist/entry|001/10|H|{{TCG ID|${set}|${name}|1}}|Grass||Common}}`;

describe('overrideKey / lookupOverride', () => {
  const overrides: ArticleOverrideFile = {
    'ja:blackwhitecollection': { articles: [{ title: 'Black Collection (TCG)' }], note: 'test' },
  };

  it('builds the "lang:setId" key', () => {
    expect(overrideKey('ja', 'blackwhitecollection')).toBe('ja:blackwhitecollection');
  });

  it('looks up an entry by language+setId', () => {
    expect(lookupOverride(overrides, 'ja', 'blackwhitecollection')?.note).toBe('test');
  });

  it('returns null for an unknown entry', () => {
    expect(lookupOverride(overrides, 'ja', 'nope')).toBeNull();
  });
});

describe('scoreSearchCandidate / pickBestSearchCandidate', () => {
  it('scores full token overlap plus the namespace-suffix bonus above a partial match', () => {
    const full = scoreSearchCandidate('Fusion Arts (TCG)', 'Fusion Arts', 'TCG');
    const partial = scoreSearchCandidate('Fusion Something Else (TCG)', 'Fusion Arts', 'TCG');
    expect(full).toBeGreaterThan(partial);
    expect(full).toBeGreaterThan(1); // 1.0 overlap + 0.25 suffix bonus
  });

  it('scores 0 for a candidate sharing no tokens with the target', () => {
    expect(scoreSearchCandidate('Completely Unrelated (TCG)', 'Fusion Arts', 'TCG')).toBe(0);
  });

  it('picks the highest-scoring candidate', () => {
    const results: WikiSearchResult[] = [
      { title: 'Fusion Something Else (TCG)' },
      { title: 'Fusion Arts (TCG)' },
    ];
    const best = pickBestSearchCandidate(results, 'Fusion Arts', 'TCG');
    expect(best?.title).toBe('Fusion Arts (TCG)');
  });

  it('returns null when every candidate scores 0', () => {
    const results: WikiSearchResult[] = [{ title: 'Completely Unrelated (TCG)' }];
    expect(pickBestSearchCandidate(results, 'Fusion Arts', 'TCG')).toBeNull();
  });

  it('returns null for an empty result list', () => {
    expect(pickBestSearchCandidate([], 'Fusion Arts', 'TCG')).toBeNull();
  });
});

describe('resolveJobArticles: fallback chain ordering', () => {
  it('resolves directly when the original title works (no variant/override/search attempted)', async () => {
    const client = {
      parsePageWikitext: async (title: string) => page(title, ROW('Direct Card', 'Direct Set')),
      searchPageTitles: async () => {
        throw new Error('should not be called');
      },
    };
    const result = await resolveJobArticles(client, {
      language: 'en',
      setId: 'x',
      articleTitle: 'Direct Set (TCG)',
      targetName: 'Direct Set',
      expectedSuffix: 'TCG',
      overrides: {},
    });
    expect(result.resolution?.method).toBe('direct');
    expect(result.attempts).toEqual(['Direct Set (TCG)']);
  });

  it('falls to an orthographic variant when the direct title 404s (the real en pps1-9 fix)', async () => {
    const client = {
      parsePageWikitext: async (title: string) => {
        if (title === 'Play! Pokémon Prize Pack Series One (TCG)') {
          return page(title, ROW('Promo Card', 'Play! Pokémon Prize Pack Series One'));
        }
        throw new Error('page does not exist');
      },
      searchPageTitles: async () => {
        throw new Error('should not be called');
      },
    };
    const result = await resolveJobArticles(client, {
      language: 'en',
      setId: 'pps1',
      articleTitle: 'Play! Pokemon Prize Pack Series One (TCG)',
      targetName: 'Play! Pokemon Prize Pack Series One',
      expectedSuffix: 'TCG',
      overrides: {},
    });
    expect(result.resolution?.method).toBe('variant');
    expect(result.resolution?.articles[0].fetchedTitle).toBe('Play! Pokémon Prize Pack Series One (TCG)');
    expect(result.log.some((l) => l.includes('orthographic'))).toBe(true);
  });

  it('falls to the override mapping and concatenates rows from multiple articles when direct+variants fail', async () => {
    const client = {
      parsePageWikitext: async (title: string) => {
        if (title === 'Black Collection (TCG)') return page(title, ROW('Card A', 'Black Collection'));
        if (title === 'White Collection (TCG)') return page(title, ROW('Card B', 'White Collection'));
        throw new Error('page does not exist');
      },
      searchPageTitles: async () => {
        throw new Error('should not be called');
      },
    };
    const overrides: ArticleOverrideFile = {
      'ja:blackwhitecollection': {
        articles: [{ title: 'Black Collection (TCG)' }, { title: 'White Collection (TCG)' }],
        note: 'paired set',
      },
    };
    const result = await resolveJobArticles(client, {
      language: 'ja',
      setId: 'blackwhitecollection',
      articleTitle: 'Black/White Collection (TCG)',
      targetName: 'Black/White Collection',
      expectedSuffix: 'TCG',
      overrides,
    });
    expect(result.resolution?.method).toBe('override');
    expect(result.resolution?.articles).toHaveLength(2);
    const names = result.resolution?.articles.flatMap((a) => a.page.cardListRows.map((r) => r.displayName));
    expect(names?.sort()).toEqual(['Card A', 'Card B']);
    expect(result.log.some((l) => l.includes('paired set'))).toBe(true);
  });

  it('applies sectionTitle targeting on an override article', async () => {
    const shared = [
      '==Card list==',
      ROW('EN Card', 'Shared'),
      '==Set list==',
      ROW('JP Card', 'Shared'),
    ].join('\n');
    const client = {
      parsePageWikitext: async (title: string) => {
        if (title === 'Sword & Shield (TCG)') return page(title, shared);
        throw new Error('page does not exist');
      },
      searchPageTitles: async () => {
        throw new Error('should not be called');
      },
    };
    const overrides: ArticleOverrideFile = {
      'ja:swordshieldjpbaseset': {
        articles: [{ title: 'Sword & Shield (TCG)', sectionTitle: 'Set list' }],
        note: 'shared article, JP section',
      },
    };
    const result = await resolveJobArticles(client, {
      language: 'ja',
      setId: 'swordshieldjpbaseset',
      articleTitle: 'Sword/Shield JP base set (TCG)',
      targetName: 'Sword/Shield JP base set',
      expectedSuffix: 'TCG',
      overrides,
    });
    expect(result.resolution?.method).toBe('override');
    const rows = result.resolution?.articles[0].page.cardListRows ?? [];
    expect(rows.map((r) => r.displayName)).toEqual(['JP Card']);
  });

  it('falls to a scored title search when direct+variant+override all fail, and logs which candidate was picked', async () => {
    // The guessed title is simply wrong (not just a spelling/namespace
    // fork titleVariants would catch), so direct + every generated variant
    // all 404 and only the search stage finds the real article.
    const client = {
      parsePageWikitext: async (title: string) => {
        if (title === 'Fusion Arts (TCG)') return page(title, ROW('Fusion Result', 'Fusion Arts'));
        throw new Error('page does not exist');
      },
      searchPageTitles: async (): Promise<WikiSearchResult[]> => [
        { title: 'Fusion Something Else (TCG)' },
        { title: 'Fusion Arts (TCG)' },
      ],
    };
    const result = await resolveJobArticles(client, {
      language: 'id',
      setId: 's8i',
      articleTitle: 'Ghostly Wrong Guess (TCG)',
      targetName: 'Fusion Arts',
      expectedSuffix: 'TCG',
      overrides: {},
    });
    expect(result.resolution?.method).toBe('search');
    expect(result.resolution?.articles[0].fetchedTitle).toBe('Fusion Arts (TCG)');
    expect(result.log.some((l) => l.includes('Fusion Arts (TCG)'))).toBe(true);
  });

  it('reports fully unresolved (resolution: null) with every attempted title when nothing works', async () => {
    const client = {
      parsePageWikitext: async () => {
        throw new Error('page does not exist');
      },
      searchPageTitles: async (): Promise<WikiSearchResult[]> => [],
    };
    const result = await resolveJobArticles(client, {
      language: 'ja',
      setId: 'ghost-set',
      articleTitle: 'Ghost Set (TCG)',
      targetName: 'Ghost Set',
      expectedSuffix: 'TCG',
      overrides: {},
    });
    expect(result.resolution).toBeNull();
    expect(result.attempts).toContain('Ghost Set (TCG)');
  });

  it('skips a search candidate that itself fails to fetch, treating the job as unresolved', async () => {
    const client = {
      parsePageWikitext: async () => {
        throw new Error('page does not exist');
      },
      searchPageTitles: async (): Promise<WikiSearchResult[]> => [{ title: 'Some Set (TCG)' }],
    };
    const result = await resolveJobArticles(client, {
      language: 'en',
      setId: 'x',
      articleTitle: 'Some Set (TCG)',
      targetName: 'Some Set',
      expectedSuffix: 'TCG',
      overrides: {},
    });
    // Direct attempt already used "Some Set (TCG)" and failed, so the same
    // title coming back from search also fails -- fully unresolved.
    expect(result.resolution).toBeNull();
  });
});
