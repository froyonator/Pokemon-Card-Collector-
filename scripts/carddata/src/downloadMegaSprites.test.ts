// scripts/carddata/src/downloadMegaSprites.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMegaManifestSection,
  emptyMegaCheckpoint,
  homeRenderUrl,
  loadMegaCheckpoint,
  megaAnimatedSlug,
  megaAnimatedSpriteUrl,
  mergeMegaIntoManifest,
  saveMegaCheckpoint,
  selectForms,
  type MegaCheckpoint,
} from './downloadMegaSprites';
import { MEGA_DEX } from './data/megaDex';

describe('megaAnimatedSlug', () => {
  it('keeps the slug unchanged for a plain mega (no X/Y split)', () => {
    expect(megaAnimatedSlug('venusaur-mega')).toBe('venusaur-mega');
    expect(megaAnimatedSlug('lucario-mega')).toBe('lucario-mega');
  });

  it('fuses the hyphen between "mega" and a trailing X/Y suffix', () => {
    expect(megaAnimatedSlug('charizard-mega-x')).toBe('charizard-megax');
    expect(megaAnimatedSlug('charizard-mega-y')).toBe('charizard-megay');
    expect(megaAnimatedSlug('mewtwo-mega-x')).toBe('mewtwo-megax');
    expect(megaAnimatedSlug('mewtwo-mega-y')).toBe('mewtwo-megay');
  });

  it('fuses the hyphen between "mega" and a trailing Z suffix (newest-wave second mega stones)', () => {
    expect(megaAnimatedSlug('absol-mega-z')).toBe('absol-megaz');
    expect(megaAnimatedSlug('garchomp-mega-z')).toBe('garchomp-megaz');
    expect(megaAnimatedSlug('lucario-mega-z')).toBe('lucario-megaz');
  });

  it('applies the explicit override for Meowstic, whose animated-host name does not follow the general transform', () => {
    expect(megaAnimatedSlug('meowstic-male-mega')).toBe('meowstic-mmega');
  });
});

describe('homeRenderUrl', () => {
  it('builds the sprite archive\'s "home" render URL from a numeric form id', () => {
    expect(homeRenderUrl(10322)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/10322.png'
    );
  });
});

describe('selectForms', () => {
  it('returns every form by default', () => {
    expect(selectForms([])).toEqual(MEGA_DEX);
  });

  it('returns only order > 48 (the newest-wave additions) with --only-new', () => {
    const forms = selectForms(['--only-new']);
    expect(forms.length).toBe(MEGA_DEX.length - 48);
    expect(forms.every((f) => f.order > 48)).toBe(true);
    expect(forms[0].slug).toBe('clefable-mega');
  });
});

describe('megaAnimatedSpriteUrl', () => {
  it('builds the modern showdown animated-sprite URL from a mega slug', () => {
    expect(megaAnimatedSpriteUrl('venusaur-mega')).toBe('https://play.pokemonshowdown.com/sprites/ani/venusaur-mega.gif');
    expect(megaAnimatedSpriteUrl('charizard-mega-x')).toBe('https://play.pokemonshowdown.com/sprites/ani/charizard-megax.gif');
  });
});

describe('buildMegaManifestSection', () => {
  it('lists only forms with a done static entry, ordered by megaDex order', () => {
    const checkpoint: MegaCheckpoint = {
      formIds: {},
      static: {
        'charizard-mega-x': { status: 'done', bytes: 100 },
        'venusaur-mega': { status: 'done', bytes: 200 },
        'audino-mega': { status: 'failed', reason: 'HTTP 404' },
      },
      animated: {
        'venusaur-mega': { status: 'done', ext: 'gif', bytes: 50 },
        'charizard-mega-x': { status: 'not-found' },
      },
    };
    const section = buildMegaManifestSection(checkpoint);
    expect(section.map((e) => e.slug)).toEqual(['venusaur-mega', 'charizard-mega-x']); // venusaur (order 1) before charizard-x (order 2)
    expect(section[0]).toEqual({ slug: 'venusaur-mega', baseDex: 3, name: 'Mega Venusaur', animated: true });
    expect(section[1]).toEqual({ slug: 'charizard-mega-x', baseDex: 6, name: 'Mega Charizard X', animated: false });
  });

  it('records animatedExt for webp entries', () => {
    const checkpoint: MegaCheckpoint = {
      formIds: {},
      static: { 'venusaur-mega': { status: 'done', bytes: 100 } },
      animated: { 'venusaur-mega': { status: 'done', ext: 'webp', bytes: 40 } },
    };
    const section = buildMegaManifestSection(checkpoint);
    expect(section[0]).toEqual({ slug: 'venusaur-mega', baseDex: 3, name: 'Mega Venusaur', animated: true, animatedExt: 'webp' });
  });

  it('produces an empty section for an empty checkpoint', () => {
    expect(buildMegaManifestSection(emptyMegaCheckpoint())).toEqual([]);
  });

  it('records artSource: render for a form whose static art came from the home-render fallback', () => {
    const checkpoint: MegaCheckpoint = {
      formIds: {},
      static: { 'venusaur-mega': { status: 'done', bytes: 100, artSource: 'render' } },
      animated: {},
    };
    const section = buildMegaManifestSection(checkpoint);
    expect(section[0]).toEqual({
      slug: 'venusaur-mega',
      baseDex: 3,
      name: 'Mega Venusaur',
      animated: false,
      artSource: 'render',
    });
  });

  it('omits artSource entirely for a form resolved the normal way (no artSource on the checkpoint entry)', () => {
    const checkpoint: MegaCheckpoint = {
      formIds: {},
      static: { 'venusaur-mega': { status: 'done', bytes: 100 } },
      animated: {},
    };
    const section = buildMegaManifestSection(checkpoint);
    expect(section[0]).not.toHaveProperty('artSource');
  });
});

