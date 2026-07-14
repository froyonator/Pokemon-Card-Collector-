// scripts/carddata/src/mirrorExternalImages.test.ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CardRecord } from './buildStaticDatabase';
import {
  checkRepoSizeOk,
  createPerHostDownloader,
  delayForHost,
  DEFAULT_HOST_DELAY_MS,
  emptyMirrorCheckpoint,
  extensionForContentType,
  HOST_DELAY_MS,
  hostOf,
  identityKey,
  isExternalHostedUrl,
  languageForCardFile,
  loadMirrorCheckpoint,
  MIRROR_HOSTED_BASE,
  MIRROR_REPO_SLUG,
  mirroredHostedUrl,
  mirrorExternalImages,
  parseCliArgs,
  PUSH_SIZE_THRESHOLD_BYTES,
  rewriteExternalUrls,
  saveMirrorCheckpoint,
  scanCardsDir,
  scanDatabase,
  SELF_HOSTED_HOST,
  type MirrorCheckpoint,
} from './mirrorExternalImages';

function card(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id: 'base1-44',
    name: 'Bulbasaur',
    dexNumber: 1,
    setId: 'base1',
    setName: 'Base Set',
    localId: '44',
    rarity: 'Common',
    imageBase: '',
    language: 'en',
    ...overrides,
  };
}

// --- host classification ----------------------------------------------------

describe('hostOf', () => {
  it('extracts the host from a well-formed url', () => {
    expect(hostOf('https://archives.bulbagarden.net/media/x.jpg')).toBe('archives.bulbagarden.net');
  });

  it('returns null for an unparseable value', () => {
    expect(hostOf('not-a-url')).toBeNull();
  });
});

describe('isExternalHostedUrl', () => {
  it('is false for undefined', () => {
    expect(isExternalHostedUrl(undefined)).toBe(false);
  });

  it('is false for a raw.githubusercontent.com url', () => {
    expect(isExternalHostedUrl(`https://${SELF_HOSTED_HOST}/froyonator/pcc-assets-a/main/en/base1/base1-44/thumb.webp`)).toBe(
      false
    );
  });

  it('is true for an upstream host', () => {
    expect(isExternalHostedUrl('https://archives.bulbagarden.net/media/x.jpg')).toBe(true);
  });

  it('is false for an unparseable value (nothing sane to mirror)', () => {
    expect(isExternalHostedUrl('not-a-url')).toBe(false);
  });
});

describe('extensionForContentType', () => {
  it('maps every content-type downloadAndValidateImage can accept', () => {
    expect(extensionForContentType('image/webp')).toBe('webp');
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/jpeg')).toBe('jpeg');
  });

  it('throws on anything else', () => {
    expect(() => extensionForContentType('text/html')).toThrow(/unsupported/);
  });
});

describe('identityKey', () => {
  it('joins language/setId/id', () => {
    expect(identityKey({ language: 'ja', setId: 'PCG1', id: 'wk-ja-PCG1-001' })).toBe('ja/PCG1/wk-ja-PCG1-001');
  });
});

describe('mirroredHostedUrl', () => {
  it('targets the dedicated mirror repo with the same path scheme as pcc-assets-a', () => {
    expect(MIRROR_REPO_SLUG).toBe('froyonator/pcc-assets-d');
    expect(MIRROR_HOSTED_BASE).toBe('https://raw.githubusercontent.com/froyonator/pcc-assets-d/main');
    expect(
      mirroredHostedUrl({ language: 'zh-cn', setId: 'collection151', id: 'wk-zh-cn-collection151-001' }, 'thumb.webp')
    ).toBe(
      'https://raw.githubusercontent.com/froyonator/pcc-assets-d/main/zh-cn/collection151/wk-zh-cn-collection151-001/thumb.webp'
    );
  });
});

