import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVmaxCardData, refreshVmaxCardData } from './loadVmaxCardData';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { VMAX_DEX_ENTRIES } from '../data/vmaxDex';
import { getCachedCards, setCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';

vi.mock('../api/staticDatabase', () => ({
  loadStaticCardData: vi.fn(async () => null),
  loadStaticCardDataForGen: vi.fn(async () => null),
  refreshStaticCardData: vi.fn(async () => null),
  refreshStaticCardDataForGen: vi.fn(async () => null),
}));

const charizard = VMAX_DEX_ENTRIES.find((e) => e.slug === 'charizard-gmax')!;
const single = VMAX_DEX_ENTRIES.find((e) => e.slug === 'urshifu-single-strike-gmax')!;
const rapid = VMAX_DEX_ENTRIES.find((e) => e.slug === 'urshifu-rapid-strike-gmax')!;
const scizor = VMAX_DEX_ENTRIES.find((e) => e.slug === 'scizor-dynamax')!; // dex 212, Gen 2

function card(overrides: Partial<CardRecord>): CardRecord {
  return {
    id: 'id-1',
    name: 'Charizard VMAX',
    dexNumber: 6,
    setId: 'set',
    setName: 'Set',
    localId: '1',
    rarity: 'Rare Holo VMAX',
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

describe('loadVmaxCardData', () => {
  it('writes the filtered VMAX prints to the cache under the SYNTHETIC number, leaving the base species cache slot untouched', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      6: [
        card({ id: 'a', name: 'Charizard VMAX' }),
        card({ id: 'b', name: 'Charizard V' }),
        card({ id: 'c', name: 'Charizard' }),
      ],
    });

    await loadVmaxCardData('en', [charizard]);

    const cards = getCachedCards('en', charizard.number);
    expect(cards?.map((c) => c.id)).toEqual(['a']);
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('splits Urshifu Single/Rapid Strike VMAX prints onto their own synthetic slots, sharing one dex-892 (Gen 8) fetch', async () => {
    vi.mocked(loadStaticCardDataForGen).mockResolvedValue({
      892: [
        card({ id: 'x', name: 'Single Strike Urshifu VMAX', dexNumber: 892 }),
        card({ id: 'y', name: 'Rapid Strike Urshifu VMAX', dexNumber: 892 }),
      ],
    });

    await loadVmaxCardData('en', [single, rapid]);

    expect(loadStaticCardDataForGen).toHaveBeenCalledTimes(1);
    expect(loadStaticCardDataForGen).toHaveBeenCalledWith('en', 8);
    expect(getCachedCards('en', single.number)?.map((c) => c.id)).toEqual(['x']);
    expect(getCachedCards('en', rapid.number)?.map((c) => c.id)).toEqual(['y']);
  });

  it('routes a Gen 2+ base species through loadStaticCardDataForGen with the right generation', async () => {
    vi.mocked(loadStaticCardDataForGen).mockResolvedValue({
      212: [card({ id: 's', name: 'Scizor VMAX', dexNumber: 212 })],
    });

    await loadVmaxCardData('en', [scizor]);

    expect(loadStaticCardDataForGen).toHaveBeenCalledWith('en', 2);
    expect(getCachedCards('en', scizor.number)?.map((c) => c.id)).toEqual(['s']);
  });

  it('caches an empty array (zero live calls) when the base species has no static coverage at all', async () => {
    await loadVmaxCardData('en', [charizard]);
    expect(getCachedCards('en', charizard.number)).toEqual([]);
  });

  it('fires onEntryLoaded once per entry after its own cache slot is written', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      6: [card({ id: 'x', name: 'Charizard VMAX' })],
    });
    const onEntryLoaded = vi.fn();
    await loadVmaxCardData('en', [charizard], { onEntryLoaded });
    expect(onEntryLoaded).toHaveBeenCalledTimes(1);
    expect(onEntryLoaded).toHaveBeenCalledWith(charizard.number);
  });

  it('preserves an owned VMAX card that falls outside the freshly-filtered set', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({ 6: [] });
    setCachedCards('en', charizard.number, [card({ id: 'kept', name: 'Charizard VMAX' })]);
    await loadVmaxCardData('en', [charizard], {
      owned: { [charizard.number]: { dexNumber: charizard.number, cardId: 'kept', condition: 'Near Mint', addedAt: '2024-01-01' } },
    });
    expect(getCachedCards('en', charizard.number)?.map((c) => c.id)).toEqual(['kept']);
  });
});

describe('refreshVmaxCardData', () => {
  it('bypasses the static database session memo: refreshStaticCardData is called, not loadStaticCardData', async () => {
    vi.mocked(refreshStaticCardData).mockResolvedValue({
      6: [card({ id: 'z', name: 'Charizard VMAX' })],
    });
    await refreshVmaxCardData('en', [charizard]);
    expect(refreshStaticCardData).toHaveBeenCalledTimes(1);
    expect(loadStaticCardData).not.toHaveBeenCalled();
    expect(getCachedCards('en', charizard.number)?.map((c) => c.id)).toEqual(['z']);
  });
});
