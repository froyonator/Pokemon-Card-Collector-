import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { DEFAULT_CARD_OVERRIDES } from '../data/defaultCardOverrides';
import type { GenerationId } from '../data/generations';
import type {
  Binder,
  BinderConfig,
  BinderCover,
  BinderSlotEntry,
  Condition,
  CustomSlotImage,
  OwnedRecord,
  RarityGroup,
  WishlistRecord,
} from '../types';
import type { StateStorage } from 'zustand/middleware';

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
  selectedGenerations: GenerationId[];
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

// Where a corrupted USER_DATA_STORAGE_KEY value gets copied to (see
// onRehydrateStorage below) before the persist middleware's own hydration
// failure leaves the in-memory store at fresh-install defaults -- which then
// gets written straight back to USER_DATA_STORAGE_KEY on the user's very
// first store-mutating action, permanently overwriting whatever was in the
// corrupted blob. Exported so a future recovery UI has a stable key to read.
export const USER_DATA_CORRUPTED_BACKUP_KEY = `${USER_DATA_STORAGE_KEY}:corrupted-backup`;

// zustand's default `createJSONStorage(() => localStorage)` calls
// localStorage.setItem directly with no error handling: a QuotaExceededError
// (realistically triggerable -- see SlotImageEditor's uncompressed custom
// slot image uploads) throws uncaught, even though the in-memory zustand
// state has already updated by the time the write is attempted, making the
// UI look like the save succeeded while the persisted write silently failed.
// This wraps localStorage so a failed write is logged instead of throwing,
// and reuses zustand's real getItem/removeItem unchanged.
const resilientLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.error(
        `Failed to save Collector's Ledger data to localStorage (key "${name}"). Your most recent change may be lost on reload.`,
        error
      );
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export interface AppState {
  language: string;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: GenerationId[];
  cardOverrides: Record<string, string>;
  uploadedImages: Record<string, string>;
  binders: Binder[];
  activeBinderId: string;
  hasUnsavedChanges: boolean;

  setLanguage: (language: string) => void;
  toggleActiveGroup: (groupId: string) => void;
  setGroups: (groups: RarityGroup[]) => void;
  toggleGeneration: (id: GenerationId) => void;
  setCardOverride: (cardId: string, groupId: string | null) => void;
  setUploadedImage: (cardId: string, dataUri: string | null) => void;
  createBinder: (name: string, language: string) => void;
  setActiveBinder: (id: string) => void;
  // Removes exactly the binder with this id (never more than one), and its
  // page layout/cover/custom slot pictures along with it -- the rest of the
  // app's collection data (owned/wishlist/uploadedImages/cardOverrides)
  // lives outside the binders array entirely and is untouched. Refuses to
  // drop the very last binder: BinderView derives its open binder as
  // `binders.find(...) ?? binders[0]` with no empty-shelf guard of its own,
  // so an empty binders[] would leave it dereferencing undefined. If the
  // deleted binder was the active one, activeBinderId is reassigned to a
  // surviving binder so the store's own state stays internally consistent
  // even before BinderShelf/BinderView re-render.
  deleteBinder: (id: string) => void;
  renameBinder: (id: string, name: string) => void;
  setBinderLanguage: (id: string, language: string) => void;
  setBinderConfig: (id: string, config: Partial<BinderConfig>) => void;
  setBinderCustomOrder: (id: string, order: BinderSlotEntry[] | null) => void;
  // Patch-merges onto the binder's existing cover, so setting the spine
  // text doesn't wipe an already-chosen color and vice versa. Pass an
  // explicit undefined field value to clear just that field.
  setBinderCover: (id: string, cover: Partial<BinderCover>) => void;
  setBinderSlotCustomImage: (
    binderId: string,
    slotIndex: number,
    customImage: CustomSlotImage | null
  ) => void;

  markOwned: (dexNumber: number, cardId: string, condition: Condition) => void;
  unmarkOwned: (dexNumber: number) => void;

  toggleWishlist: (dexNumber: number, cardId: string) => ToggleWishlistResult;
  removeWishlist: (dexNumber: number) => void;

  markChangesSaved: () => void;
  replaceUserData: (data: ExportedUserData) => void;
}

