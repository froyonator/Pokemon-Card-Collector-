import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { fetchImageWithCache, getCachedImage, setCachedImage } from './imageCache';

beforeEach(async () => {
  indexedDB = new IDBFactory();
});

describe('image cache', () => {
  it('returns undefined for an uncached URL', async () => {
    const result = await getCachedImage('https://example.com/a.png');
    expect(result).toBeUndefined();
  });

  it('round-trips a blob for a URL', async () => {
    const blob = new Blob(['fake image bytes'], { type: 'image/png' });
    await setCachedImage('https://example.com/a.png', blob);
    const cached = await getCachedImage('https://example.com/a.png');
    expect(cached).toBeDefined();
    expect(cached?.type).toBe('image/png');
  });
});

describe('fetchImageWithCache', () => {
  it('fetches and caches on a cache miss', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob } as Response);
    const objectUrl = await fetchImageWithCache('https://example.com/b.png', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(objectUrl).toMatch(/^blob:/);
  });

  it('skips the network on a cache hit', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' });
    await setCachedImage('https://example.com/c.png', blob);
    const fetchImpl = vi.fn();
    await fetchImageWithCache('https://example.com/c.png', fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws when the network request fails and there is no cache entry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(fetchImageWithCache('https://example.com/d.png', fetchImpl)).rejects.toThrow(
      'Image request failed with status 404'
    );
  });
});
