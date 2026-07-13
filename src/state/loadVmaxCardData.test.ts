import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVmaxCardData, refreshVmaxCardData } from './loadVmaxCardData';
import {
  loadStaticCardData,
  loadStaticCardDataForGen,
  refreshStaticCardData,
  refreshStaticCardDataForGen,
} from '../api/staticDatabase';
import { SYNTHETIC_FILTER_VERSION } from '../data/generations';
import { VMAX_DEX_ENTRIES } from '../data/vmaxDex';
import { getCachedCards, getSyntheticFilterVersion, setCachedCards, setSyntheticFilterVersion } from '../storage/cardCache';
import type { CardRecord } from '../types';

vi.mock('../api/staticDatabase', () => ({
  loadStaticCardData: vi.fn(async () => null),
  loadStaticCardDataForGen: vi.fn(async () => null),
  refreshStaticCardData: vi.fn(async () => null),
  refreshStaticCardDataForGen: vi.fn(async () => null),
}));

const charizard = VMAX_DEX_ENTRIES.find((e) => e.slug === 'charizard-gmax')!; // dex 6, Gen 1
const single = VMAX_DEX_ENTRIES.find((e) => e.slug === 'urshifu-single-strike-gmax')!;
const rapid = VMAX_DEX_ENTRIES.find((e) => e.slug === 'urshifu-rapid-strike-gmax')!;
const scizor = VMAX_DEX_ENTRIES.find((e) => e.slug === 'scizor-dynamax')!; // dex 212, Gen 2
const rillaboom = VMAX_DEX_ENTRIES.find((e) => e.slug === 'rillaboom-gmax')!; // dex 812, Gen 8 (Grookey's evolution line -- Grookey itself, dex 810, has no VMAX print)

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

  // Regression coverage for a Gen 8 base species that is NOT one of Urshifu/
  // Calyrex's variant-split entries (those are covered above) -- a plain
  // single-VMAX-per-base-dex Gen 8 species, routed through
  // loadStaticCardDataForGen exactly like Urshifu is, just without the
  // sibling-splitting path.
  it('loads a Gen 8 base species (Rillaboom, dex 812) end to end, filtered onto its own synthetic slot', async () => {
    vi.mocked(loadStaticCardDataForGen).mockResolvedValue({
      812: [
        card({ id: 'm', name: 'Rillaboom VMAX', dexNumber: 812 }),
        card({ id: 'n', name: 'Rillaboom', dexNumber: 812 }),
      ],
    });

    await loadVmaxCardData('en', [rillaboom]);

    expect(loadStaticCardDataForGen).toHaveBeenCalledWith('en', 8);
    expect(getCachedCards('en', rillaboom.number)?.map((c) => c.id)).toEqual(['m']);
  });

  describe('SYNTHETIC_FILTER_VERSION skip-recompute (perf: avoid refiltering/rewriting an already-fresh entry on every load)', () => {
    it('skips recomputing (no static fetch, no cache rewrite) an entry already stamped with the current SYNTHETIC_FILTER_VERSION', async () => {
      setCachedCards('en', charizard.number, [card({ id: 'already-cached', name: 'Charizard VMAX' })]);
      setSyntheticFilterVersion('en', charizard.number, SYNTHETIC_FILTER_VERSION);

      const wroteAny = await loadVmaxCardData('en', [charizard]);

      expect(wroteAny).toBe(false);
      expect(loadStaticCardData).not.toHaveBeenCalled();
      expect(getCachedCards('en', charizard.number)?.map((c) => c.id)).toEqual(['already-cached']);
    });

    it('recomputes an entry whose cache slot is present but stamped with an older/different filter version', async () => {
      setCachedCards('en', charizard.number, [card({ id: 'stale', name: 'Charizard VMAX' })]);
      setSyntheticFilterVersion('en', charizard.number, SYNTHETIC_FILTER_VERSION - 1);
      vi.mocked(loadStaticCardData).mockResolvedValue({
        6: [card({ id: 'fresh', name: 'Charizard VMAX' })],
      });

      const wroteAny = await loadVmaxCardData('en', [charizard]);

      expect(wroteAny).toBe(true);
      expect(getCachedCards('en', charizard.number)?.map((c) => c.id)).toEqual(['fresh']);
      expect(getSyntheticFilterVersion('en', charizard.number)).toBe(SYNTHETIC_FILTER_VERSION);
    });

    it('recomputes an entry with no cache slot at all yet, and stamps the current filter version once it does', async () => {
      vi.mocked(loadStaticCardData).mockResolvedValue({
        6: [card({ id: 'first', name: 'Charizard VMAX' })],
      });

      const wroteAny = await loadVmaxCardData('en', [charizard]);

      expect(wroteAny).toBe(true);
      expect(getSyntheticFilterVersion('en', charizard.number)).toBe(SYNTHETIC_FILTER_VERSION);
    });

    it('recomputes only the stale entry, leaving an already-fresh sibling entry sharing the same base dex completely untouched', async () => {
      setCachedCards('en', single.number, [card({ id: 'single-cached', name: 'Single Strike Urshifu VMAX', dexNumber: 892 })]);
      setSyntheticFilterVersion('en', single.number, SYNTHETIC_FILTER_VERSION);
      // `rapid` has no cache slot yet, so it's the only one that should
      // trigger a static fetch and a write.
      vi.mocked(loadStaticCardDataForGen).mockResolvedValue({
        892: [
          card({ id: 'x', name: 'Single Strike Urshifu VMAX', dexNumber: 892 }),
          card({ id: 'y', name: 'Rapid Strike Urshifu VMAX', dexNumber: 892 }),
        ],
      });

      const wroteAny = await loadVmaxCardData('en', [single, rapid]);

      expect(wroteAny).toBe(true);
      expect(getCachedCards('en', single.number)?.map((c) => c.id)).toEqual(['single-cached']);
      expect(getCachedCards('en', rapid.number)?.map((c) => c.id)).toEqual(['y']);
    });

    it('returns false and does nothing when every entry passed in is already fresh', async () => {
      setCachedCards('en', charizard.number, [card({ id: 'a', name: 'Charizard VMAX' })]);
      setSyntheticFilterVersion('en', charizard.number, SYNTHETIC_FILTER_VERSION);
      setCachedCards('en', scizor.number, [card({ id: 'b', name: 'Scizor VMAX', dexNumber: 212 })]);
      setSyntheticFilterVersion('en', scizor.number, SYNTHETIC_FILTER_VERSION);

      const wroteAny = await loadVmaxCardData('en', [charizard, scizor]);

      expect(wroteAny).toBe(false);
      expect(loadStaticCardData).not.toHaveBeenCalled();
      expect(loadStaticCardDataForGen).not.toHaveBeenCalled();
    });

    it('refreshVmaxCardData always recomputes and re-stamps every entry, even one already at the current filter version (an explicit user action, unlike the cold-load skip above)', async () => {
      setCachedCards('en', charizard.number, [card({ id: 'old', name: 'Charizard VMAX' })]);
      setSyntheticFilterVersion('en', charizard.number, SYNTHETIC_FILTER_VERSION);
      vi.mocked(refreshStaticCardData).mockResolvedValue({
        6: [card({ id: 'refreshed', name: 'Charizard VMAX' })],
      });

      const wroteAny = await refreshVmaxCardData('en', [charizard]);

      expect(wroteAny).toBe(true);
      expect(refreshStaticCardData).toHaveBeenCalledTimes(1);
      expect(getCachedCards('en', charizard.number)?.map((c) => c.id)).toEqual(['refreshed']);
      expect(getSyntheticFilterVersion('en', charizard.number)).toBe(SYNTHETIC_FILTER_VERSION);
    });
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
