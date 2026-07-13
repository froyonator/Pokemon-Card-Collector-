// This app's own self-hosted sprite set (see scripts/carddata's
// download-sprites pipeline, which populates public/sprites/ once at build
// time): a static PNG for every species, plus an animated GIF/WEBP for
// whichever species the animated source actually covers. Consumed by
// DexGrid/Tile so the dex grid loads sprites from this app's own origin
// instead of hot-linking a third-party host on every page load -- the old
// live URL (src/api/pokeapi.ts's spriteUrl) stays in play only as an
// onError fallback on the <img> itself, for the rare case a local file is
// missing (e.g. a manifest/file mismatch from a partial deploy).

// public/sprites/manifest.json's "mega" section -- one entry per Mega form
// (see scripts/carddata/src/downloadMegaSprites.ts), keyed by the same
// `slug` megaDex.ts's MegaDexEntry.spriteSlug carries.
interface MegaManifestEntry {
  slug: string;
  baseDex: number;
  name: string;
  animated: boolean;
  animatedExt?: 'webp';
}

// public/sprites/manifest.json's own shape -- see downloadSprites.ts.
interface SpriteManifest {
  animated: number[];
  animatedFormat?: Record<string, string>;
  mega?: MegaManifestEntry[];
}

interface SpriteManifestCache {
  animatedDexNumbers: Set<number>;
  animatedFormats: Record<string, string>;
  // Every Mega slug the manifest lists a static PNG for, regardless of
  // animated coverage -- megaSpriteUrls below falls all the way back to the
  // base species' own sprite when a slug isn't in this set at all (e.g. a
  // future roster addition the sprite pipeline hasn't downloaded yet).
  megaStaticSlugs: Set<string>;
  megaAnimatedSlugs: Set<string>;
  // Mirrors animatedFormats above, but for mega slugs: a mega form whose
  // animated file was saved as .webp (see maybeConvertToWebp in
  // downloadMegaSprites.ts) needs that extension here, or megaSpriteUrls
  // below would build a URL for a .gif that was never written -- an onError
  // 404 that used to fall the WHOLE tile all the way back to the base
  // species' live sprite, wiping out perfectly good mega static art too.
  megaAnimatedFormats: Record<string, string>;
}

// Empty coverage -- every dex number resolves to "no animated sprite" (pure
// static degradation) -- used both as the pre-load default (before the
// fetch below has resolved) and as the permanent result of a failed fetch.
// Per the task's contract: a manifest fetch failure must degrade the whole
// app to static sprites, never throw or leave dex numbers in limbo.
const EMPTY_MANIFEST: SpriteManifestCache = {
  animatedDexNumbers: new Set(),
  animatedFormats: {},
  megaStaticSlugs: new Set(),
  megaAnimatedSlugs: new Set(),
  megaAnimatedFormats: {},
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
    const mega = data.mega ?? [];
    const megaAnimatedFormats: Record<string, string> = {};
    for (const m of mega) {
      if (m.animated && m.animatedExt) megaAnimatedFormats[m.slug] = m.animatedExt;
    }
    return {
      animatedDexNumbers: new Set(data.animated ?? []),
      animatedFormats: data.animatedFormat ?? {},
      megaStaticSlugs: new Set(mega.map((m) => m.slug)),
      megaAnimatedSlugs: new Set(mega.filter((m) => m.animated).map((m) => m.slug)),
      megaAnimatedFormats,
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

// Same synchronous, stateless-lookup contract as spriteUrls above, but for
// a Mega form's own sprite files (public/sprites/mega/{static,animated}/
// <spriteSlug>.{png,gif}) instead of a plain dex number's. Falls all the way
// back to the BASE species' own static/animated sprite (spriteUrls(
// baseDexNumber)) when the manifest doesn't list this slug at all -- e.g. a
// future roster addition the sprite pipeline hasn't downloaded yet -- so a
// Mega tile never shows a broken image before even trying the <img>'s own
// onError fallback.
export function megaSpriteUrls(entry: { spriteSlug: string; baseDexNumber: number }): SpriteUrls {
  if (!manifestCache.megaStaticSlugs.has(entry.spriteSlug)) {
    return spriteUrls(entry.baseDexNumber);
  }
  const staticUrl = `${import.meta.env.BASE_URL}sprites/mega/static/${entry.spriteSlug}.png`;
  const ext = manifestCache.megaAnimatedFormats[entry.spriteSlug] ?? 'gif';
  const animatedUrl = manifestCache.megaAnimatedSlugs.has(entry.spriteSlug)
    ? `${import.meta.env.BASE_URL}sprites/mega/animated/${entry.spriteSlug}.${ext}`
    : null;
  return { staticUrl, animatedUrl };
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
