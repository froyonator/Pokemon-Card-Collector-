import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findDigitalSnapshotSetDirs,
  purgeAllDatabaseFiles,
  purgeDigitalCards,
  purgeSnapshotAllGens,
  type CardDatabase,
  type CardRecord,
} from './purgeDigitalSets';

function card(overrides: Partial<CardRecord> & Pick<CardRecord, 'id' | 'setId' | 'dexNumber'>): CardRecord {
  return {
    name: 'Bulbasaur',
    setName: overrides.setId,
    localId: '1',
    rarity: 'Common',
    imageBase: '',
    language: 'en',
    ...overrides,
  };
}

describe('purgeDigitalCards', () => {
  it('removes only cards whose setId is digital-only, leaving physical cards untouched', () => {
    const database: CardDatabase = {
      '1': [
        card({ id: 'base1-1', setId: 'base1', dexNumber: 1 }),
        card({ id: 'A1-001', setId: 'A1', dexNumber: 1 }),
      ],
      '2': [card({ id: 'A2-001', setId: 'A2', dexNumber: 2 })],
    };

    const outcome = purgeDigitalCards(database);

    expect(outcome).toEqual({
      totalBefore: 3,
      removed: 2,
      totalAfter: 1,
      removedBySetId: { A1: 1, A2: 1 },
    });
    expect(database).toEqual({ '1': [card({ id: 'base1-1', setId: 'base1', dexNumber: 1 })] });
  });

  it('deletes a dex-number bucket entirely once it is emptied, rather than leaving []', () => {
    const database: CardDatabase = { '1': [card({ id: 'A1-001', setId: 'A1', dexNumber: 1 })] };
    purgeDigitalCards(database);
    expect(Object.prototype.hasOwnProperty.call(database, '1')).toBe(false);
  });

  it('is a no-op on an already-clean database (idempotent)', () => {
    const database: CardDatabase = { '1': [card({ id: 'base1-1', setId: 'base1', dexNumber: 1 })] };
    const outcome = purgeDigitalCards(database);
    expect(outcome).toEqual({ totalBefore: 1, removed: 0, totalAfter: 1, removedBySetId: {} });
    expect(database).toEqual({ '1': [card({ id: 'base1-1', setId: 'base1', dexNumber: 1 })] });
  });
});

describe('purgeAllDatabaseFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'purge-digital-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('purges both a flat <lang>.json file and a nested <lang>/gen<N>.json file, writing back only the changed one', async () => {
    const flatPath = path.join(tmpDir, 'en.json');
    const nestedDir = path.join(tmpDir, 'en');
    const nestedPath = path.join(nestedDir, 'gen2.json');
    await mkdir(nestedDir, { recursive: true });

    const flatDb: CardDatabase = {
      '1': [card({ id: 'base1-1', setId: 'base1', dexNumber: 1 }), card({ id: 'A1-001', setId: 'A1', dexNumber: 1 })],
    };
    const nestedDb: CardDatabase = {
      '152': [card({ id: 'sv01-1', setId: 'sv01', dexNumber: 152 })],
    };
    await writeFile(flatPath, JSON.stringify(flatDb), 'utf8');
    await writeFile(nestedPath, JSON.stringify(nestedDb), 'utf8');

    const results = await purgeAllDatabaseFiles(tmpDir);
    const byFile = new Map(results.map((r) => [r.file, r.outcome]));

    expect(byFile.get(flatPath)).toEqual({ totalBefore: 2, removed: 1, totalAfter: 1, removedBySetId: { A1: 1 } });
    expect(byFile.get(nestedPath)).toEqual({ totalBefore: 1, removed: 0, totalAfter: 1, removedBySetId: {} });

    const flatOnDisk: CardDatabase = JSON.parse(await readFile(flatPath, 'utf8'));
    expect(flatOnDisk).toEqual({ '1': [card({ id: 'base1-1', setId: 'base1', dexNumber: 1 })] });

    const nestedOnDisk: CardDatabase = JSON.parse(await readFile(nestedPath, 'utf8'));
    expect(nestedOnDisk).toEqual(nestedDb);
  });

  it('running twice reports zero removed on the second pass (idempotent)', async () => {
    const flatPath = path.join(tmpDir, 'de.json');
    const db: CardDatabase = {
      '1': [card({ id: 'A1-001', setId: 'A1', dexNumber: 1 })],
    };
    await writeFile(flatPath, JSON.stringify(db), 'utf8');

    const first = await purgeAllDatabaseFiles(tmpDir);
    expect(first[0].outcome.removed).toBe(1);

    const second = await purgeAllDatabaseFiles(tmpDir);
    expect(second[0].outcome.removed).toBe(0);
    expect(second[0].outcome.totalBefore).toBe(0);
  });
});

describe('findDigitalSnapshotSetDirs / purgeSnapshotAllGens', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'purge-snapshot-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds only digital-only set directories, across languages, leaving physical sets alone', async () => {
    await mkdir(path.join(tmpDir, 'en', 'A1', 'A1-001'), { recursive: true });
    await mkdir(path.join(tmpDir, 'en', 'base1', 'base1-1'), { recursive: true });
    await mkdir(path.join(tmpDir, 'de', 'B2a', 'B2a-001'), { recursive: true });

    const found = await findDigitalSnapshotSetDirs(tmpDir);
    expect(found).toEqual([
      { language: 'de', setId: 'B2a', dir: path.join(tmpDir, 'de', 'B2a') },
      { language: 'en', setId: 'A1', dir: path.join(tmpDir, 'en', 'A1') },
    ]);
  });

  it('returns [] for a missing directory instead of throwing', async () => {
    expect(await findDigitalSnapshotSetDirs(path.join(tmpDir, 'does-not-exist'))).toEqual([]);
  });

  it('purgeSnapshotAllGens deletes the found directories and is idempotent on a second run', async () => {
    await mkdir(path.join(tmpDir, 'en', 'A1', 'A1-001'), { recursive: true });
    await mkdir(path.join(tmpDir, 'en', 'base1', 'base1-1'), { recursive: true });

    const removed = await purgeSnapshotAllGens(tmpDir);
    expect(removed).toHaveLength(1);
    expect(await findDigitalSnapshotSetDirs(tmpDir)).toEqual([]);

    const secondPass = await purgeSnapshotAllGens(tmpDir);
    expect(secondPass).toEqual([]);
  });
});
