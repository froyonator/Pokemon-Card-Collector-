import { allDexEntries } from '../data/generations';
import { getAllCachedCardsForDex } from './loadCardData';
import type { CardRecord, Condition, OwnedRecord, WishlistRecord } from '../types';

// Computed once at module load: GENERATIONS is a static registry, not runtime
// state, so this doesn't need to be recomputed per call or memoized in a hook.
const ALL_DEX_ENTRIES = allDexEntries();

export interface CollectionRow {
  dexNumber: number;
  pokemonName: string;
  card: CardRecord | undefined;
  condition: Condition;
}

export interface WishlistRow {
  dexNumber: number;
  pokemonName: string;
  card: CardRecord | undefined;
}

function pokemonName(dexNumber: number): string {
  return ALL_DEX_ENTRIES.find((entry) => entry.number === dexNumber)?.name ?? `#${dexNumber}`;
}

function findCard(language: string, dexNumber: number, cardId: string): CardRecord | undefined {
  return getAllCachedCardsForDex(language, dexNumber).find((c) => c.id === cardId);
}

// Not memoized here: this is a plain function, not a hook, so unlike
// DexGrid.tsx's cardsByDexNumber useMemo (DexGrid.tsx:63-68), it can't cache
// its own result across calls. Every record in `owned` triggers one
// getAllCachedCardsForDex call, which fully JSON.parses this app's
// single-key localStorage blob on every call (see cardCache.ts) — the same
// full-blob-reparse pattern DexGrid hit and fixed with a useMemo. Calling
// this directly in a component body would redo that work on every render;
// callers should wrap the result in their own useMemo/useCallback keyed on
// (language, owned) instead.
export function buildCollectionRows(
  language: string,
  owned: Record<number, OwnedRecord>
): CollectionRow[] {
  return Object.values(owned).map((record) => ({
    dexNumber: record.dexNumber,
    pokemonName: pokemonName(record.dexNumber),
    card: findCard(language, record.dexNumber, record.cardId),
    condition: record.condition,
  }));
}

// Same caution as buildCollectionRows above: not memoized here since this is
// a plain function, not a hook. Callers should wrap the result in their own
// useMemo/useCallback keyed on (language, wishlist) rather than calling this
// directly in a component body on every render.
export function buildWishlistRows(
  language: string,
  wishlist: Record<number, WishlistRecord>
): WishlistRow[] {
  return Object.values(wishlist).map((record) => ({
    dexNumber: record.dexNumber,
    pokemonName: pokemonName(record.dexNumber),
    card: findCard(language, record.dexNumber, record.cardId),
  }));
}

export type SortKey = 'dexNumber' | 'name';
export type SortDirection = 'asc' | 'desc';

export function sortRows<T extends { dexNumber: number; pokemonName: string }>(
  rows: T[],
  key: SortKey,
  direction: SortDirection
): T[] {
  const sorted = [...rows].sort((a, b) => {
    if (key === 'dexNumber') return a.dexNumber - b.dexNumber;
    return a.pokemonName.localeCompare(b.pokemonName);
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}
