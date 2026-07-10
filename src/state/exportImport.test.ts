import { describe, expect, it } from 'vitest';
import { buildExportPayload, exportFileName, parseImportPayload } from './exportImport';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

const baseState = {
  language: 'en',
  currency: 'USD' as const,
  activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
  groups: DEFAULT_RARITY_GROUPS,
  owned: { 6: { dexNumber: 6, cardId: 'sv03.5-199', condition: 'Near Mint' as const, addedAt: '' } },
  wishlist: {},
  selectedGenerations: [1],
};

describe('buildExportPayload', () => {
  it('includes only user-generated data with a version number', () => {
    const payload = buildExportPayload(baseState);
    expect(payload.version).toBe(1);
    expect(payload.owned).toEqual(baseState.owned);
    expect(payload.groups).toEqual(DEFAULT_RARITY_GROUPS);
    expect(payload.selectedGenerations).toEqual([1]);
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
      currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      // no selectedGenerations key at all, matching a real pre-feature export file
    };
    const parsed = parseImportPayload(JSON.stringify(preFeaturePayload));
    expect(parsed.selectedGenerations).toEqual([1]);
  });
});
