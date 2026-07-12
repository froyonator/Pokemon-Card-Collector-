// scripts/carddata/src/harvest/wikiApiClient.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MIN_REQUEST_GAP_MS,
  DEFAULT_USER_AGENT,
  IMAGEINFO_BATCH_SIZE,
  createWikiApiClient,
} from './wikiApiClient';

describe('wiki API client constants', () => {
  it('floors the request gap at the site-declared 5 second crawl-delay', () => {
    expect(DEFAULT_MIN_REQUEST_GAP_MS).toBe(5000);
  });

  it('batches imageinfo requests at 50 titles, the MediaWiki API limit', () => {
    expect(IMAGEINFO_BATCH_SIZE).toBe(50);
  });

  it('identifies itself with a descriptive, versioned, contactable User-Agent', () => {
    expect(DEFAULT_USER_AGENT).toBe('CollectorsLedger-harvest/1.0 (personal project)');
  });
});

describe('parsePageWikitext', () => {
  it('returns the page title, id, and wikitext', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        parse: {
          title: 'Pikachu ex (Surging Sparks 57)',
          pageid: 320607,
          wikitext: '{{PokémoncardInfobox|cardname=Pikachu|...}}',
        },
      })
    );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const result = await client.parsePageWikitext('Pikachu ex (Surging Sparks 57)');

    expect(result).toEqual({
      title: 'Pikachu ex (Surging Sparks 57)',
      pageId: 320607,
      wikitext: '{{PokémoncardInfobox|cardname=Pikachu|...}}',
    });
  });

  it('sends the declared User-Agent and requests wikitext via action=parse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ parse: { title: 'X', pageid: 1, wikitext: 'abc' } }));
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    await client.parsePageWikitext('X');

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('action')).toBe('parse');
    expect(parsed.searchParams.get('prop')).toBe('wikitext');
    expect(parsed.searchParams.get('page')).toBe('X');
    expect((requestInit.headers as Record<string, string>)['User-Agent']).toBe(DEFAULT_USER_AGENT);
  });

  it('rejects with a descriptive error when the page does not exist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ error: { code: 'missingtitle', info: 'The page does not exist' } }));
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    await expect(client.parsePageWikitext('Nonexistent Page')).rejects.toThrow(/does not exist/);
  });

  it('retries a transient HTTP failure and still respects the pacing floor on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ parse: { title: 'X', pageid: 1, wikitext: 'abc' } }));
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0, retryDelayMs: 0 });

    const result = await client.parsePageWikitext('X');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.wikitext).toBe('abc');
  });
});

