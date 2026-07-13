import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_VERSION_STORAGE_KEY, getStoredDbVersion, syncDbVersion } from './dbVersionSync';
import { getCachedCards, setCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';

const enCard: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const nlCard: CardRecord = { ...enCard, language: 'nl' };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function fetchReturning(version: string) {
  return vi.fn(async () => jsonResponse({ version }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('syncDbVersion', () => {
  it('on a mismatch (including no stamp ever stored), clears static-covered languages\' card cache and stores the new stamp', async () => {
    setCachedCards('en', 6, [enCard]);
    localStorage.setItem(DB_VERSION_STORAGE_KEY, 'old-version');

    await syncDbVersion(fetchReturning('new-version'));

    expect(getCachedCards('en', 6)).toBeUndefined();
    expect(getStoredDbVersion()).toBe('new-version');
  });

  it('on a first-ever boot (no stamp stored yet), still stores the new stamp', async () => {
    expect(getStoredDbVersion()).toBeNull();
    await syncDbVersion(fetchReturning('first-version'));
    expect(getStoredDbVersion()).toBe('first-version');
  });

  it('does not clear a live-only language\'s (nl/ru/pl) card cache on a mismatch', async () => {
    setCachedCards('nl', 6, [nlCard]);
    localStorage.setItem(DB_VERSION_STORAGE_KEY, 'old-version');

    await syncDbVersion(fetchReturning('new-version'));

    expect(getCachedCards('nl', 6)).toEqual([nlCard]);
  });

  it('on a match, leaves the card cache and stored stamp alone', async () => {
    setCachedCards('en', 6, [enCard]);
    localStorage.setItem(DB_VERSION_STORAGE_KEY, 'same-version');

    await syncDbVersion(fetchReturning('same-version'));

    expect(getCachedCards('en', 6)).toEqual([enCard]);
    expect(getStoredDbVersion()).toBe('same-version');
  });

  it('the stamp persists across repeated calls once stored', async () => {
    await syncDbVersion(fetchReturning('v1'));
    expect(getStoredDbVersion()).toBe('v1');

    await syncDbVersion(fetchReturning('v1'));
    expect(getStoredDbVersion()).toBe('v1');
  });

  it('leaves everything untouched when the version fetch fails', async () => {
    setCachedCards('en', 6, [enCard]);
    localStorage.setItem(DB_VERSION_STORAGE_KEY, 'old-version');
    const failingFetch = vi.fn(async () => {
      throw new Error('network down');
    });

    await syncDbVersion(failingFetch);

    expect(getCachedCards('en', 6)).toEqual([enCard]);
    expect(getStoredDbVersion()).toBe('old-version');
  });
});
