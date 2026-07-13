// This app's own self-hosted sprite set (see scripts/carddata's
// download-sprites pipeline, which populates public/sprites/ once at build
// time): a static PNG for every species, plus an animated GIF/WEBP for
// whichever species the animated source actually covers. Consumed by
// DexGrid/Tile so the dex grid loads sprites from this app's own origin
// instead of hot-linking a third-party host on every page load -- the old
// live URL (src/api/pokeapi.ts's spriteUrl) stays in play only as an
// onError fallback on the <img> itself, for the rare case a local file is
// missing (e.g. a manifest/file mismatch from a partial deploy).

// public/sprites/manifest.json's own shape -- see downloadSprites.ts.
interface SpriteManifest {
  animated: number[];
  animatedFormat?: Record<string, string>;
}

interface SpriteManifestCache {
  animatedDexNumbers: Set<number>;
  animatedFormats: Record<string, string>;
}

// Empty coverage -- every dex number resolves to "no animated sprite" (pure
// static degradation) -- used both as the pre-load default (before the
// fetch below has resolved) and as the permanent result of a failed fetch.
// Per the task's contract: a manifest fetch failure must degrade the whole
// app to static sprites, never throw or leave dex numbers in limbo.
const EMPTY_MANIFEST: SpriteManifestCache = {
  animatedDexNumbers: new Set(),
  animatedFormats: {},
};

// Set once loadSpriteManifest's fetch resolves (successfully or not --
// even a failure resolves this to EMPTY_MANIFEST, never leaves it null
// forever). spriteUrls() below reads this directly and synchronously, so
// until the fetch resolves, every dex number reads as "no animated
// coverage" -- exactly the same safe default as a genuine fetch failure.
let manifestCache: SpriteManifestCache = EMPTY_MANIFEST;

// Memoizes the in-flight/resolved fetch -- see staticDatabase.ts's
// staticDataCache for the identical rationale, just with no per-key
// dimension here (there is only ever one manifest, unlike one static
// database per language). Meant to be kicked off once, near app start, so
// every dex number that renders before the fetch resolves simply sees
// EMPTY_MANIFEST and stays static-only until it lands -- callers that want
// to react to the manifest actually arriving (e.g. DexGrid re-rendering its
// tiles once animated coverage is known) can await the returned promise.
let manifestPromise: Promise<SpriteManifestCache> | null = null;

async function fetchSpriteManifest(fetchImpl: typeof fetch): Promise<SpriteManifestCache> {
  try {
    const response = await fetchImpl(`${import.meta.env.BASE_URL}sprites/manifest.json`);
    if (!response.ok) return EMPTY_MANIFEST;
    const data = (await response.json()) as Partial<SpriteManifest>;
    return {
      animatedDexNumbers: new Set(data.animated ?? []),
      animatedFormats: data.animatedFormat ?? {},
    };
  } catch {
    return EMPTY_MANIFEST;
  }
}

// Fetches and memoizes public/sprites/manifest.json exactly once for the
// life of the session (see manifestPromise above) -- meant to be called
// once, near app start (DexGrid's mount effect), not per tile. Resolves --
// never rejects -- to the parsed coverage, or to EMPTY_MANIFEST on any
// failure (non-2xx, network error, malformed JSON), so the app always
// degrades to static-everywhere rather than getting stuck.
export function loadSpriteManifest(
  fetchImpl: typeof fetch = fetch
): Promise<SpriteManifestCache> {
  if (!manifestPromise) {
    manifestPromise = fetchSpriteManifest(fetchImpl).then((result) => {
      manifestCache = result;
      return result;
    });
  }
  return manifestPromise;
}

export interface SpriteUrls {
  staticUrl: string;
  // null means this dex number has no animated coverage (or the manifest
  // hasn't resolved yet) -- callers fall back to staticUrl.
  animatedUrl: string | null;
}

// Pure, synchronous lookup against whatever loadSpriteManifest has resolved
// to so far (EMPTY_MANIFEST if it hasn't resolved, or was never called, or
// failed) -- reflects import.meta.env.BASE_URL the same way
// staticDatabase.ts's fetchStaticCardData does, so this resolves correctly
// under Vite's configured `base` (a GitHub Pages subpath in production).
export function spriteUrls(dexNumber: number): SpriteUrls {
  const staticUrl = `${import.meta.env.BASE_URL}sprites/static/${dexNumber}.png`;
  if (!manifestCache.animatedDexNumbers.has(dexNumber)) {
    return { staticUrl, animatedUrl: null };
  }
  const ext = manifestCache.animatedFormats[String(dexNumber)] ?? 'gif';
  return {
    staticUrl,
    animatedUrl: `${import.meta.env.BASE_URL}sprites/animated/${dexNumber}.${ext}`,
  };
}

// Test-only: clears the module-level manifest memo so each test can drive
// its own fetchImpl/response through loadSpriteManifest without inheriting
// whatever an earlier test in the same file already resolved it to. Not
// imported anywhere in application code -- the running app only ever calls
// loadSpriteManifest once, near app start, and never needs to undo that.
export function __resetSpriteManifestForTests(): void {
  manifestPromise = null;
  manifestCache = EMPTY_MANIFEST;
}
