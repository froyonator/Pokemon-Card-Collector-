import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSpriteManifestForTests,
  loadSpriteManifest,
  megaSpriteUrls,
  regionalSpriteUrls,
  spriteUrls,
  vmaxSpriteUrls,
} from './sprites';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  __resetSpriteManifestForTests();
  vi.unstubAllGlobals();
});

describe('spriteUrls', () => {
  it('builds the static URL from BASE_URL and the dex number, regardless of manifest state', () => {
    const { staticUrl } = spriteUrls(6);
    expect(staticUrl).toBe(`${import.meta.env.BASE_URL}sprites/static/6.png`);
  });

  it('returns a null animatedUrl before the manifest has ever been loaded', () => {
    const { animatedUrl } = spriteUrls(6);
    expect(animatedUrl).toBeNull();
  });

  it('returns the animated URL (defaulting to .gif) once the manifest resolves with this dex number covered', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ animated: [6], animatedFormat: {} }));
    await loadSpriteManifest(fetchImpl);
    const { animatedUrl } = spriteUrls(6);
    expect(animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/animated/6.gif`);
  });

  it('uses the manifest-specified extension (e.g. .webp) instead of the .gif default when animatedFormat overrides it', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ animated: [20], animatedFormat: { '20': 'webp' } })
    );
    await loadSpriteManifest(fetchImpl);
    const { animatedUrl } = spriteUrls(20);
    expect(animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/animated/20.webp`);
  });

  it('returns a null animatedUrl for a dex number the resolved manifest does not cover', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ animated: [6], animatedFormat: {} }));
    await loadSpriteManifest(fetchImpl);
    const { animatedUrl } = spriteUrls(999);
    expect(animatedUrl).toBeNull();
  });

  it('degrades to a null animatedUrl for every dex number when the manifest fetch fails (non-2xx)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, false, 404));
    await loadSpriteManifest(fetchImpl);
    expect(spriteUrls(6).animatedUrl).toBeNull();
    expect(spriteUrls(1).animatedUrl).toBeNull();
  });

  it('degrades to a null animatedUrl for every dex number when the manifest fetch throws (network error)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    await loadSpriteManifest(fetchImpl);
    expect(spriteUrls(6).animatedUrl).toBeNull();
  });

  it('degrades to a null animatedUrl for every dex number when the manifest body is malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })) as unknown as typeof fetch;
    await loadSpriteManifest(fetchImpl);
    expect(spriteUrls(6).animatedUrl).toBeNull();
  });
});

