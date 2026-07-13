import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMegaCardData, refreshMegaCardData } from './loadMegaCardData';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { MEGA_DEX_ENTRIES } from '../data/megaDex';
import { getCachedCards, setCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';

vi.mock('../api/staticDatabase', () => ({
  loadStaticCardData: vi.fn(async () => null),
  loadStaticCardDataForGen: vi.fn(async () => null),
  refreshStaticCardData: vi.fn(async () => null),
  refreshStaticCardDataForGen: vi.fn(async () => null),
}));

const charizardX = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-x')!;
const charizardY = MEGA_DEX_ENTRIES.find((e) => e.slug === 'charizard-mega-y')!;
const lucario = MEGA_DEX_ENTRIES.find((e) => e.slug === 'lucario-mega')!;

function card(overrides: Partial<CardRecord>): CardRecord {
  return {
    id: 'id-1',
    name: 'M Charizard-EX',
    dexNumber: 6,
    setId: 'set',
    setName: 'Set',
    localId: '1',
    rarity: 'Rare Holo EX',
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

describe('loadMegaCardData', () => {
  it('writes the filtered Mega prints to the cache under the SYNTHETIC number, leaving the base species cache slot untouched', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      6: [
        card({ id: 'a', name: 'M Charizard-EX' }),
        card({ id: 'b', name: 'Charizard ex' }),
        card({ id: 'c', name: 'Mega Charizard X ex' }),
      ],
    });

    await loadMegaCardData('en', [charizardX]);

    const megaCards = getCachedCards('en', charizardX.number);
    expect(megaCards?.map((c) => c.id).sort()).toEqual(['a', 'c']);
    // The base species' own cache slot (dex 6) was never written by this call.
    expect(getCachedCards('en', 6)).toBeUndefined();
  });

  it('fetches the base species static bucket only once per distinct base dex, even for two Mega entries sharing it', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      6: [card({ id: 'x', name: 'Mega Charizard X ex' }), card({ id: 'y', name: 'Mega Charizard Y ex' })],
    });

    await loadMegaCardData('en', [charizardX, charizardY]);

    expect(loadStaticCardData).toHaveBeenCalledTimes(1);
    expect(getCachedCards('en', charizardX.number)?.map((c) => c.id)).toEqual(['x']);
    expect(getCachedCards('en', charizardY.number)?.map((c) => c.id)).toEqual(['y']);
  });

  it('routes a Gen 2+ base species through loadStaticCardDataForGen with the right generation', async () => {
    // Steelix is dex 208 (Gen 2 range).
    const steelix = MEGA_DEX_ENTRIES.find((e) => e.slug === 'steelix-mega')!;
    vi.mocked(loadStaticCardDataForGen).mockResolvedValue({
      208: [card({ id: 's', name: 'Mega Steelix ex', dexNumber: 208 })],
    });

    await loadMegaCardData('en', [steelix]);

    expect(loadStaticCardDataForGen).toHaveBeenCalledWith('en', 2);
    expect(getCachedCards('en', steelix.number)?.map((c) => c.id)).toEqual(['s']);
  });

  it('caches an empty array (zero live calls) when the base species has no static coverage at all', async () => {
    await loadMegaCardData('en', [lucario]);
    expect(getCachedCards('en', lucario.number)).toEqual([]);
  });

  it('fires onEntryLoaded once per entry after its own cache slot is written', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({
      6: [card({ id: 'x', name: 'Mega Charizard X ex' })],
    });
    const onEntryLoaded = vi.fn();
    await loadMegaCardData('en', [charizardX], { onEntryLoaded });
    expect(onEntryLoaded).toHaveBeenCalledTimes(1);
    expect(onEntryLoaded).toHaveBeenCalledWith(charizardX.number);
  });

  it('preserves an owned Mega card that falls outside the freshly-filtered set', async () => {
    vi.mocked(loadStaticCardData).mockResolvedValue({ 6: [] });
    setCachedCards('en', charizardX.number, [card({ id: 'kept', name: 'M Charizard-EX' })]);
    await loadMegaCardData('en', [charizardX], {
      owned: { [charizardX.number]: { dexNumber: charizardX.number, cardId: 'kept', condition: 'Near Mint', addedAt: '2024-01-01' } },
    });
    expect(getCachedCards('en', charizardX.number)?.map((c) => c.id)).toEqual(['kept']);
  });
});

describe('refreshMegaCardData', () => {
  it('bypasses the static database session memo: refreshStaticCardData is called, not loadStaticCardData', async () => {
    vi.mocked(refreshStaticCardData).mockResolvedValue({
      6: [card({ id: 'z', name: 'Mega Charizard X ex' })],
    });
    await refreshMegaCardData('en', [charizardX]);
    expect(refreshStaticCardData).toHaveBeenCalledTimes(1);
    expect(loadStaticCardData).not.toHaveBeenCalled();
    expect(getCachedCards('en', charizardX.number)?.map((c) => c.id)).toEqual(['z']);
  });
});
