import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import type { Condition, Currency, OwnedRecord, RarityGroup, WishlistRecord } from '../types';

export interface ExportedUserData {
  version: 1;
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
}

export type ToggleWishlistResult = { ok: true } | { ok: false; reason: string };

export interface AppState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  hasUnsavedChanges: boolean;

  setLanguage: (language: string) => void;
  setCurrency: (currency: Currency) => void;
  toggleActiveGroup: (groupId: string) => void;
  setGroups: (groups: RarityGroup[]) => void;
  toggleGeneration: (id: number) => void;

  markOwned: (dexNumber: number, cardId: string, condition: Condition) => void;
  unmarkOwned: (dexNumber: number) => void;

  toggleWishlist: (dexNumber: number, cardId: string) => ToggleWishlistResult;
  removeWishlist: (dexNumber: number) => void;

  priceVersion: number;
  bumpPriceVersion: () => void;

  markChangesSaved: () => void;
  replaceUserData: (data: ExportedUserData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      language: 'en',
      currency: 'USD',
      activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      // Deliberately a literal, NOT GENERATIONS.map((g) => g.id). New generations
      // added to src/data/generations.ts later are opt-in, not auto-selected: a
      // brand-new user today gets Gen 1 only, and an existing user who updates
      // their app after Gen 2 data ships keeps seeing exactly what they had
      // yesterday, rather than being silently opted into a large new data fetch
      // and a changed grid. Unlike activeGroupIds (a filter over data that's
      // always fully loaded already, so toggling one on/off costs nothing extra),
      // selecting a generation triggers fetching and caching a large new batch of
      // card data, so auto-including newly-added generations would mean a routine
      // data update silently changes what an existing user sees and silently
      // triggers a big background fetch on their next visit. This is a deliberate
      // product choice, not an oversight.
      selectedGenerations: [1],
      priceVersion: 0,
      hasUnsavedChanges: false,

      setLanguage: (language) => set({ language }),
      setCurrency: (currency) => set({ currency }),
      toggleActiveGroup: (groupId) =>
        set((state) => ({
          activeGroupIds: state.activeGroupIds.includes(groupId)
            ? state.activeGroupIds.filter((id) => id !== groupId)
            : [...state.activeGroupIds, groupId],
        })),
      setGroups: (groups) => set({ groups, hasUnsavedChanges: true }),
      toggleGeneration: (id) =>
        set((state) => ({
          selectedGenerations: state.selectedGenerations.includes(id)
            ? state.selectedGenerations.filter((gid) => gid !== id)
            : [...state.selectedGenerations, id],
        })),

      markOwned: (dexNumber, cardId, condition) =>
        set((state) => {
          const wishlist = { ...state.wishlist };
          delete wishlist[dexNumber];
          return {
            owned: {
              ...state.owned,
              [dexNumber]: { dexNumber, cardId, condition, addedAt: new Date().toISOString() },
            },
            wishlist,
            hasUnsavedChanges: true,
          };
        }),

      unmarkOwned: (dexNumber) =>
        set((state) => {
          if (!(dexNumber in state.owned)) return {};
          const owned = { ...state.owned };
          delete owned[dexNumber];
          return { owned, hasUnsavedChanges: true };
        }),

      toggleWishlist: (dexNumber, cardId) => {
        const state = get();
        const existing = state.wishlist[dexNumber];
        if (existing && existing.cardId === cardId) {
          const wishlist = { ...state.wishlist };
          delete wishlist[dexNumber];
          set({ wishlist, hasUnsavedChanges: true });
          return { ok: true };
        }
        if (existing && existing.cardId !== cardId) {
          return {
            ok: false,
            reason: 'Only one wishlist card is allowed per Pokemon. Remove the current pick first.',
          };
        }
        set({
          wishlist: {
            ...state.wishlist,
            [dexNumber]: { dexNumber, cardId, addedAt: new Date().toISOString() },
          },
          hasUnsavedChanges: true,
        });
        return { ok: true };
      },

      removeWishlist: (dexNumber) =>
        set((state) => {
          if (!(dexNumber in state.wishlist)) return {};
          const wishlist = { ...state.wishlist };
          delete wishlist[dexNumber];
          return { wishlist, hasUnsavedChanges: true };
        }),

      bumpPriceVersion: () => set((state) => ({ priceVersion: state.priceVersion + 1 })),

      markChangesSaved: () => set({ hasUnsavedChanges: false }),

      replaceUserData: (data) =>
        set({
          language: data.language,
          currency: data.currency,
          activeGroupIds: data.activeGroupIds,
          groups: data.groups,
          owned: data.owned,
          wishlist: data.wishlist,
          selectedGenerations: data.selectedGenerations,
          hasUnsavedChanges: false,
        }),
    }),
    {
      name: 'pcc:userData:v1',
      partialize: (state) => ({
        language: state.language,
        currency: state.currency,
        activeGroupIds: state.activeGroupIds,
        groups: state.groups,
        owned: state.owned,
        wishlist: state.wishlist,
        selectedGenerations: state.selectedGenerations,
        hasUnsavedChanges: state.hasUnsavedChanges,
      }),
    }
  )
);