describe('megaSpriteUrls', () => {
  const entry = { spriteSlug: 'charizard-mega-x', baseDexNumber: 6 };

  it('falls back entirely to the base species sprite before the manifest has ever loaded', () => {
    const urls = megaSpriteUrls(entry);
    expect(urls).toEqual(spriteUrls(6));
  });

  it('builds the mega static/animated URLs once the manifest lists this slug as animated', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        mega: [{ slug: 'charizard-mega-x', baseDex: 6, name: 'Mega Charizard X', animated: true }],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = megaSpriteUrls(entry);
    expect(urls.staticUrl).toBe(`${import.meta.env.BASE_URL}sprites/mega/static/charizard-mega-x.png`);
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/mega/animated/charizard-mega-x.gif`);
  });

  it('returns the mega static URL with a null animatedUrl when the manifest lists this slug without animated coverage', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        mega: [{ slug: 'charizard-mega-x', baseDex: 6, name: 'Mega Charizard X', animated: false }],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = megaSpriteUrls(entry);
    expect(urls.staticUrl).toBe(`${import.meta.env.BASE_URL}sprites/mega/static/charizard-mega-x.png`);
    expect(urls.animatedUrl).toBeNull();
  });

  it('uses the manifest-specified extension (e.g. .webp) instead of the .gif default for a mega slug', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        mega: [
          {
            slug: 'charizard-mega-x',
            baseDex: 6,
            name: 'Mega Charizard X',
            animated: true,
            animatedExt: 'webp',
          },
        ],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = megaSpriteUrls(entry);
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/mega/animated/charizard-mega-x.webp`);
  });

  it('falls back entirely to the base species sprite when the manifest does not list this slug at all', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [6],
        animatedFormat: {},
        mega: [{ slug: 'venusaur-mega', baseDex: 3, name: 'Mega Venusaur', animated: true }],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = megaSpriteUrls(entry);
    expect(urls).toEqual(spriteUrls(6));
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/animated/6.gif`);
  });
});

describe('vmaxSpriteUrls', () => {
  const gmaxEntry = { spriteSlug: 'charizard-gmax', baseDexNumber: 6 };
  // A plain-Dynamax entry (no official Gigantamax look) -- the sprite
  // pipeline never downloads gmax art for it at all, so it has NO manifest
  // entry, not merely an animated:false one.
  const dynamaxOnlyEntry = { spriteSlug: 'vaporeon-dynamax', baseDexNumber: 134 };

  it('falls back entirely to the base species sprite before the manifest has ever loaded', () => {
    expect(vmaxSpriteUrls(gmaxEntry)).toEqual(spriteUrls(6));
  });

  it('builds the gmax static/animated URLs once the manifest lists this slug as animated', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        gmax: [{ slug: 'charizard-gmax', baseDex: 6, name: 'Gigantamax Charizard', animated: true }],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = vmaxSpriteUrls(gmaxEntry);
    expect(urls.staticUrl).toBe(`${import.meta.env.BASE_URL}sprites/gmax/static/charizard-gmax.png`);
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/gmax/animated/charizard-gmax.gif`);
  });

  it('uses the manifest-specified extension (e.g. .webp) instead of the .gif default for a gmax slug', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        gmax: [
          {
            slug: 'charizard-gmax',
            baseDex: 6,
            name: 'Gigantamax Charizard',
            animated: true,
            animatedExt: 'webp',
          },
        ],
      })
    );
    await loadSpriteManifest(fetchImpl);
    expect(vmaxSpriteUrls(gmaxEntry).animatedUrl).toBe(
      `${import.meta.env.BASE_URL}sprites/gmax/animated/charizard-gmax.webp`
    );
  });

  it('falls back to the base species sprite for a plain-Dynamax entry with no gmax manifest coverage at all', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [134],
        animatedFormat: {},
        gmax: [{ slug: 'charizard-gmax', baseDex: 6, name: 'Gigantamax Charizard', animated: true }],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = vmaxSpriteUrls(dynamaxOnlyEntry);
    expect(urls).toEqual(spriteUrls(134));
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/animated/134.gif`);
  });
});

describe('regionalSpriteUrls', () => {
  const ownVarietyEntry = { slug: 'growlithe-hisui', baseDexNumber: 58 };
  // An exclusive-evolution entry (Obstagoon) -- no manifest coverage at all
  // by design, reuses the base species' own sprite.
  const exclusiveEvolutionEntry = { slug: 'obstagoon', baseDexNumber: 862 };

  it('falls back entirely to the base species sprite before the manifest has ever loaded', () => {
    expect(regionalSpriteUrls(ownVarietyEntry)).toEqual(spriteUrls(58));
  });

  it('builds the regional static/animated URLs once the manifest lists this slug as animated', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        regional: [
          { slug: 'growlithe-hisui', baseDex: 58, name: 'Hisuian Growlithe', family: 'hisuian', animated: true },
        ],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = regionalSpriteUrls(ownVarietyEntry);
    expect(urls.staticUrl).toBe(`${import.meta.env.BASE_URL}sprites/regional/static/growlithe-hisui.png`);
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/regional/animated/growlithe-hisui.gif`);
  });

  it('uses the manifest-specified extension (e.g. .webp) instead of the .gif default for a regional slug', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [],
        animatedFormat: {},
        regional: [
          {
            slug: 'growlithe-hisui',
            baseDex: 58,
            name: 'Hisuian Growlithe',
            family: 'hisuian',
            animated: true,
            animatedExt: 'webp',
          },
        ],
      })
    );
    await loadSpriteManifest(fetchImpl);
    expect(regionalSpriteUrls(ownVarietyEntry).animatedUrl).toBe(
      `${import.meta.env.BASE_URL}sprites/regional/animated/growlithe-hisui.webp`
    );
  });

  it('falls back to the base species sprite for an exclusive-evolution entry with no regional manifest coverage at all', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        animated: [862],
        animatedFormat: {},
        regional: [
          { slug: 'growlithe-hisui', baseDex: 58, name: 'Hisuian Growlithe', family: 'hisuian', animated: true },
        ],
      })
    );
    await loadSpriteManifest(fetchImpl);
    const urls = regionalSpriteUrls(exclusiveEvolutionEntry);
    expect(urls).toEqual(spriteUrls(862));
    expect(urls.animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/animated/862.gif`);
  });
});

describe('loadSpriteManifest', () => {
  it('fetches public/sprites/manifest.json under BASE_URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ animated: [], animatedFormat: {} }));
    await loadSpriteManifest(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe(`${import.meta.env.BASE_URL}sprites/manifest.json`);
  });

  it('memoizes: a second call reuses the first fetch instead of issuing a new one', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ animated: [6], animatedFormat: {} }));
    const first = loadSpriteManifest(fetchImpl);
    const second = loadSpriteManifest(fetchImpl);
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await first).toBe(await second);
  });

  it('falls back to the global fetch when no fetchImpl is provided', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ animated: [6], animatedFormat: {} }));
    vi.stubGlobal('fetch', fetchSpy);
    await loadSpriteManifest();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(spriteUrls(6).animatedUrl).toBe(`${import.meta.env.BASE_URL}sprites/animated/6.gif`);
  });
});