// Named (rather than inlined into the persist() options below) so migrate's
// identity no-op can reference its return type directly, instead of casting
// through `unknown`/`any` to satisfy PersistOptions' `migrate` signature.
function partializeUserData(state: AppState) {
  return {
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
  };
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
        // default alongside the other groups. 'standard-prints' (ordinary
        // commons/uncommons/rarity-less cards) is likewise seeded INACTIVE:
        // it exists so sparse-data languages are viewable at all, not to
        // flood the default special-art views -- see its own comment in
        // defaultRarityGroups.ts.
        activeGroupIds: DEFAULT_RARITY_GROUPS.filter(
          (g) => g.id !== 'not-usable' && g.id !== 'standard-prints'
        ).map((g) => g.id),
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
        deleteBinder: (id) =>
          set((state) => {
            // Refuse to delete the last remaining binder -- see the
            // deleteBinder doc comment on AppState for why.
            if (state.binders.length <= 1) return {};
            const binders = state.binders.filter((b) => b.id !== id);
            // Unknown id: no-op rather than silently mutating activeBinderId.
            if (binders.length === state.binders.length) return {};
            const activeBinderId =
              state.activeBinderId === id ? binders[0].id : state.activeBinderId;
            return { binders, activeBinderId, hasUnsavedChanges: true };
          }),
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
        setBinderCover: (id, cover) =>
          set((state) => ({
            binders: state.binders.map((b) =>
              b.id === id ? { ...b, cover: { ...b.cover, ...cover } } : b
            ),
            hasUnsavedChanges: true,
          })),
        setBinderSlotCustomImage: (binderId, slotIndex, customImage) =>
          set((state) => {
            const binder = state.binders.find((b) => b.id === binderId);
            const order = binder?.customOrder;
            if (!order || !order[slotIndex] || order[slotIndex].type !== 'blank') return {};
            return {
              binders: state.binders.map((b) => {
                if (b.id !== binderId || !b.customOrder) return b;
                const nextOrder = [...b.customOrder];
                nextOrder[slotIndex] = customImage
                  ? { type: 'blank', customImage }
                  : { type: 'blank' };
                return { ...b, customOrder: nextOrder };
              }),
              hasUnsavedChanges: true,
            };
          }),

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
      // Bumped whenever the persisted shape changes (e.g. the binders[]/
      // activeBinderId migration in 5f5a0c1, which shipped without a version
      // bump and relied entirely on zustand's shallow-merge default).
      //
      // v1 -> v2: the 'standard-prints' default rarity group was added to
      // DEFAULT_RARITY_GROUPS, but `groups` is persisted wholesale -- an
      // existing user's saved groups would never gain it (and sparse-data
      // languages would stay invisible for them forever). The migration
      // appends any default group missing from the persisted list, while
      // deliberately NOT touching activeGroupIds: the new group arrives
      // present-but-inactive, exactly like a fresh install.
      version: 2,
      migrate: (persistedState): ReturnType<typeof partializeUserData> => {
        const state = persistedState as ReturnType<typeof partializeUserData>;
        if (Array.isArray(state?.groups)) {
          const existingIds = new Set(state.groups.map((g) => g.id));
          for (const group of DEFAULT_RARITY_GROUPS) {
            if (!existingIds.has(group.id)) {
              state.groups = [...state.groups, group];
            }
          }
        }
        return state;
      },
      // Wraps localStorage.setItem so a failed write (e.g. QuotaExceededError
      // from a large uploaded image) is logged instead of throwing uncaught.
      storage: createJSONStorage(() => resilientLocalStorage),
      // Zustand's persist middleware swallows a JSON.parse failure on the
      // stored value with zero console output when this isn't set, leaving
      // the store silently at fresh-install defaults -- indistinguishable
      // from a genuinely new user. Once the user makes any change, that
      // fresh-default state gets written back to USER_DATA_STORAGE_KEY,
      // permanently overwriting the corrupted (but possibly recoverable)
      // original. This surfaces the failure loudly and preserves the raw
      // corrupted string under USER_DATA_CORRUPTED_BACKUP_KEY first, so a
      // future recovery path is at least possible.
      onRehydrateStorage: () => (_state, error) => {
        if (!error) return;
        console.error(
          `Failed to load persisted data from localStorage key "${USER_DATA_STORAGE_KEY}"; falling back to defaults. The raw value has been preserved at "${USER_DATA_CORRUPTED_BACKUP_KEY}" for recovery.`,
          error
        );
        try {
          const raw = localStorage.getItem(USER_DATA_STORAGE_KEY);
          if (raw !== null) {
            localStorage.setItem(USER_DATA_CORRUPTED_BACKUP_KEY, raw);
          }
        } catch (backupError) {
          console.error(
            'Failed to back up corrupted persisted data before it was overwritten:',
            backupError
          );
        }
      },
      partialize: partializeUserData,
    }
  )
);
