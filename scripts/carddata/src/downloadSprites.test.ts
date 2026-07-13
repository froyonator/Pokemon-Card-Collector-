// scripts/carddata/src/downloadSprites.test.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  animatedSpriteUrl,
  buildManifest,
  emptyCheckpoint,
  isAnimatedCheckpointTrustworthy,
  loadCheckpoint,
  maybeConvertToWebp,
  normalizeSpeciesNameForAnimatedSprite,
  pruneUntrustedAnimated,
  saveCheckpoint,
  validateAnimatedImageBytes,
  validateStaticImageBytes,
  type Checkpoint,
} from './downloadSprites';

describe('normalizeSpeciesNameForAnimatedSprite', () => {
  const cases: Array<[string, string]> = [
    ['Bulbasaur', 'bulbasaur'],
    ['Mr. Mime', 'mrmime'],
    ["Farfetch'd", 'farfetchd'],
    ['Ho-Oh', 'hooh'],
    ['Porygon-Z', 'porygonz'],
    ['Type: Null', 'typenull'],
    ['Jangmo-o', 'jangmoo'],
    ['Hakamo-o', 'hakamoo'],
    ['Kommo-o', 'kommoo'],
    ['Tapu Koko', 'tapukoko'],
    ['Tapu Lele', 'tapulele'],
    ['Tapu Bulu', 'tapubulu'],
    ['Tapu Fini', 'tapufini'],
    ['Mime Jr.', 'mimejr'],
    ['Flabébé', 'flabebe'],
    ['Urshifu', 'urshifu'],
    ['Nidoran-F', 'nidoranf'],
    ['Nidoran-M', 'nidoranm'],
    ['Wo-Chien', 'wochien'],
    ['Chien-Pao', 'chienpao'],
    ['Ting-Lu', 'tinglu'],
    ['Chi-Yu', 'chiyu'],
    ['Walking Wake', 'walkingwake'],
    ['Iron Valiant', 'ironvaliant'],
    ['Great Tusk', 'greattusk'],
    ['Deoxys', 'deoxys'],
  ];

  for (const [input, expected] of cases) {
    it(`normalizes "${input}" to "${expected}"`, () => {
      expect(normalizeSpeciesNameForAnimatedSprite(input)).toBe(expected);
    });
  }
});

describe('animatedSpriteUrl', () => {
  it('builds the modern showdown animated-sprite URL from a species name', () => {
    expect(animatedSpriteUrl('Ho-Oh')).toBe('https://play.pokemonshowdown.com/sprites/ani/hooh.gif');
  });

  it('never references the generation-v/black-white animated set', () => {
    expect(animatedSpriteUrl('Pikachu')).not.toMatch(/\/ani-bw\//);
    expect(animatedSpriteUrl('Pikachu')).toMatch(/\/sprites\/ani\//);
  });
});

describe('validateStaticImageBytes', () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  it('accepts a real PNG', () => {
    expect(validateStaticImageBytes(pngBytes, 'image/png')).toEqual({ ok: true });
  });

  it('rejects a non-image content-type', () => {
    const result = validateStaticImageBytes(pngBytes, 'text/html');
    expect(result.ok).toBe(false);
  });

  it('rejects bytes that are not actually a PNG', () => {
    const result = validateStaticImageBytes(Buffer.from('not a png'), 'image/png');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/magic bytes/);
  });

  it('rejects an empty body', () => {
    const result = validateStaticImageBytes(Buffer.alloc(0), 'image/png');
    expect(result.ok).toBe(false);
  });
});

describe('validateAnimatedImageBytes', () => {
  it('accepts a real GIF (GIF89a header)', () => {
    const gifBytes = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0, 0, 0, 0])]);
    expect(validateAnimatedImageBytes(gifBytes, 'image/gif')).toEqual({ ok: true });
  });

  it('rejects bytes that are not actually a GIF', () => {
    const result = validateAnimatedImageBytes(Buffer.from('not a gif'), 'image/gif');
    expect(result.ok).toBe(false);
  });
});

describe('buildManifest', () => {
  it('lists only dex numbers with a done animated entry, sorted numerically', () => {
    const checkpoint: Checkpoint = {
      static: {},
      animated: {
        '25': { status: 'done', source: 'showdown-ani', name: 'pikachu', ext: 'gif', bytes: 100 },
        '6': { status: 'done', source: 'showdown-ani', name: 'charizard', ext: 'gif', bytes: 200 },
        '150': { status: 'not-found', source: 'showdown-ani', name: 'mewtwo' },
        '999': { status: 'failed', reason: 'HTTP 500' },
      },
    };
    expect(buildManifest(checkpoint)).toEqual({ animated: [6, 25] });
  });

  it('records webp extensions in animatedFormat, omitting default-gif entries', () => {
    const checkpoint: Checkpoint = {
      static: {},
      animated: {
        '1': { status: 'done', source: 'showdown-ani', name: 'bulbasaur', ext: 'gif', bytes: 100 },
        '2': { status: 'done', source: 'showdown-ani', name: 'ivysaur', ext: 'webp', bytes: 50 },
      },
    };
    expect(buildManifest(checkpoint)).toEqual({
      animated: [1, 2],
      animatedFormat: { '2': 'webp' },
    });
  });

  it('produces an empty manifest for an empty checkpoint', () => {
    expect(buildManifest(emptyCheckpoint())).toEqual({ animated: [] });
  });
});

