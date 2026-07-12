import { describe, expect, it } from 'vitest';
import { mergeResolvedAssets, recordToCardRecords, type CardRecord, type PrimarySourceSnapshotRecord } from './buildStaticDatabase';
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
