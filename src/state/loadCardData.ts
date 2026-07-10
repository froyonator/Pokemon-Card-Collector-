import { DEFAULT_RARITY_GROUPS, fetchRarityList } from '../data/defaultRarityGroups';
import { GEN1_DEX, type DexEntry } from '../data/gen1Dex';
import { deriveSetId, fetchCardsForDexAndRarity, fetchSets } from '../api/tcgdex';
import { getCachedCards, setCachedCards } from '../storage/cardCache';
import type { CardRecord } from '../types';

export interface LoadProgress {
  completed: number;
  total: number;
}

export interface LoadAllCardDataOptions {
  dexEntries?: DexEntry[];
  rarities?: string[];
  onProgress?: (progress: LoadProgress) => void;
  fetchImpl?(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export async function loadAllCardData(
  language: string,
  options: LoadAllCardDataOptions = {}
): Promise<void> {
  const {
    dexEntries = GEN1_DEX,
    rarities = fetchRarityList(DEFAULT_RARITY_GROUPS),
    onProgress,
    fetchImpl = fetch,
  } = options;

  const sets = await fetchSets(language, fetchImpl);
  const setNameById = new Map(sets.map((s) => [s.id, s.name]));

  const total = dexEntries.length;
  let completed = 0;

  for (const entry of dexEntries) {
    const perDex: CardRecord[] = [];
    for (const rarity of rarities) {
      const briefs = await fetchCardsForDexAndRarity(entry.number, rarity, language, fetchImpl);
      for (const brief of briefs) {
        const setId = deriveSetId(brief.id, brief.localId);
        perDex.push({
          id: brief.id,
          name: brief.name,
          dexNumber: entry.number,
          setId,
          setName: setNameById.get(setId) ?? setId,
          localId: brief.localId,
          rarity,
          imageBase: brief.image ?? '',
          language,
        });
      }
    }
    setCachedCards(language, entry.number, perDex);
    completed += 1;
    onProgress?.({ completed, total });
  }
}

export function getAllCachedCardsForDex(language: string, dexNumber: number): CardRecord[] {
  return getCachedCards(language, dexNumber) ?? [];
}
