import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDbVersionPayload,
  mergeResolvedAssets,
  outputPathForLanguage,
  parseGenerationFlag,
  parseLanguagesFlag,
  recordToCardRecords,
  type CardRecord,
  type PrimarySourceSnapshotRecord,
} from './buildStaticDatabase';
import type { ResolvedAssets } from './resolveCardAssets';

const baseRecord: PrimarySourceSnapshotRecord = {
  id: 'me01-001',
  name: 'Bulbasaur',
  localId: '001',
  rarity: 'Common',
  set: { id: 'me01', name: 'Mega Evolution' },
  dexId: [1],
  image: 'https://assets.tcgdex.net/en/me/me01/001',
  category: 'Pokemon',
  language: 'en',
};

describe('recordToCardRecords', () => {
  it('maps a single-dexId record onto one CardRecord matching the app CardRecord shape', () => {
    expect(recordToCardRecords(baseRecord)).toEqual([
      {
        id: 'me01-001',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'me01',
        setName: 'Mega Evolution',
        localId: '001',
        rarity: 'Common',
        imageBase: 'https://assets.tcgdex.net/en/me/me01/001',
        language: 'en',
      },
    ]);
  });

  it('emits one CardRecord per dex number for a record with multiple dexId entries', () => {
    const tagTeamRecord: PrimarySourceSnapshotRecord = {
      ...baseRecord,
      id: 'sm12-258',
      name: 'Arceus & Dialga & Palkia GX',
      dexId: [3, 6, 9],
    };

    const cards = recordToCardRecords(tagTeamRecord);
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.dexNumber)).toEqual([3, 6, 9]);
    // Every entry shares the same underlying card identity -- only the dex
    // number differs -- since this is genuinely one card attributed to
    // multiple Pokemon, not three distinct cards.
    for (const card of cards) {
      expect(card.id).toBe('sm12-258');
      expect(card.name).toBe('Arceus & Dialga & Palkia GX');
    }
  });

  it('defaults imageBase to an empty string when image is absent', () => {
    const noImageRecord: PrimarySourceSnapshotRecord = { ...baseRecord, image: undefined };
    expect(recordToCardRecords(noImageRecord)[0].imageBase).toBe('');
  });

  it('defaults rarity to "Unknown" when the primary source has no rarity recorded for a card, matching the live-fetch path\'s own fallback', () => {
    const noRarityRecord: PrimarySourceSnapshotRecord = { ...baseRecord, rarity: '' };
    expect(recordToCardRecords(noRarityRecord)[0].rarity).toBe('Unknown');
  });

  it('skips a record with no dexId array', () => {
    const { dexId, ...withoutDexId } = baseRecord;
    expect(recordToCardRecords(withoutDexId as PrimarySourceSnapshotRecord)).toEqual([]);
  });

  it('skips a record with an empty dexId array', () => {
    expect(recordToCardRecords({ ...baseRecord, dexId: [] })).toEqual([]);
  });

  it('drops out-of-range dex numbers while keeping in-range ones from the same record', () => {
    const mixedRecord: PrimarySourceSnapshotRecord = { ...baseRecord, dexId: [0, 151, 152, 999] };
    const cards = recordToCardRecords(mixedRecord);
    expect(cards.map((card) => card.dexNumber)).toEqual([151]);
  });

  it('drops a record whose set belongs to a digital-only set (this app tracks physical cards only), defense-in-depth even given a valid dexId', () => {
    const digitalRecord: PrimarySourceSnapshotRecord = { ...baseRecord, set: { id: 'A1', name: 'Genetic Apex' } };
    expect(recordToCardRecords(digitalRecord)).toEqual([]);
  });

  it('defaults to the Gen1 range (1-151) when no range is given', () => {
    const mixedRecord: PrimarySourceSnapshotRecord = { ...baseRecord, dexId: [1, 152] };
    expect(recordToCardRecords(mixedRecord).map((c) => c.dexNumber)).toEqual([1]);
  });

  it('slices by an explicit generation range instead, e.g. Gen2 (152-251)', () => {
    const mixedRecord: PrimarySourceSnapshotRecord = { ...baseRecord, dexId: [1, 151, 152, 251, 252] };
    const gen2Range = { generation: 2, min: 152, max: 251 };
    const cards = recordToCardRecords(mixedRecord, gen2Range);
    expect(cards.map((card) => card.dexNumber)).toEqual([152, 251]);
  });

  it('emits nothing for a range that matches none of the record\'s dexIds', () => {
    const record: PrimarySourceSnapshotRecord = { ...baseRecord, dexId: [1] };
    const gen5Range = { generation: 5, min: 494, max: 649 };
    expect(recordToCardRecords(record, gen5Range)).toEqual([]);
  });
});

