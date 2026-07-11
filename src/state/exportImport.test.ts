import { describe, expect, it } from 'vitest';
import { buildExportPayload, exportFileName, parseImportPayload } from './exportImport';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { DEFAULT_CARD_OVERRIDES } from '../data/defaultCardOverrides';

const baseState = {
  language: 'en',
  activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
  groups: DEFAULT_RARITY_GROUPS,
  owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint' as const, addedAt: '' } },
  wishlist: {},
  selectedGenerations: [1],
  cardOverrides: { 'svp-044': 'full-art' },
  uploadedImages: { 'svp-044': 'data:image/jpeg;base64,ABC' },
  binders: [
    {
      id: 'binder-1',
      name: 'My Binder',
      language: 'en',
      config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' as const },
      customOrder: null,
    },
  ],
  activeBinderId: 'binder-1',
};

describe('buildExportPayload', () => {
  it('includes only user-generated data with a version number', () => {
    const payload = buildExportPayload(baseState);
    expect(payload.version).toBe(1);
    expect(payload.owned).toEqual(baseState.owned);
    expect(payload.groups).toEqual(DEFAULT_RARITY_GROUPS);
    expect(payload.selectedGenerations).toEqual([1]);
    expect(payload.cardOverrides).toEqual({ 'svp-044': 'full-art' });
    expect(payload.uploadedImages).toEqual({ 'svp-044': 'data:image/jpeg;base64,ABC' });
  });
});

describe('exportFileName', () => {
  it('formats a date as pokemon-collection-export-YYYY-MM-DD.json', () => {
    expect(exportFileName(new Date('2026-07-10T12:00:00.000Z'))).toBe(
      'pokemon-collection-export-2026-07-10.json'
    );
  });
});

