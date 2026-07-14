// scripts/carddata/src/harvest/repairDuplicates.test.ts
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { MIRROR_HOSTED_BASE } from '../mirrorExternalImages';
import {
  buildRepairReport,
  clearDuplicateCards,
  collectMirroredCards,
  findDuplicateGroups,
  parseMirroredFullUrl,
  type DuplicateAuditCard,
} from './repairDuplicates';

function mirroredUrl(language: string, setId: string, id: string, filename: string): string {
  return `${MIRROR_HOSTED_BASE}/${language}/${setId}/${id}/${filename}`;
}

function card(overrides: Partial<CardRecord> & Pick<CardRecord, 'id' | 'setId' | 'localId'>): CardRecord {
  return {
    name: 'Bulbasaur',
    dexNumber: 1,
    setName: 'Collection 151',
    rarity: 'Common',
    imageBase: '',
    language: 'zh-cn',
    ...overrides,
  };
}

describe('parseMirroredFullUrl', () => {
  it('parses a well-formed mirror URL into its path pieces', () => {
    expect(parseMirroredFullUrl(mirroredUrl('zh-cn', 'collection151', 'wk-zh-cn-collection151-001', 'original.jpeg'))).toEqual({
      language: 'zh-cn',
      setId: 'collection151',
      id: 'wk-zh-cn-collection151-001',
      ext: 'jpeg',
    });
  });

  it('returns null for an external (unmirrored) URL', () => {
    expect(parseMirroredFullUrl('https://archives.bulbagarden.net/foo/Bar.jpg')).toBeNull();
  });

  it('returns null for undefined (no image at all)', () => {
    expect(parseMirroredFullUrl(undefined)).toBeNull();
  });

  it('returns null for a thumb filename (only original.* is a full-image reference)', () => {
    expect(parseMirroredFullUrl(mirroredUrl('zh-cn', 'collection151', 'id-1', 'thumb.webp'))).toBeNull();
  });

  it('returns null for a malformed path (wrong segment count)', () => {
    expect(parseMirroredFullUrl(`${MIRROR_HOSTED_BASE}/zh-cn/collection151/original.jpeg`)).toBeNull();
  });
});

describe('collectMirroredCards', () => {
  it('collects only cards whose hostedFullUrl is mirrored under the requested language', () => {
    const database: Record<string, CardRecord[]> = {
      '1': [
        card({
          id: 'wk-zh-cn-collection151-001',
          setId: 'collection151',
          localId: '001',
          hostedFullUrl: mirroredUrl('zh-cn', 'collection151', 'wk-zh-cn-collection151-001', 'original.jpeg'),
        }),
        card({
          id: 'wk-zh-cn-collection151-002',
          localId: '002',
          setId: 'collection151',
          // still an external (unmirrored) hotlink -- not auditable yet.
          hostedFullUrl: 'https://archives.bulbagarden.net/foo/Bar.jpg',
        }),
        card({ id: 'wk-zh-cn-collection151-003', localId: '003', setId: 'collection151' /* no image at all */ }),
      ],
    };

    const result = collectMirroredCards(database, 'zh-cn');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ cardId: 'wk-zh-cn-collection151-001', setId: 'collection151', localId: '001', ext: 'jpeg' });
  });

  it('excludes a mirrored URL belonging to a different language', () => {
    const database: Record<string, CardRecord[]> = {
      '1': [
        card({
          id: 'wk-id-collection151-001',
          setId: 'collection151',
          localId: '001',
          language: 'id',
          hostedFullUrl: mirroredUrl('id', 'collection151', 'wk-id-collection151-001', 'original.jpeg'),
        }),
      ],
    };
    expect(collectMirroredCards(database, 'zh-cn')).toHaveLength(0);
  });
});

