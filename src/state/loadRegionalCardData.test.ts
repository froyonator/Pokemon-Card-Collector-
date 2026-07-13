import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRegionalCardData, refreshRegionalCardData } from './loadRegionalCardData';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { SYNTHETIC_FILTER_VERSION } from '../data/generations';
import { ALOLAN_DEX, GALARIAN_DEX, HISUIAN_DEX } from '../data/regionalDex';
import { getCachedCards, getSyntheticFilterVersion, setCachedCards, setSyntheticFilterVersion } from '../storage/cardCache';
import type { CardRecord } from '../types';

vi.mock('../api/staticDatabase', () => ({
  loadStaticCardData: vi.fn(async () => null),
  loadStaticCardDataForGen: vi.fn(async () => null),
  refreshStaticCardData: vi.fn(async () => null),
  refreshStaticCardDataForGen: vi.fn(async () => null),
}));

const growlithe = HISUIAN_DEX.find((e) => e.slug === 'growlithe-hisui')!; // dex 58, Gen 1
const obstagoon = GALARIAN_DEX.find((e) => e.slug === 'obstagoon')!; // dex 862, Gen 8, exclusive evolution
const vulpix = ALOLAN_DEX.find((e) => e.slug === 'vulpix-alola')!; // dex 37, Gen 1

function card(overrides: Partial<CardRecord>): CardRecord {
  return {
    id: 'id-1',
    name: 'Hisuian Growlithe',
    dexNumber: 58,
    setId: 'set',
    setName: 'Set',
    localId: '1',
    rarity: 'Rare Holo',
    imageBase: 'https://example.com/1',
    language: 'en',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadStaticCardData).mockReset().mockResolvedValue(null);
  vi.mocked(loadStaticCardDataForGen).mockReset().mockResolvedValue(null);
  vi.mocked(refreshStaticCardData).mockReset().mockResolvedValue(null);
  vi.mocked(refreshStaticCardDataForGen).mockReset().mockResolvedValue(null);
});

describe('loadRegionalCardData', () => {
  it('writes the filtered regional prints to the cache under the SYNTHETIC number, leaving the base species cache slot untouched', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      58: [
        card({ id: 'a', name: 'Hisuian Growlithe' }),
        card({ id: 'b', name: 'Growlithe' }),
        card({ id: 'c', name: 'Hisuian Growlithe V' }),
      ],
    });

    await loadRegionalCardData('en', [growlithe]);

    const cards = getCachedCards('en', growlithe.number);
    expect(cards?.map((c) => c.id).sort()).toEqual(['a', 'c']);
    expect(getCachedCards('en', 58)).toBeUndefined();
  });

  it('routes a Gen 8 base species (an exclusive-evolution regional form) through loadStaticCardDataForGen', async () => {
    vi.mocked(loadStaticCardDataForGen).mockResolvedValue({
      862: [card({ id: 'o', name: 'Galarian Obstagoon', dexNumber: 862 })],
    });

    await loadRegionalCardData('en', [obstagoon]);

    expect(loadStaticCardDataForGen).toHaveBeenCalledWith('en', 8);
    expect(getCachedCards('en', obstagoon.number)?.map((c) => c.id)).toEqual(['o']);
  });

  it('caches an empty array (zero live calls) when the base species has no static coverage at all', async () => {
    await loadRegionalCardData('en', [growlithe]);
    expect(getCachedCards('en', growlithe.number)).toEqual([]);
  });

  it('fires onEntryLoaded once per entry after its own cache slot is written', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      58: [card({ id: 'x', name: 'Hisuian Growlithe' })],
    });
    const onEntryLoaded = vi.fn();
    await loadRegionalCardData('en', [growlithe], { onEntryLoaded });
    expect(onEntryLoaded).toHaveBeenCalledTimes(1);
    expect(onEntryLoaded).toHaveBeenCalledWith(growlithe.number);
  });

  it('preserves an owned regional card that falls outside the freshly-filtered set', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({ 58: [] });
    setCachedCards('en', growlithe.number, [card({ id: 'kept', name: 'Hisuian Growlithe' })]);
    await loadRegionalCardData('en', [growlithe], {
      owned: { [growlithe.number]: { dexNumber: growlithe.number, cardId: 'kept', condition: 'Near Mint', addedAt: '2024-01-01' } },
    });
    expect(getCachedCards('en', growlithe.number)?.map((c) => c.id)).toEqual(['kept']);
  });

  // Named regression case: Alolan Vulpix (dex 37, Gen 1) end to end through
  // the shared synthetic-form loader core, same shape as growlithe above but
  // covering the Alolan family specifically rather than Hisuian.
  it('loads Alolan Vulpix (dex 37) end to end, filtered onto its own synthetic slot', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      37: [
        card({ id: 'v1', name: 'Alolan Vulpix', dexNumber: 37 }),
        card({ id: 'v2', name: 'Vulpix', dexNumber: 37 }),
      ],
    });

    await loadRegionalCardData('en', [vulpix]);

    const cards = getCachedCards('en', vulpix.number);
    expect(cards?.map((c) => c.id)).toEqual(['v1']);
    expect(getCachedCards('en', 37)).toBeUndefined();
  });

  describe('SYNTHETIC_FILTER_VERSION skip-recompute (shared core also used by Mega/VMAX -- see loadVmaxCardData.test.ts for the fuller suite)', () => {
    it('skips recomputing an entry already stamped with the current SYNTHETIC_FILTER_VERSION', async () => {
      setCachedCards('en', growlithe.number, [card({ id: 'already-cached', name: 'Hisuian Growlithe' })]);
      setSyntheticFilterVersion('en', growlithe.number, SYNTHETIC_FILTER_VERSION);

      const wroteAny = await loadRegionalCardData('en', [growlithe]);

      expect(wroteAny).toBe(false);
      expect(loadStaticCardData).not.toHaveBeenCalled();
      expect(getCachedCards('en', growlithe.number)?.map((c) => c.id)).toEqual(['already-cached']);
    });

    it('recomputes an entry stamped with a different filter version', async () => {
      setCachedCards('en', growlithe.number, [card({ id: 'stale', name: 'Hisuian Growlithe' })]);
      setSyntheticFilterVersion('en', growlithe.number, SYNTHETIC_FILTER_VERSION - 1);
      vi.mocked(loadStaticCardData).mockResolvedValue({
        58: [card({ id: 'fresh', name: 'Hisuian Growlithe' })],
      });

      const wroteAny = await loadRegionalCardData('en', [growlithe]);

      expect(wroteAny).toBe(true);
      expect(getCachedCards('en', growlithe.number)?.map((c) => c.id)).toEqual(['fresh']);
      expect(getSyntheticFilterVersion('en', growlithe.number)).toBe(SYNTHETIC_FILTER_VERSION);
    });
  });
});

describe('refreshRegionalCardData', () => {
  it('bypasses the static database session memo: refreshStaticCardData is called, not loadStaticCardData', async () => {
    vi.mocked(refreshStaticCardData).mockResolvedValue({
      58: [card({ id: 'z', name: 'Hisuian Growlithe' })],
    });
    await refreshRegionalCardData('en', [growlithe]);
    expect(refreshStaticCardData).toHaveBeenCalledTimes(1);
    expect(loadStaticCardData).not.toHaveBeenCalled();
    expect(getCachedCards('en', growlithe.number)?.map((c) => c.id)).toEqual(['z']);
  });
});