describe('delayForHost', () => {
  it('gives the wiki archive host a 5s gap', () => {
    expect(delayForHost('archives.bulbagarden.net')).toBe(5000);
    expect(HOST_DELAY_MS['archives.bulbagarden.net']).toBe(5000);
  });

  it('gives every other host the default 1s gap', () => {
    expect(delayForHost('asia.pokemon-card.com')).toBe(DEFAULT_HOST_DELAY_MS);
    expect(delayForHost('www.pokemon-card.com')).toBe(1000);
  });
});

// --- scanDatabase (pure, in-memory) -----------------------------------------

describe('scanDatabase', () => {
  function freshState() {
    return { hostLangCounts: new Map<string, number>(), urlToIdentities: new Map(), recordsWithExternal: 0 };
  }

  it('ignores records with no hosted url and records already on the self-hosted mirror', () => {
    const db = {
      '1': [
        card({ hostedThumbUrl: undefined, hostedFullUrl: undefined }),
        card({
          id: 'base1-45',
          hostedThumbUrl: `https://${SELF_HOSTED_HOST}/froyonator/pcc-assets-a/main/en/base1/base1-45/thumb.webp`,
        }),
      ],
    };
    const state = freshState();
    const count = scanDatabase(db, 'en', state);
    expect(count).toBe(0);
    expect(state.urlToIdentities.size).toBe(0);
  });

  it('counts an external url once per host/language and groups identities by url', () => {
    const db = {
      '1': [
        card({
          id: 'wk-en-2024sv-1',
          hostedThumbUrl: 'https://archives.bulbagarden.net/media/x.jpg',
          hostedFullUrl: 'https://archives.bulbagarden.net/media/x.jpg',
        }),
      ],
      '6': [
        card({
          id: 'wk-en-vividvoltage-25',
          hostedThumbUrl: 'https://archives.bulbagarden.net/media/x.jpg', // same shared-reprint artwork
        }),
      ],
    };
    const state = freshState();
    const count = scanDatabase(db, 'en', state);
    expect(count).toBe(2); // two records touched
    // thumb+full on record 1 (2 refs) + thumb on record 2 (1 ref) = 3 total references
    expect(state.hostLangCounts.get('archives.bulbagarden.net|en')).toBe(3);
    // but only ONE distinct url, shared by two distinct card identities
    expect(state.urlToIdentities.size).toBe(1);
    const identities = [...state.urlToIdentities.values()][0];
    expect(identities.size).toBe(2);
  });
});

// --- checkpoint I/O ----------------------------------------------------------

describe('checkpoint load/save', () => {
  it('returns an empty checkpoint when the file does not exist', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mirror-checkpoint-'));
    const checkpoint = await loadMirrorCheckpoint(path.join(dir, 'missing.json'));
    expect(checkpoint).toEqual(emptyMirrorCheckpoint());
  });

  it('round-trips through save/load', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mirror-checkpoint-'));
    const checkpointPath = path.join(dir, 'progress.json');
    const checkpoint: MirrorCheckpoint = {
      images: {
        'https://archives.bulbagarden.net/media/x.jpg': {
          status: 'done',
          ext: 'jpeg',
          sha256: 'abc123',
          bytes: 12345,
          identities: ['en/base1/base1-44'],
        },
      },
    };
    await saveMirrorCheckpoint(checkpointPath, checkpoint);
    const loaded = await loadMirrorCheckpoint(checkpointPath);
    expect(loaded).toEqual(checkpoint);
  });
});

// --- scanCardsDir (real tmp fs, no network) ---------------------------------

