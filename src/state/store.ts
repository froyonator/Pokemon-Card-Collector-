import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { DEFAULT_CARD_OVERRIDES } from '../data/defaultCardOverrides';
import type {
  Binder,
  BinderConfig,
  BinderSlotEntry,
  Condition,
  OwnedRecord,
  RarityGroup,
  WishlistRecord,
} from '../types';

export const DEFAULT_BINDER_CONFIG: BinderConfig = {
  rows: 3,
  columns: 3,
  pageCount: 17,
  fillDirection: 'horizontal',
};

function createDefaultBinder(name: string, language: string): Binder {
  return {
    id: crypto.randomUUID(),
    name,
    language,
    config: DEFAULT_BINDER_CONFIG,
    customOrder: null,
  };
}

export interface ExportedUserData {
  version: 1;
  language: string;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  cardOverrides: Record<string, string>;
  uploadedImages: Record<string, string>;
  binders: Binder[];
  activeBinderId: string;
}

export type ToggleWishlistResult = { ok: true } | { ok: false; reason: string };

// Shared with App.tsx's onboarding-gate self-heal check, which needs to know
// the exact localStorage key this store's persist middleware writes to.
// Exported from here (the single source of truth for the key) rather than
// duplicated as an independent string literal, so the two can't drift apart.
export const USER_DATA_STORAGE_KEY = 'pcc:userData:v1';

export interface AppState {
  language: string;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  cardOverrides: Record<string, string>;
  uploadedImages: Record<string, string>;
  binders: Binder[];
  activeBinderId: string;
  hasUnsavedChanges: boolean;

  setLanguage: (language: string) => void;
  toggleActiveGroup: (groupId: string) => void;
  setGroups: (groups: RarityGroup[]) => void;
  toggleGeneration: (id: number) => void;
  setCardOverride: (cardId: string, groupId: string | null) => void;
  setUploadedImage: (cardId: string, dataUri: string | null) => void;
  createBinder: (name: string, language: string) => void;
  setActiveBinder: (id: string) => void;
  renameBinder: (id: string, name: string) => void;
  setBinderLanguage: (id: string, language: string) => void;
  setBinderConfig: (id: string, config: Partial<BinderConfig>) => void;
  setBinderCustomOrder: (id: string, order: BinderSlotEntry[] | null) => void;

  markOwned: (dexNumber: number, cardId: string, condition: Condition) => void;
  unmarkOwned: (dexNumber: number) => void;

  toggleWishlist: (dexNumber: number, cardId: string) => ToggleWishlistResult;
  removeWishlist: (dexNumber: number) => void;

  markChangesSaved: () => void;
  replaceUserData: (data: ExportedUserData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const seedBinder = createDefaultBinder('My Binder', 'en');
      return {
        language: 'en',
        // 'not-usable' is a manual-only bucket (see defaultRarityGroups.ts)
        // and deliberately excluded here: a brand-new user should never have
        // it silently active, since a card in that group is meant to
        // disappear from the Picker's available options, not appear by
        // default alongside the other groups.
        activeGroupIds: DEFAULT_RARITY_GROUPS.filter((g) => g.id !== 'not-usable').map((g) => g.id),
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
        cardOverrides: DEFAULT_CARD_OVERRIDES,
        // Unlike cardOverrides, there is no seed data for user-uploaded
        // images -- this always starts empty.
        uploadedImages: {},
        binders: [seedBinder],
        activeBinderId: seedBinder.id,
        hasUnsavedChanges: false,

        setLanguage: (language) => set({ language }),
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
        setCardOverride: (cardId, groupId) =>
          set((state) => {
            if (groupId === null) {
              if (!(cardId in state.cardOverrides)) return {};
              const cardOverrides = { ...state.cardOverrides };
              delete cardOverrides[cardId];
              return { cardOverrides, hasUnsavedChanges: true };
            }
            return {
              cardOverrides: { ...state.cardOverrides, [cardId]: groupId },
              hasUnsavedChanges: true,
            };
          }),

        createBinder: (name, language) =>
          set((state) => {
            const binder = createDefaultBinder(name, language);
            return {
              binders: [...state.binders, binder],
              activeBinderId: binder.id,
              hasUnsavedChanges: true,
            };
          }),
        setActiveBinder: (id) => set({ activeBinderId: id }),
        renameBinder: (id, name) =>
          set((state) => ({
            binders: state.binders.map((b) => (b.id === id ? { ...b, name } : b)),
            hasUnsavedChanges: true,
          })),
        setBinderLanguage: (id, language) =>
          set((state) => ({
            binders: state.binders.map((b) => (b.id === id ? { ...b, language } : b)),
            hasUnsavedChanges: true,
          })),
        setBinderConfig: (id, config) =>
          set((state) => ({
            binders: state.binders.map((b) =>
              b.id === id ? { ...b, config: { ...b.config, ...config } } : b
            ),
            hasUnsavedChanges: true,
          })),
        setBinderCustomOrder: (id, order) =>
          set((state) => ({
            binders: state.binders.map((b) => (b.id === id ? { ...b, customOrder: order } : b)),
            hasUnsavedChanges: true,
          })),

        setUploadedImage: (cardId, dataUri) =>
          set((state) => {
            if (dataUri === null) {
              if (!(cardId in state.uploadedImages)) return {};
              const uploadedImages = { ...state.uploadedImages };
              delete uploadedImages[cardId];
              return { uploadedImages, hasUnsavedChanges: true };
            }
            return {
              uploadedImages: { ...state.uploadedImages, [cardId]: dataUri },
              hasUnsavedChanges: true,
            };
          }),

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
              reason:
                'Only one wishlist card is allowed per Pokémon. Remove the current pick first.',
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

        markChangesSaved: () => set({ hasUnsavedChanges: false }),

        replaceUserData: (data) =>
          set({
            language: data.language,
            activeGroupIds: data.activeGroupIds,
            groups: data.groups,
            owned: data.owned,
            wishlist: data.wishlist,
            selectedGenerations: data.selectedGenerations,
            cardOverrides: data.cardOverrides,
            uploadedImages: data.uploadedImages,
            binders: data.binders,
            activeBinderId: data.activeBinderId,
            hasUnsavedChanges: false,
          }),
      };
    },
    {
      name: USER_DATA_STORAGE_KEY,
      partialize: (state) => ({
        language: state.language,
        activeGroupIds: state.activeGroupIds,
        groups: state.groups,
        owned: state.owned,
        wishlist: state.wishlist,
        selectedGenerations: state.selectedGenerations,
        cardOverrides: state.cardOverrides,
        uploadedImages: state.uploadedImages,
        binders: state.binders,
        activeBinderId: state.activeBinderId,
        hasUnsavedChanges: state.hasUnsavedChanges,
      }),
    }
  )
);