describe('queryImageInfo', () => {
  it('resolves a single File: title to its media URL, matching the real observed response shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        query: {
          pages: [
            {
              title: 'File:PikachuexSurgingSparks57.jpg',
              imagerepository: 'shared',
              imageinfo: [
                {
                  url: 'https://archives.bulbagarden.net/media/upload/d/d0/PikachuexSurgingSparks57.jpg',
                  thumburl:
                    'https://archives.bulbagarden.net/media/upload/thumb/d/d0/PikachuexSurgingSparks57.jpg/300px-PikachuexSurgingSparks57.jpg',
                  width: 734,
                  height: 1024,
                  mime: 'image/jpeg',
                  sha1: '4d9ef0e8d3a8b883b68fbc8404c99b794366f559',
                },
              ],
            },
          ],
        },
      })
    );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const result = await client.queryImageInfo(['File:PikachuexSurgingSparks57.jpg']);

    expect(result.get('File:PikachuexSurgingSparks57.jpg')).toEqual({
      fileTitle: 'File:PikachuexSurgingSparks57.jpg',
      url: 'https://archives.bulbagarden.net/media/upload/d/d0/PikachuexSurgingSparks57.jpg',
      thumbUrl:
        'https://archives.bulbagarden.net/media/upload/thumb/d/d0/PikachuexSurgingSparks57.jpg/300px-PikachuexSurgingSparks57.jpg',
      width: 734,
      height: 1024,
      mime: 'image/jpeg',
      sha1: '4d9ef0e8d3a8b883b68fbc8404c99b794366f559',
      missing: false,
    });
  });

  it('resolves a requested title back through query.normalized, so a normalized-case/underscore response still matches the original request', async () => {
    // MediaWiki normalizes requested titles (underscores -> spaces,
    // first-letter case) before matching them to pages, and reports the
    // change via `query.normalized` rather than in `pages` itself --
    // `pages[].title` comes back ALREADY NORMALIZED. A guessed filename
    // with a lowercase first letter or an underscore is exactly the kind
    // of request this happens for.
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        query: {
          normalized: [{ from: 'File:cubonebattlestyles69.jpg', to: 'File:Cubonebattlestyles69.jpg' }],
          pages: [
            {
              title: 'File:Cubonebattlestyles69.jpg',
              imageinfo: [{ url: 'https://example.invalid/Cubonebattlestyles69.jpg' }],
            },
          ],
        },
      })
    );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const result = await client.queryImageInfo(['File:cubonebattlestyles69.jpg']);

    const info = result.get('File:cubonebattlestyles69.jpg');
    expect(info).toBeDefined();
    expect(info?.missing).toBe(false);
    expect(info?.url).toBe('https://example.invalid/Cubonebattlestyles69.jpg');
    expect(info?.fileTitle).toBe('File:Cubonebattlestyles69.jpg');
  });

  it('resolves a shared-media-repository file even though the response marks it "missing" (confirmed live: every real card scan does this)', async () => {
    // The File: namespace is a shared repository backed by a separate
    // media host: a file that lives ONLY there (not on the local wiki's
    // own File: namespace) comes back with `missing: true` on the page
    // itself, but a fully populated `imageinfo` array with a real url.
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        query: {
          pages: [
            {
              title: 'File:CuboneBattleStyles69.jpg',
              missing: true,
              known: true,
              imagerepository: 'shared',
              imageinfo: [
                {
                  url: 'https://archives.bulbagarden.net/media/upload/8/85/CuboneBattleStyles69.jpg',
                  width: 868,
                  height: 1212,
                  mime: 'image/jpeg',
                  sha1: '5025a6b5824b9229c91dc55b0505d98e34f2efb7',
                },
              ],
            },
          ],
        },
      })
    );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const result = await client.queryImageInfo(['File:CuboneBattleStyles69.jpg']);

    expect(result.get('File:CuboneBattleStyles69.jpg')).toMatchObject({
      missing: false,
      url: 'https://archives.bulbagarden.net/media/upload/8/85/CuboneBattleStyles69.jpg',
    });
  });

  it('marks a title with no File: page as missing rather than dropping it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ query: { pages: [{ title: 'File:DoesNotExist.jpg', missing: true }] } })
    );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const result = await client.queryImageInfo(['File:DoesNotExist.jpg']);

    expect(result.get('File:DoesNotExist.jpg')).toMatchObject({ missing: true, url: null });
  });

  it('splits a batch of more than 50 titles into multiple requests of at most 50 each', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const parsed = new URL(url as string);
      const titles = (parsed.searchParams.get('titles') ?? '').split('|').filter(Boolean);
      return Response.json({
        query: {
          pages: titles.map((title) => ({
            title,
            imageinfo: [{ url: `https://example.invalid/${title}` }],
          })),
        },
      });
    });
    const client = createWikiApiClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      minRequestGapMs: 0,
    });
    const titles = Array.from({ length: 120 }, (_, i) => `File:Card${i}.jpg`);

    const result = await client.queryImageInfo(titles);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const batchSizes = fetchMock.mock.calls.map(
      ([url]) => (new URL(url as string).searchParams.get('titles') ?? '').split('|').filter(Boolean).length
    );
    expect(batchSizes).toEqual([50, 50, 20]);
    expect(result.size).toBe(120);
    expect(result.get('File:Card0.jpg')?.url).toBe('https://example.invalid/File:Card0.jpg');
    expect(result.get('File:Card119.jpg')?.url).toBe('https://example.invalid/File:Card119.jpg');
  });

  it('follows imageinfo continuation within a single batch until it is exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          query: { pages: [{ title: 'File:A.jpg', imageinfo: [{ url: 'https://example.invalid/A' }] }] },
          continue: { iicontinue: '1|A.jpg', continue: '||' },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          query: { pages: [{ title: 'File:B.jpg', imageinfo: [{ url: 'https://example.invalid/B' }] }] },
        })
      );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const result = await client.queryImageInfo(['File:A.jpg', 'File:B.jpg']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(secondUrl.searchParams.get('iicontinue')).toBe('1|A.jpg');
    expect(result.get('File:A.jpg')?.url).toBe('https://example.invalid/A');
    expect(result.get('File:B.jpg')?.url).toBe('https://example.invalid/B');
  });
});

describe('searchPageTitles', () => {
  it('returns search hits from action=query&list=search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        query: {
          search: [
            { title: 'Surging Sparks (TCG)', snippet: 'Surging Sparks is...' },
            { title: 'Bonds of Destiny (ATCG)', snippet: 'Bonds of Destiny is...' },
          ],
        },
      })
    );
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 0 });

    const results = await client.searchPageTitles('insource:"locale=Traditional Chinese"');

    expect(results).toEqual([
      { title: 'Surging Sparks (TCG)', snippet: 'Surging Sparks is...' },
      { title: 'Bonds of Destiny (ATCG)', snippet: 'Bonds of Destiny is...' },
    ]);
  });
});

describe('request pacing', () => {
  it('never starts two requests less than minRequestGapMs apart', async () => {
    const starts: number[] = [];
    const fetchMock = vi.fn(async () => {
      starts.push(Date.now());
      return Response.json({ parse: { title: 'X', pageid: 1, wikitext: 'abc' } });
    });
    const client = createWikiApiClient({ fetchImpl: fetchMock, minRequestGapMs: 40 });

    await client.parsePageWikitext('A');
    await client.parsePageWikitext('B');
    await client.parsePageWikitext('C');

    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(35);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(35);
  });
});