describe('scanCardsDir', () => {
  async function writeCardsDirFixture(): Promise<string> {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    await writeFile(
      path.join(cardsDir, 'zh-cn.json'),
      JSON.stringify({
        '1': [
          card({
            id: 'wk-zh-cn-collection151-001',
            language: 'zh-cn',
            setId: 'collection151',
            hostedThumbUrl: 'https://archives.bulbagarden.net/media/a.jpg',
            hostedFullUrl: 'https://archives.bulbagarden.net/media/a.jpg',
          }),
        ],
      })
    );
    await mkdir(path.join(cardsDir, 'zh-cn'), { recursive: true });
    await writeFile(
      path.join(cardsDir, 'zh-cn', 'gen2.json'),
      JSON.stringify({
        '152': [
          card({
            id: 'wk-zh-cn-collection151-152',
            language: 'zh-cn',
            setId: 'collection151',
            dexNumber: 152,
            hostedThumbUrl: 'https://archives.bulbagarden.net/media/b.jpg',
          }),
        ],
      })
    );
    // A db-version.json sibling must never be treated as a card database.
    await writeFile(path.join(cardsDir, 'db-version.json'), JSON.stringify({ version: 1 }));
    return cardsDir;
  }

  it('walks flat and per-gen files, skips db-version.json, and aggregates across files', async () => {
    const cardsDir = await writeCardsDirFixture();
    const report = await scanCardsDir(cardsDir);
    expect(report.filesScanned).toBe(2);
    expect(report.recordsWithExternal).toBe(2);
    expect(report.urlToIdentities.size).toBe(2);
    const zhCnRow = report.hostLangCounts.find((r) => r.language === 'zh-cn' && r.host === 'archives.bulbagarden.net');
    expect(zhCnRow?.count).toBe(3); // 2 refs on the flat file's record + 1 on the gen2 record
  });

  it('derives language from the file path for the report', () => {
    return writeCardsDirFixture().then(async (cardsDir) => {
      const report = await scanCardsDir(cardsDir);
      expect(languageForCardFile(cardsDir, path.join(cardsDir, 'zh-cn.json'))).toBe('zh-cn');
      expect(languageForCardFile(cardsDir, path.join(cardsDir, 'zh-cn', 'gen2.json'))).toBe('zh-cn');
      expect(report.hostLangCounts.every((r) => r.language === 'zh-cn')).toBe(true);
    });
  });
});

// --- mirrorExternalImages (mocked fetch, real tmp fs, no real network) ------