describe('mergeResolvedAssets', () => {
  const card: CardRecord = recordToCardRecords(baseRecord)[0];

  it('leaves the card completely unchanged when the resolver found nothing better', () => {
    expect(mergeResolvedAssets(card, {})).toEqual(card);
  });

  it('adds hostedThumbUrl and hostedFullUrl onto the final CardRecord shape when the resolver found a hosted image', () => {
    const resolved: ResolvedAssets = {
      thumbUrl: 'https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/en/me01/me01-001/thumb.webp',
      fullUrl: 'https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/en/me01/me01-001/original.webp',
    };
    expect(mergeResolvedAssets(card, resolved)).toEqual({
      ...card,
      hostedThumbUrl: resolved.thumbUrl,
      hostedFullUrl: resolved.fullUrl,
    });
  });

  it('overrides name when the resolver supplied a resolvedName, leaving every other field untouched', () => {
    const resolved: ResolvedAssets = { resolvedName: 'トランセル' };
    expect(mergeResolvedAssets(card, resolved)).toEqual({ ...card, name: 'トランセル' });
  });

  it('does not mutate the original card passed in', () => {
    const original = { ...card };
    mergeResolvedAssets(card, { thumbUrl: 'https://example.invalid/thumb.webp' });
    expect(card).toEqual(original);
  });
});

describe('outputPathForLanguage', () => {
  const outputDir = path.join('public', 'data', 'cards');

  it('keeps the existing Gen1 convention (<outputDir>/<language>.json) when generation is null', () => {
    expect(outputPathForLanguage(outputDir, 'en', null)).toBe(path.join(outputDir, 'en.json'));
  });

  it('nests Gen2-9 under a per-language subdirectory as <outputDir>/<language>/gen<N>.json', () => {
    expect(outputPathForLanguage(outputDir, 'en', 2)).toBe(path.join(outputDir, 'en', 'gen2.json'));
    expect(outputPathForLanguage(outputDir, 'ja', 9)).toBe(path.join(outputDir, 'ja', 'gen9.json'));
  });
});

describe('parseGenerationFlag', () => {
  it('returns null (Gen1) for no arguments', () => {
    expect(parseGenerationFlag([])).toBeNull();
  });

  it('parses --gen <N> for N in 2-9', () => {
    expect(parseGenerationFlag(['--gen', '2'])).toBe(2);
    expect(parseGenerationFlag(['--gen', '9'])).toBe(9);
  });

  it('rejects --gen 1 (Gen1 is built by the default, flag-less invocation)', () => {
    expect(() => parseGenerationFlag(['--gen', '1'])).toThrow();
  });

  it('rejects out-of-range or non-numeric values', () => {
    expect(() => parseGenerationFlag(['--gen', '10'])).toThrow();
    expect(() => parseGenerationFlag(['--gen', 'x'])).toThrow();
  });

  it('rejects an unknown flag', () => {
    expect(() => parseGenerationFlag(['--bogus'])).toThrow();
  });

  it('tolerates a combined --langs flag without erroring', () => {
    expect(parseGenerationFlag(['--gen', '2', '--langs', 'ja,fr'])).toBe(2);
  });
});

describe('buildDbVersionPayload', () => {
  it('stamps the injected clock\'s ISO timestamp as `version`', () => {
    const fixedNow = new Date('2026-07-14T12:00:00.000Z');
    expect(buildDbVersionPayload(() => fixedNow)).toEqual({ version: '2026-07-14T12:00:00.000Z' });
  });

  it('defaults to the real wall clock when no clock is injected', () => {
    const before = Date.now();
    const payload = buildDbVersionPayload();
    const after = Date.now();
    const stamped = new Date(payload.version).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});

describe('parseLanguagesFlag', () => {
  it('returns null when --langs is absent (unrestricted default)', () => {
    expect(parseLanguagesFlag([])).toBeNull();
    expect(parseLanguagesFlag(['--gen', '2'])).toBeNull();
  });

  it('parses a comma-separated list', () => {
    expect(parseLanguagesFlag(['--langs', 'ja,fr,de'])).toEqual(['ja', 'fr', 'de']);
  });

  it('works combined with --gen in either order', () => {
    expect(parseLanguagesFlag(['--gen', '2', '--langs', 'ja'])).toEqual(['ja']);
    expect(parseLanguagesFlag(['--langs', 'ja', '--gen', '2'])).toEqual(['ja']);
  });

  it('rejects an empty value', () => {
    expect(() => parseLanguagesFlag(['--langs', ''])).toThrow();
  });
});