describe('mergeMegaIntoManifest', () => {
  let tmpDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mega-manifest-'));
    manifestPath = path.join(tmpDir, 'manifest.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('adds a "mega" key without disturbing existing base-form keys', async () => {
    await writeFile(manifestPath, JSON.stringify({ animated: [1, 2, 3], animatedFormat: { '2': 'webp' } }), 'utf8');
    const megaSection = [{ slug: 'venusaur-mega', baseDex: 3, name: 'Mega Venusaur', animated: true }];

    await mergeMegaIntoManifest(manifestPath, megaSection);

    const written = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(written.animated).toEqual([1, 2, 3]);
    expect(written.animatedFormat).toEqual({ '2': 'webp' });
    expect(written.mega).toEqual(megaSection);
  });

  it('creates the manifest file if it does not exist yet', async () => {
    const missingPath = path.join(tmpDir, 'does-not-exist', 'manifest.json');
    const megaSection = [{ slug: 'lucario-mega', baseDex: 448, name: 'Mega Lucario', animated: false }];

    await mergeMegaIntoManifest(missingPath, megaSection);

    const written = JSON.parse(await readFile(missingPath, 'utf8'));
    expect(written.mega).toEqual(megaSection);
  });
});

describe('mega checkpoint load/save round trip', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mega-checkpoint-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty checkpoint when the file does not exist', async () => {
    const checkpoint = await loadMegaCheckpoint(path.join(tmpDir, 'missing.json'));
    expect(checkpoint).toEqual(emptyMegaCheckpoint());
  });

  it('returns an empty checkpoint when the file is corrupt JSON', async () => {
    const filePath = path.join(tmpDir, 'corrupt.json');
    await writeFile(filePath, '{not valid json', 'utf8');
    const checkpoint = await loadMegaCheckpoint(filePath);
    expect(checkpoint).toEqual(emptyMegaCheckpoint());
  });

  it('round-trips a real checkpoint through save then load', async () => {
    const filePath = path.join(tmpDir, 'progress.json');
    const checkpoint: MegaCheckpoint = {
      formIds: { 'venusaur-mega': { status: 'resolved', formId: 10033 } },
      static: { 'venusaur-mega': { status: 'done', bytes: 12345 } },
      animated: { 'venusaur-mega': { status: 'done', ext: 'gif', bytes: 999 } },
    };
    await saveMegaCheckpoint(filePath, checkpoint);
    const loaded = await loadMegaCheckpoint(filePath);
    expect(loaded).toEqual(checkpoint);
  });

  it('round-trips a static entry with artSource: render', async () => {
    const filePath = path.join(tmpDir, 'progress.json');
    const checkpoint: MegaCheckpoint = {
      formIds: { 'tatsugiri-curly-mega': { status: 'resolved', formId: 10322 } },
      static: { 'tatsugiri-curly-mega': { status: 'done', bytes: 137407, artSource: 'render' } },
      animated: { 'tatsugiri-curly-mega': { status: 'not-found' } },
    };
    await saveMegaCheckpoint(filePath, checkpoint);
    const loaded = await loadMegaCheckpoint(filePath);
    expect(loaded).toEqual(checkpoint);
  });
});