describe('mirrorExternalImages', () => {
  function makeFetch(responses: Record<string, { status: number; contentType?: string; bytes?: Buffer }>): typeof fetch {
    return vi.fn(async (input: unknown) => {
      const url = String(input);
      const resp = responses[url];
      if (!resp) throw new Error(`unexpected fetch to ${url}`);
      return {
        ok: resp.status >= 200 && resp.status < 300,
        status: resp.status,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? resp.contentType ?? null : null) },
        arrayBuffer: async () => {
          const buf = resp.bytes ?? Buffer.alloc(0);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  // A minimal but real, decodable webp is awkward to hand-construct; instead
  // build a real PNG via a tiny synthetic buffer that `image-size` can read.
  // Simplest reliable option: a 1x1 PNG is too small to pass the pipeline's
  // own MIN_WIDTH/MIN_HEIGHT gate (200x280) -- so these tests exercise the
  // failure path (which never touches image-size) and, for the success
  // path, stub image-size indirectly by using a real generated PNG at a
  // valid size via sharp itself.
  async function realPngBytes(width: number, height: number): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } } })
      .png()
      .toBuffer();
  }

  it('is resume-safe: a checkpointed url is not re-fetched', async () => {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    await writeFile(
      path.join(cardsDir, 'en.json'),
      JSON.stringify({
        '1': [card({ id: 'wk-en-mep-1', hostedThumbUrl: 'https://archives.bulbagarden.net/media/x.jpg' })],
      })
    );
    const assetRepoDir = await mkdtemp(path.join(tmpdir(), 'asset-repo-'));
    const checkpointPath = path.join(await mkdtemp(path.join(tmpdir(), 'checkpoint-')), 'progress.json');
    await saveMirrorCheckpoint(checkpointPath, {
      images: {
        'https://archives.bulbagarden.net/media/x.jpg': {
          status: 'done',
          ext: 'jpeg',
          sha256: 'deadbeef',
          bytes: 1,
          identities: ['en/mep/wk-en-mep-1'],
        },
      },
    });
    const fetchImpl = makeFetch({});

    const summary = await mirrorExternalImages({ cardsDir, assetRepoDir, checkpointPath, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.alreadyDone).toBe(1);
    expect(summary.attemptedThisRun).toBe(0);
    expect(summary.remaining).toBe(0);
  });

  it('downloads a new url, validates it, writes original+thumb for every identity that shares it, and checkpoints', async () => {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    const sharedUrl = 'https://archives.bulbagarden.net/media/shared.jpg';
    await writeFile(
      path.join(cardsDir, 'en.json'),
      JSON.stringify({
        '1': [
          card({ id: 'wk-en-2024sv-1', setId: '2024sv', hostedThumbUrl: sharedUrl, hostedFullUrl: sharedUrl }),
          card({ id: 'wk-en-vividvoltage-25', setId: 'vividvoltage', hostedThumbUrl: sharedUrl }),
        ],
      })
    );
    const assetRepoDir = await mkdtemp(path.join(tmpdir(), 'asset-repo-'));
    const checkpointPath = path.join(await mkdtemp(path.join(tmpdir(), 'checkpoint-')), 'progress.json');
    const bytes = await realPngBytes(400, 560);
    const fetchImpl = makeFetch({ [sharedUrl]: { status: 200, contentType: 'image/png', bytes } });

    const summary = await mirrorExternalImages({ cardsDir, assetRepoDir, checkpointPath, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1); // downloaded ONCE despite two identities sharing the url
    expect(summary.succeededThisRun).toBe(1);
    expect(summary.remaining).toBe(0);

    const originalA = await readFile(path.join(assetRepoDir, 'en', '2024sv', 'wk-en-2024sv-1', 'original.png'));
    const originalB = await readFile(path.join(assetRepoDir, 'en', 'vividvoltage', 'wk-en-vividvoltage-25', 'original.png'));
    expect(originalA.equals(bytes)).toBe(true);
    expect(originalB.equals(bytes)).toBe(true);
    // thumb generated for both fan-out identities too
    await readFile(path.join(assetRepoDir, 'en', '2024sv', 'wk-en-2024sv-1', 'thumb.webp'));
    await readFile(path.join(assetRepoDir, 'en', 'vividvoltage', 'wk-en-vividvoltage-25', 'thumb.webp'));

    const checkpoint = await loadMirrorCheckpoint(checkpointPath);
    const entry = checkpoint.images[sharedUrl];
    expect(entry.status).toBe('done');
  });

  it('checkpoints a failed download as failed, without throwing, and does not retry it on the next run', async () => {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    const badUrl = 'https://archives.bulbagarden.net/media/broken.jpg';
    await writeFile(
      path.join(cardsDir, 'en.json'),
      JSON.stringify({ '1': [card({ id: 'wk-en-x-1', hostedThumbUrl: badUrl })] })
    );
    const assetRepoDir = await mkdtemp(path.join(tmpdir(), 'asset-repo-'));
    const checkpointPath = path.join(await mkdtemp(path.join(tmpdir(), 'checkpoint-')), 'progress.json');
    const fetchImpl = makeFetch({ [badUrl]: { status: 404 } });

    const summary = await mirrorExternalImages({ cardsDir, assetRepoDir, checkpointPath, fetchImpl });
    expect(summary.failedThisRun).toBe(1);

    const rerun = await mirrorExternalImages({ cardsDir, assetRepoDir, checkpointPath, fetchImpl: makeFetch({}) });
    expect(rerun.alreadyFailed).toBe(1);
    expect(rerun.attemptedThisRun).toBe(0);
  });

  it('respects onlyLanguage', async () => {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    await writeFile(
      path.join(cardsDir, 'en.json'),
      JSON.stringify({ '1': [card({ id: 'wk-en-x-1', hostedThumbUrl: 'https://archives.bulbagarden.net/media/en.jpg' })] })
    );
    await writeFile(
      path.join(cardsDir, 'zh-cn.json'),
      JSON.stringify({
        '1': [
          card({
            id: 'wk-zh-cn-x-1',
            language: 'zh-cn',
            hostedThumbUrl: 'https://archives.bulbagarden.net/media/zhcn.jpg',
          }),
        ],
      })
    );
    const assetRepoDir = await mkdtemp(path.join(tmpdir(), 'asset-repo-'));
    const checkpointPath = path.join(await mkdtemp(path.join(tmpdir(), 'checkpoint-')), 'progress.json');
    const bytes = await realPngBytes(400, 560);
    const fetchImpl = makeFetch({
      'https://archives.bulbagarden.net/media/zhcn.jpg': { status: 200, contentType: 'image/png', bytes },
    });

    const summary = await mirrorExternalImages({
      cardsDir,
      assetRepoDir,
      checkpointPath,
      fetchImpl,
      onlyLanguage: 'zh-cn',
    });

    expect(summary.scanned).toBe(2); // both urls are known to the scan
    expect(summary.attemptedThisRun).toBe(1); // only the zh-cn one was attempted
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// --- rewriteExternalUrls (idempotent apply pass) ----------------------------

describe('rewriteExternalUrls', () => {
  it('rewrites only fields with a done checkpoint entry, and is a no-op on a second run', async () => {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    const mirroredUrl = 'https://archives.bulbagarden.net/media/mirrored.jpg';
    const unmirroredUrl = 'https://archives.bulbagarden.net/media/unmirrored.jpg';
    await writeFile(
      path.join(cardsDir, 'en.json'),
      JSON.stringify({
        '1': [
          card({
            id: 'wk-en-mirrored-1',
            setId: 'mirrored',
            hostedThumbUrl: mirroredUrl,
            hostedFullUrl: mirroredUrl,
          }),
          card({ id: 'wk-en-unmirrored-1', setId: 'unmirrored', hostedThumbUrl: unmirroredUrl }),
        ],
      })
    );
    const checkpoint: MirrorCheckpoint = {
      images: {
        [mirroredUrl]: {
          status: 'done',
          ext: 'jpeg',
          sha256: 'abc',
          bytes: 100,
          identities: ['en/mirrored/wk-en-mirrored-1'],
        },
      },
    };

    const summary = await rewriteExternalUrls(cardsDir, checkpoint);
    expect(summary.filesRewritten).toBe(1);
    expect(summary.fieldsRewritten).toBe(2); // thumb + full on the mirrored record

    const rewritten = JSON.parse(await readFile(path.join(cardsDir, 'en.json'), 'utf8')) as Record<string, CardRecord[]>;
    const mirroredCard = rewritten['1'].find((c) => c.id === 'wk-en-mirrored-1')!;
    expect(mirroredCard.hostedThumbUrl).toBe(
      'https://raw.githubusercontent.com/froyonator/pcc-assets-d/main/en/mirrored/wk-en-mirrored-1/thumb.webp'
    );
    expect(mirroredCard.hostedFullUrl).toBe(
      'https://raw.githubusercontent.com/froyonator/pcc-assets-d/main/en/mirrored/wk-en-mirrored-1/original.jpeg'
    );
    const unmirroredCard = rewritten['1'].find((c) => c.id === 'wk-en-unmirrored-1')!;
    expect(unmirroredCard.hostedThumbUrl).toBe(unmirroredUrl); // left alone: no done checkpoint entry yet

    // Idempotent: re-running finds nothing left to rewrite for the mirrored record.
    const second = await rewriteExternalUrls(cardsDir, checkpoint);
    expect(second.filesRewritten).toBe(0);
    expect(second.fieldsRewritten).toBe(0);
  });

  it('dry-run reports the identical rewrite plan with samples but writes nothing', async () => {
    const cardsDir = await mkdtemp(path.join(tmpdir(), 'cards-dir-'));
    const mirroredUrl = 'https://archives.bulbagarden.net/media/mirrored.jpg';
    const original = JSON.stringify({
      '1': [card({ id: 'wk-en-mirrored-1', setId: 'mirrored', hostedThumbUrl: mirroredUrl, hostedFullUrl: mirroredUrl })],
    });
    await writeFile(path.join(cardsDir, 'en.json'), original);
    const checkpoint: MirrorCheckpoint = {
      images: {
        [mirroredUrl]: {
          status: 'done',
          ext: 'jpeg',
          sha256: 'abc',
          bytes: 100,
          identities: ['en/mirrored/wk-en-mirrored-1'],
        },
      },
    };

    const summary = await rewriteExternalUrls(cardsDir, checkpoint, true);
    expect(summary.dryRun).toBe(true);
    expect(summary.fieldsRewritten).toBe(2);
    expect(summary.samples).toHaveLength(2);
    expect(summary.samples[0].from).toBe(mirroredUrl);
    expect(summary.samples[0].to).toContain('pcc-assets-d');

    // File untouched byte-for-byte.
    expect(await readFile(path.join(cardsDir, 'en.json'), 'utf8')).toBe(original);
  });
});

// --- CLI arg parsing ---------------------------------------------------------

describe('parseCliArgs', () => {
  it('defaults to scan mode', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'scan', lang: undefined, limit: undefined, dryRun: false });
  });

  it('parses --mirror --lang --limit', () => {
    expect(parseCliArgs(['--mirror', '--lang', 'zh-cn', '--limit', '25'])).toEqual({
      mode: 'mirror',
      lang: 'zh-cn',
      limit: 25,
      dryRun: false,
    });
  });

  it('parses --apply and --apply --dry-run', () => {
    expect(parseCliArgs(['--apply'])).toEqual({ mode: 'apply', lang: undefined, limit: undefined, dryRun: false });
    expect(parseCliArgs(['--apply', '--dry-run'])).toEqual({
      mode: 'apply',
      lang: undefined,
      limit: undefined,
      dryRun: true,
    });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow(/Unknown option/);
  });

  it('rejects a non-integer --limit', () => {
    expect(() => parseCliArgs(['--limit', 'abc'])).toThrow(/--limit must be/);
  });
});

// --- push size guard (no real network: gh invocation is injected) ----------

describe('checkRepoSizeOk', () => {
  it('uses a ~4 GB ceiling scoped to the dedicated mirror repo', () => {
    expect(PUSH_SIZE_THRESHOLD_BYTES).toBe(4 * 1024 * 1024 * 1024);
  });

  it('reports not-ok when the repo exceeds the threshold', async () => {
    // 8,184,098 KB (~7.8 GB) -- the size pcc-assets-a actually reports; a
    // mirror repo that ever grew to this size must refuse the push.
    const runGh = vi.fn().mockResolvedValue({ stdout: '8184098\n' });
    const result = await checkRepoSizeOk(MIRROR_REPO_SLUG, PUSH_SIZE_THRESHOLD_BYTES, runGh);
    expect(result.ok).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(PUSH_SIZE_THRESHOLD_BYTES);
    expect(runGh).toHaveBeenCalledWith(['api', 'repos/froyonator/pcc-assets-d', '--jq', '.size']);
  });

  it('reports ok when the repo is under the threshold', async () => {
    const runGh = vi.fn().mockResolvedValue({ stdout: '100\n' }); // 100 KB
    const result = await checkRepoSizeOk(MIRROR_REPO_SLUG, PUSH_SIZE_THRESHOLD_BYTES, runGh);
    expect(result.ok).toBe(true);
  });
});

// --- sanity: createPerHostDownloader dispatches per host, not globally -----

describe('createPerHostDownloader', () => {
  it('creates independent gated downloaders keyed by host', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const download = createPerHostDownloader(fetchImpl);
    await download('https://archives.bulbagarden.net/media/a.jpg');
    await download('https://asia.pokemon-card.com/en/card-img/1.png');
    expect(calls).toEqual([
      'https://archives.bulbagarden.net/media/a.jpg',
      'https://asia.pokemon-card.com/en/card-img/1.png',
    ]);
  });
});