describe('parseImportPayload', () => {
  it('parses a valid export payload', () => {
    const payload = buildExportPayload(baseState);
    const parsed = parseImportPayload(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('throws for an unsupported version', () => {
    expect(() => parseImportPayload(JSON.stringify({ version: 2 }))).toThrow(
      'Unsupported export file version.'
    );
  });

  it('throws for malformed data missing required fields', () => {
    expect(() => parseImportPayload(JSON.stringify({ version: 1 }))).toThrow(
      'This file does not look like a valid export.'
    );
  });

  it('throws for invalid JSON', () => {
    expect(() => parseImportPayload('not json')).toThrow();
  });

  it('throws when a group is missing its rarities array', () => {
    const payload = {
      version: 1,
      language: 'en',
      activeGroupIds: ['x'],
      groups: [{ id: 'x', name: 'y' }],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    expect(() => parseImportPayload(JSON.stringify(payload))).toThrow(
      'This file does not look like a valid export.'
    );
  });

  it('throws when activeGroupIds is not a string array', () => {
    const payload = {
      version: 1,
      language: 'en',
      activeGroupIds: [1, 2],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
    };
    expect(() => parseImportPayload(JSON.stringify(payload))).toThrow(
      'This file does not look like a valid export.'
    );
  });

  it('throws when owned is an array instead of a record', () => {
    const payload = {
      version: 1,
      language: 'en',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: [],
      wishlist: {},
      selectedGenerations: [1],
    };
    expect(() => parseImportPayload(JSON.stringify(payload))).toThrow(
      'This file does not look like a valid export.'
    );
  });

  it('defaults selectedGenerations to [1] for a backup exported before multi-generation support existed', () => {
    const preFeaturePayload = {
      version: 1,
      language: 'en',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      // no selectedGenerations key at all, matching a real pre-feature export file
    };
    const parsed = parseImportPayload(JSON.stringify(preFeaturePayload));
    expect(parsed.selectedGenerations).toEqual([1]);
  });

  it('defaults cardOverrides to the seeded defaults for a backup exported before this feature existed', () => {
    const preFeaturePayload = {
      version: 1,
      language: 'en',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      // no cardOverrides key at all, matching a real pre-feature export file
    };
    const parsed = parseImportPayload(JSON.stringify(preFeaturePayload));
    expect(parsed.cardOverrides).toEqual(DEFAULT_CARD_OVERRIDES);
  });

  it('throws when cardOverrides is present but not a plain object of strings', () => {
    const badPayload = { ...baseState, version: 1, cardOverrides: { 'svp-044': 42 } };
    expect(() => parseImportPayload(JSON.stringify(badPayload))).toThrow(
      'This file does not look like a valid export.'
    );
  });

  it('defaults uploadedImages to an empty map for a backup exported before this feature existed', () => {
    const preFeaturePayload = {
      version: 1,
      language: 'en',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      // no uploadedImages key at all, matching a real pre-feature export file
    };
    const parsed = parseImportPayload(JSON.stringify(preFeaturePayload));
    expect(parsed.uploadedImages).toEqual({});
  });

  it('throws when uploadedImages is present but not a plain object of strings', () => {
    const badPayload = { ...baseState, version: 1, uploadedImages: { 'svp-044': 42 } };
    expect(() => parseImportPayload(JSON.stringify(badPayload))).toThrow(
      'This file does not look like a valid export.'
    );
  });
});

const sampleBinder = {
  id: 'binder-1',
  name: 'My Binder',
  language: 'en',
  config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' as const },
  customOrder: null,
};

describe('binders in export/import', () => {
  it('buildExportPayload includes binders and activeBinderId', () => {
    const payload = buildExportPayload({
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [sampleBinder],
      activeBinderId: 'binder-1',
    });
    expect(payload.binders).toEqual([sampleBinder]);
    expect(payload.activeBinderId).toBe('binder-1');
  });

  it('parseImportPayload defaults to a single seeded binder when binders is missing (pre-feature backup)', () => {
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
    });
    const parsed = parseImportPayload(raw);
    expect(parsed.binders).toHaveLength(1);
    expect(parsed.binders[0].name).toBe('My Binder');
    expect(parsed.activeBinderId).toBe(parsed.binders[0].id);
  });

  it('parseImportPayload accepts a valid binders array with multiple binders', () => {
    const secondBinder = { ...sampleBinder, id: 'binder-2', name: 'Second', language: 'ja' };
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [sampleBinder, secondBinder],
      activeBinderId: 'binder-2',
    });
    const parsed = parseImportPayload(raw);
    expect(parsed.binders).toHaveLength(2);
    expect(parsed.activeBinderId).toBe('binder-2');
  });

  it('parseImportPayload accepts a blank slot with a customImage and round-trips it intact', () => {
    const binderWithCustomImage = {
      ...sampleBinder,
      customOrder: [
        {
          type: 'blank',
          customImage: {
            dataUri: 'data:image/jpeg;base64,ABC',
            offsetX: 0.1,
            offsetY: -0.2,
            zoom: 1.5,
          },
        },
      ],
    };
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [binderWithCustomImage],
      activeBinderId: 'binder-1',
    });
    const parsed = parseImportPayload(raw);
    expect(parsed.binders[0].customOrder).toEqual(binderWithCustomImage.customOrder);
  });

  it('parseImportPayload rejects a malformed binders array', () => {
    const raw = JSON.stringify({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [{ id: 'x', name: 'Missing fields' }],
    });
    expect(() => parseImportPayload(raw)).toThrow('This file does not look like a valid export.');
  });

  // rows/columns/pageCount feed straight into computeBinderPages /
  // computeSpreadPageIndices (binderLayout.ts) with no further guard
  // downstream: a non-positive or non-integer value there throws
  // (`new Array(-1)` is a RangeError) and, since this app has no
  // ErrorBoundary, blank-screens the entire app the next time Binder view
  // renders. A corrupted or maliciously crafted import file must be
  // rejected here, at the one validation boundary for import data, rather
  // than sail through and detonate later.
  function rawWithBinderConfig(config: Record<string, unknown>): string {
    return JSON.stringify({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [{ ...sampleBinder, config }],
      activeBinderId: 'binder-1',
    });
  }

  it.each([
    ['rows', { rows: 0, columns: 3, pageCount: 17, fillDirection: 'horizontal' }],
    ['rows', { rows: -1, columns: 3, pageCount: 17, fillDirection: 'horizontal' }],
    ['rows', { rows: 2.5, columns: 3, pageCount: 17, fillDirection: 'horizontal' }],
    ['columns', { rows: 3, columns: 0, pageCount: 17, fillDirection: 'horizontal' }],
    ['columns', { rows: 3, columns: -1, pageCount: 17, fillDirection: 'horizontal' }],
    ['columns', { rows: 3, columns: 2.5, pageCount: 17, fillDirection: 'horizontal' }],
    ['pageCount', { rows: 3, columns: 3, pageCount: 0, fillDirection: 'horizontal' }],
    ['pageCount', { rows: 3, columns: 3, pageCount: -1, fillDirection: 'horizontal' }],
    ['pageCount', { rows: 3, columns: 3, pageCount: 2.5, fillDirection: 'horizontal' }],
  ] as const)(
    'rejects a binder config with a non-positive or non-integer %s (%o)',
    (_field, config) => {
      expect(() => parseImportPayload(rawWithBinderConfig(config))).toThrow(
        'This file does not look like a valid export.'
      );
    }
  );

  it('accepts a binder config with valid positive integer rows/columns/pageCount', () => {
    const raw = rawWithBinderConfig({
      rows: 3,
      columns: 3,
      pageCount: 17,
      fillDirection: 'horizontal',
    });
    expect(() => parseImportPayload(raw)).not.toThrow();
  });
});