describe('findDuplicateGroups', () => {
  const base: DuplicateAuditCard = {
    cardId: 'a',
    dexNumber: 1,
    name: 'Bulbasaur',
    setId: 'collection151',
    localId: '001',
    language: 'zh-cn',
    ext: 'jpeg',
  };

  it('groups cards in the SAME set sharing an identical hash', () => {
    const cards: DuplicateAuditCard[] = [
      { ...base, cardId: 'a', localId: '001' },
      { ...base, cardId: 'b', localId: '002' },
      { ...base, cardId: 'c', localId: '003' },
    ];
    const hashes = new Map([
      ['a', 'HASH1'],
      ['b', 'HASH1'],
      ['c', 'HASH2'],
    ]);
    const groups = findDuplicateGroups(cards, hashes);
    expect(groups).toHaveLength(1);
    expect(groups[0].hash).toBe('HASH1');
    expect(groups[0].cards.map((c) => c.cardId).sort()).toEqual(['a', 'b']);
  });

  it('does NOT group identical hashes across different sets (legitimate shared reprint art)', () => {
    const cards: DuplicateAuditCard[] = [
      { ...base, cardId: 'a', setId: 'setOne', localId: '001' },
      { ...base, cardId: 'b', setId: 'setTwo', localId: '001' },
    ];
    const hashes = new Map([
      ['a', 'HASH1'],
      ['b', 'HASH1'],
    ]);
    expect(findDuplicateGroups(cards, hashes)).toHaveLength(0);
  });

  it('does not flag a single card with a unique hash', () => {
    const cards: DuplicateAuditCard[] = [{ ...base, cardId: 'a' }];
    const hashes = new Map([['a', 'HASH1']]);
    expect(findDuplicateGroups(cards, hashes)).toHaveLength(0);
  });

  it('skips cards with no hash available (unreadable local mirror file)', () => {
    const cards: DuplicateAuditCard[] = [
      { ...base, cardId: 'a', localId: '001' },
      { ...base, cardId: 'b', localId: '002' },
    ];
    const hashes = new Map([['a', 'HASH1']]); // 'b' missing -- file could not be read
    expect(findDuplicateGroups(cards, hashes)).toHaveLength(0);
  });

  it('scopes grouping by language too, not just setId', () => {
    const cards: DuplicateAuditCard[] = [
      { ...base, cardId: 'a', language: 'zh-cn', localId: '001' },
      { ...base, cardId: 'b', language: 'id', localId: '001' },
    ];
    const hashes = new Map([
      ['a', 'HASH1'],
      ['b', 'HASH1'],
    ]);
    expect(findDuplicateGroups(cards, hashes)).toHaveLength(0);
  });

  it('is deterministically ordered by setId then hash', () => {
    const cards: DuplicateAuditCard[] = [
      { ...base, cardId: 'a', setId: 'zSet', localId: '001' },
      { ...base, cardId: 'b', setId: 'zSet', localId: '002' },
      { ...base, cardId: 'c', setId: 'aSet', localId: '001' },
      { ...base, cardId: 'd', setId: 'aSet', localId: '002' },
    ];
    const hashes = new Map([
      ['a', 'H'],
      ['b', 'H'],
      ['c', 'H'],
      ['d', 'H'],
    ]);
    const groups = findDuplicateGroups(cards, hashes);
    expect(groups.map((g) => g.setId)).toEqual(['aSet', 'zSet']);
  });
});