describe('isAnimatedCheckpointTrustworthy', () => {
  it('trusts a checkpoint whose done/not-found entries all attribute the modern source', () => {
    const checkpoint: Checkpoint = {
      static: {},
      animated: {
        '1': { status: 'done', source: 'showdown-ani', name: 'bulbasaur', ext: 'gif', bytes: 100 },
        '2': { status: 'not-found', source: 'showdown-ani', name: 'ivysaur' },
      },
    };
    expect(isAnimatedCheckpointTrustworthy(checkpoint)).toBe(true);
  });

  it('distrusts a checkpoint with a done entry missing source attribution (stale/partial run)', () => {
    const checkpoint = {
      static: {},
      animated: {
        '1': { status: 'done', ext: 'gif', bytes: 100 },
      },
    } as unknown as Checkpoint;
    expect(isAnimatedCheckpointTrustworthy(checkpoint)).toBe(false);
  });

  it('trusts failed entries regardless of source (nothing was written to disk)', () => {
    const checkpoint: Checkpoint = {
      static: {},
      animated: { '1': { status: 'failed', reason: 'HTTP 500' } },
    };
    expect(isAnimatedCheckpointTrustworthy(checkpoint)).toBe(true);
  });
});

describe('checkpoint load/save round trip', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'sprite-checkpoint-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty checkpoint when the file does not exist', async () => {
    const checkpoint = await loadCheckpoint(path.join(tmpDir, 'missing.json'));
    expect(checkpoint).toEqual(emptyCheckpoint());
  });

  it('returns an empty checkpoint when the file is corrupt JSON', async () => {
    const filePath = path.join(tmpDir, 'corrupt.json');
    await writeFile(filePath, '{not valid json', 'utf8');
    const checkpoint = await loadCheckpoint(filePath);
    expect(checkpoint).toEqual(emptyCheckpoint());
  });

  it('round-trips a real checkpoint through save then load', async () => {
    const filePath = path.join(tmpDir, 'progress.json');
    const checkpoint: Checkpoint = {
      static: { '1': { status: 'done', bytes: 12345 } },
      animated: { '1': { status: 'done', source: 'showdown-ani', name: 'bulbasaur', ext: 'gif', bytes: 999 } },
    };
    await saveCheckpoint(filePath, checkpoint);
    const loaded = await loadCheckpoint(filePath);
    expect(loaded).toEqual(checkpoint);
  });
});

describe('pruneUntrustedAnimated', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'sprite-animated-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes files with no matching trustworthy checkpoint entry', async () => {
    await writeFile(path.join(tmpDir, '1.gif'), 'stale-file-no-checkpoint-record');
    await writeFile(path.join(tmpDir, '2.gif'), 'trusted-file');
    const checkpoint: Checkpoint = {
      static: {},
      animated: {
        '2': { status: 'done', source: 'showdown-ani', name: 'ivysaur', ext: 'gif', bytes: 12 },
      },
    };

    const removed = await pruneUntrustedAnimated(tmpDir, checkpoint);

    expect(removed).toEqual(['1.gif']);
    await expect(readFile(path.join(tmpDir, '2.gif'), 'utf8')).resolves.toBe('trusted-file');
    await expect(readFile(path.join(tmpDir, '1.gif'), 'utf8')).rejects.toThrow();
  });

  it('removes a leftover generation-v-era file whose checkpoint entry lacks source attribution', async () => {
    await writeFile(path.join(tmpDir, '3.gif'), 'leftover-old-run');
    const checkpoint = {
      static: {},
      animated: { '3': { status: 'done', ext: 'gif', bytes: 5 } },
    } as unknown as Checkpoint;

    const removed = await pruneUntrustedAnimated(tmpDir, checkpoint);
    expect(removed).toEqual(['3.gif']);
  });

  it('returns an empty list when the directory does not exist yet', async () => {
    const removed = await pruneUntrustedAnimated(path.join(tmpDir, 'does-not-exist'), emptyCheckpoint());
    expect(removed).toEqual([]);
  });
});

describe('maybeConvertToWebp', () => {
  it('returns null (keeps the GIF) when the input cannot be decoded as an image', async () => {
    const result = await maybeConvertToWebp(Buffer.from('not a real gif'));
    expect(result).toBeNull();
  });
});