describe('clearDuplicateCards', () => {
  it('clears hostedThumbUrl/hostedFullUrl on every member of a duplicate group', () => {
    const database: Record<string, CardRecord[]> = {
      '1': [
        card({
          id: 'a',
          setId: 'collection151',
          localId: '001',
          hostedThumbUrl: mirroredUrl('zh-cn', 'collection151', 'a', 'thumb.webp'),
          hostedFullUrl: mirroredUrl('zh-cn', 'collection151', 'a', 'original.jpeg'),
        }),
        card({
          id: 'b',
          setId: 'collection151',
          localId: '002',
          hostedThumbUrl: mirroredUrl('zh-cn', 'collection151', 'b', 'thumb.webp'),
          hostedFullUrl: mirroredUrl('zh-cn', 'collection151', 'b', 'original.jpeg'),
        }),
        card({
          id: 'c',
          setId: 'collection151',
          localId: '003',
          hostedThumbUrl: mirroredUrl('zh-cn', 'collection151', 'c', 'thumb.webp'),
          hostedFullUrl: mirroredUrl('zh-cn', 'collection151', 'c', 'original.jpeg'),
        }),
      ],
    };
    const groups = findDuplicateGroups(
      [
        { cardId: 'a', dexNumber: 1, name: 'Bulbasaur', setId: 'collection151', localId: '001', language: 'zh-cn', ext: 'jpeg' },
        { cardId: 'b', dexNumber: 1, name: 'Bulbasaur', setId: 'collection151', localId: '002', language: 'zh-cn', ext: 'jpeg' },
        { cardId: 'c', dexNumber: 1, name: 'Bulbasaur', setId: 'collection151', localId: '003', language: 'zh-cn', ext: 'jpeg' },
      ],
      new Map([
        ['a', 'HASH1'],
        ['b', 'HASH1'],
        ['c', 'HASH2'],
      ])
    );

    const repaired = clearDuplicateCards(database, groups);

    expect(repaired.map((r) => r.cardId).sort()).toEqual(['a', 'b']);
    const byId = Object.fromEntries(database['1'].map((c) => [c.id, c]));
    expect(byId['a'].hostedThumbUrl).toBeUndefined();
    expect(byId['a'].hostedFullUrl).toBeUndefined();
    expect(byId['b'].hostedThumbUrl).toBeUndefined();
    expect(byId['b'].hostedFullUrl).toBeUndefined();
    // Card 'c' had a unique hash -- untouched.
    expect(byId['c'].hostedThumbUrl).toBeDefined();
    expect(byId['c'].hostedFullUrl).toBeDefined();
  });

  it('records the previous URLs and group size in the repair record', () => {
    const database: Record<string, CardRecord[]> = {
      '1': [
        card({
          id: 'a',
          setId: 'collection151',
          localId: '001',
          hostedThumbUrl: 'https://raw.githubusercontent.com/x/y/main/thumb.webp',
          hostedFullUrl: 'https://raw.githubusercontent.com/x/y/main/original.jpeg',
        }),
        card({ id: 'b', setId: 'collection151', localId: '002' }),
      ],
    };
    const groups = findDuplicateGroups(
      [
        { cardId: 'a', dexNumber: 1, name: 'Bulbasaur', setId: 'collection151', localId: '001', language: 'zh-cn', ext: 'jpeg' },
        { cardId: 'b', dexNumber: 1, name: 'Bulbasaur', setId: 'collection151', localId: '002', language: 'zh-cn', ext: 'jpeg' },
      ],
      new Map([
        ['a', 'HASH1'],
        ['b', 'HASH1'],
      ])
    );

    const [record] = clearDuplicateCards(database, groups);
    expect(record).toMatchObject({
      cardId: 'a',
      duplicateHash: 'HASH1',
      groupSize: 2,
      previousHostedThumbUrl: 'https://raw.githubusercontent.com/x/y/main/thumb.webp',
      previousHostedFullUrl: 'https://raw.githubusercontent.com/x/y/main/original.jpeg',
    });
  });

  it('returns an empty array and touches nothing when there are no groups', () => {
    const database: Record<string, CardRecord[]> = {
      '1': [card({ id: 'a', setId: 'collection151', localId: '001', hostedFullUrl: 'https://example.invalid/x.jpg' })],
    };
    expect(clearDuplicateCards(database, [])).toEqual([]);
    expect(database['1'][0].hostedFullUrl).toBe('https://example.invalid/x.jpg');
  });
});

describe('buildRepairReport', () => {
  it('wraps groups/cards with language and counts', () => {
    const report = buildRepairReport(
      'zh-cn',
      [{ language: 'zh-cn', setId: 'collection151', hash: 'HASH1', cards: [] }],
      [
        {
          cardId: 'a',
          dexNumber: 1,
          name: 'Bulbasaur',
          setId: 'collection151',
          localId: '001',
          previousHostedThumbUrl: null,
          previousHostedFullUrl: null,
          duplicateHash: 'HASH1',
          groupSize: 2,
        },
      ],
      '2026-07-14T00:00:00.000Z'
    );
    expect(report).toEqual({
      language: 'zh-cn',
      clearedAt: '2026-07-14T00:00:00.000Z',
      groupCount: 1,
      cardCount: 1,
      cards: report.cards,
    });
  });
});
