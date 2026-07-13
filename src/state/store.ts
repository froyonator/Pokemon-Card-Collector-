import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_RARITY_GROUPS, MEGA_GROUP_ID, VMAX_GROUP_ID } from '../data/defaultRarityGroups';
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

  // Mega auto-switch bookkeeping (see toggleGeneration's doc comment below
  // for the full behavior). Deliberately session-only -- NOT included in
  // partializeUserData/ExportedUserData below -- since this is transient UI
  // state describing an in-progress auto-switch, not user collection data
  // worth persisting across reloads or round-tripping through an export/
  // import backup. Worst case on a reload mid-auto-switch: the "restore on
  // Mega deselect" step is skipped once, which the user can trivially
  // correct by hand via the Filters panel; nothing is lost or corrupted.
  //
  // Holds the activeGroupIds snapshot taken the moment Mega became the sole
  // selected generation, or null when no auto-switch is currently active.
  preMegaActiveGroupIds: string[] | null;
  // True once the user has explicitly changed the rarity-group selection
  // (toggleActiveGroup/setGroups) WHILE an auto-switch is active -- their
  // explicit choice then wins, and toggleGeneration's restore-on-deselect
  // step must not clobber it. Reset to false whenever Mega toggles off
  // (whether or not it actually restored anything).
  megaAutoSwitchOverridden: boolean;

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

// Which pseudo-generation ids auto-switch the active rarity-group selection
// when they become the SOLE selected generation -- see toggleGeneration's
// own doc comment below for the full behavior. Mega and VMAX both have a
// dedicated cross-cutting group whose membership check is purely additive
// (see selectors.ts's availableCardsForDex), so switching to it when that
// family is the only thing selected can only ever surface more cards, never
// hide ones already visible. The four regional families deliberately have
// NO entry here: they have no dedicated rarity group at all (a regional
// print's own rarity already governs its visibility, same as any normal
// card), so selecting e.g. Alolan-only never touches activeGroupIds.
//
// preMegaActiveGroupIds/megaAutoSwitchOverridden below keep their Mega-era
// names (this mechanism used to be Mega-only, hardcoded) rather than being
// renamed to something family-neutral -- renaming would touch every call
// site and test for a purely cosmetic gain, and the behavior they describe
// (a snapshot-and-restore around whichever single auto-switch family is
// currently sole-selected) is unchanged by this generalization.
const FAMILY_AUTO_SWITCH_GROUPS = new Map<GenerationId, string>([
  ['mega', MEGA_GROUP_ID],
  ['vmax', VMAX_GROUP_ID],
]);

function soleAutoSwitchGroupId(selected: GenerationId[]): string | undefined {
  return selected.length === 1 ? FAMILY_AUTO_SWITCH_GROUPS.get(selected[0]) : undefined;
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
        //
        // 'mega' and 'vmax' (see defaultRarityGroups.ts) are deliberately
        // left IN, unlike those two: their membership checks in
        // selectors.ts's availableCardsForDex are purely additive -- a
        // Mega-/VMAX-tagged card only ever gains visibility from its group
        // being active, on top of whatever its own rarity already grants,
        // and never causes a card that would otherwise show to disappear.
        // Toggling either on for a brand-new user can't hide or reprioritize
        // anything, so unlike 'standard-prints' there's no
        // flood-the-default-view risk to guard against by starting it off.
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
        preMegaActiveGroupIds: null,
        megaAutoSwitchOverridden: false,

        setLanguage: (language) => set({ language }),
        toggleActiveGroup: (groupId) =>
          set((state) => ({
            activeGroupIds: state.activeGroupIds.includes(groupId)
              ? state.activeGroupIds.filter((id) => id !== groupId)
              : [...state.activeGroupIds, groupId],
            // A manual group change while an auto-switch is in progress
            // (preMegaActiveGroupIds !== null) is the user's own explicit
            // choice overriding the automatic one -- flag it so
            // toggleGeneration's restore-on-Mega-deselect step below leaves
            // it alone instead of clobbering it back to the pre-Mega
            // snapshot. Left untouched (not reset to false) when no
            // auto-switch is active, so an override made just before Mega
            // gets deselected isn't silently un-flagged by some other
            // unrelated group toggle in between.
            megaAutoSwitchOverridden:
              state.preMegaActiveGroupIds !== null ? true : state.megaAutoSwitchOverridden,
          })),
        setGroups: (groups) => set({ groups, hasUnsavedChanges: true }),
        // Wraps the plain add/remove-from-selectedGenerations toggle with
        // the auto-switch family's rarity-group auto-switch: "when Mega is
        // selected then rarity auto switches to Mega unless we specifically
        // select" (user spec; VMAX joined the same mechanism when it
        // shipped -- see FAMILY_AUTO_SWITCH_GROUPS above). Two transitions
        // matter, both edge-triggered off whether an auto-switch family is
        // the SOLE selected generation before vs. after this toggle (not
        // just whether that family itself is in the list):
        //
        //  - Entering an auto-switch family's own-only selection (any other
        //    selection -> exactly [family]): snapshot the current
        //    activeGroupIds into preMegaActiveGroupIds and switch
        //    activeGroupIds to just that family's own group, so the grid
        //    immediately shows the family's own cards without the user
        //    having to separately open Filters and tick it -- see
        //    selectors.ts's availableCardsForDex, whose megaGroupActive/
        //    vmaxGroupActive checks are what actually make a tagged card
        //    visible regardless of its raw rarity. A card whose only prints
        //    carry a rarity outside every other default-active group
        //    (several Mega/VMAX species' sole cards use a rarity, e.g.
        //    Pocket-exclusive tiers, that isn't in ANY curated group) would
        //    otherwise render with an empty picker despite real cards
        //    existing -- reported live as "Mega Blastoise shows no cards".
        //  - Leaving that own-only selection (exactly [family] -> anything
        //    else, whether the family was deselected outright or another
        //    generation was added alongside it): restore whatever was
        //    active before the auto-switch, UNLESS the user explicitly
        //    changed the rarity-group selection while auto-switched
        //    (megaAutoSwitchOverridden) -- their explicit choice wins and
        //    is left exactly as they set it, not clobbered back to the
        //    pre-auto-switch snapshot.
        //
        // Deliberately does NOT trigger when an auto-switch family is
        // selected ALONGSIDE one or more other generations (a mixed grid
        // needs its other generations' rarity groups too, not just the
        // family's own) -- a considered product judgment call, not an
        // oversight: see the mixed-selection test coverage in
        // store.test.ts. The four regional families are never in
        // FAMILY_AUTO_SWITCH_GROUPS at all, so selecting e.g. Alolan-only
        // never triggers any of this -- see that map's own comment.
        toggleGeneration: (id) =>
          set((state) => {
            const nextSelected = state.selectedGenerations.includes(id)
              ? state.selectedGenerations.filter((gid) => gid !== id)
              : [...state.selectedGenerations, id];
            const wasAutoSwitchGroupId = soleAutoSwitchGroupId(state.selectedGenerations);
            const isAutoSwitchGroupId = soleAutoSwitchGroupId(nextSelected);

            if (wasAutoSwitchGroupId === undefined && isAutoSwitchGroupId !== undefined) {
              return {
                selectedGenerations: nextSelected,
                preMegaActiveGroupIds: state.activeGroupIds,
                megaAutoSwitchOverridden: false,
                activeGroupIds: [isAutoSwitchGroupId],
              };
            }

            if (wasAutoSwitchGroupId !== undefined && isAutoSwitchGroupId === undefined) {
              const restoredGroupIds =
                state.preMegaActiveGroupIds !== null && !state.megaAutoSwitchOverridden
                  ? state.preMegaActiveGroupIds
                  : state.activeGroupIds;
              return {
                selectedGenerations: nextSelected,
                activeGroupIds: restoredGroupIds,
                preMegaActiveGroupIds: null,
                megaAutoSwitchOverridden: false,
              };
            }

            return { selectedGenerations: nextSelected };
          }),
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
            // A restored backup's activeGroupIds/selectedGenerations pair
            // is the user's own explicit, complete state -- any in-progress
            // Mega auto-switch bookkeeping from before the import is stale
            // (it describes a pre-Mega snapshot that no longer corresponds
            // to anything in the just-loaded data) and must not linger to
            // clobber the imported groups on a later Mega toggle-off.
            preMegaActiveGroupIds: null,
            megaAutoSwitchOverridden: false,
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
      //
      // v2 -> v3: same shape of gap, this time for the new 'mega' built-in
      // group (see defaultRarityGroups.ts) -- an existing user's persisted
      // `groups` predates it and would never gain it on its own. Reuses the
      // exact same migrate() loop below unchanged (it already appends ANY
      // DEFAULT_RARITY_GROUPS entry missing from the persisted list, not
      // just 'standard-prints' specifically), so bumping the version number
      // is the only change needed to make it run again for already-migrated
      // users. activeGroupIds is deliberately left untouched here too, same
      // as v1 -> v2: even though a brand-new install seeds 'mega' active
      // (see its own comment above), a MIGRATION never silently changes
      // what an existing user currently sees -- it arrives present but
      // inactive, and the user opts in via the Filters checkbox.
      //
      // v3 -> v4: identical shape of gap again, this time for the new
      // 'vmax' built-in group (see defaultRarityGroups.ts's VMAX_GROUP_ID).
      // Same migrate() loop, same "arrives present but inactive" contract as
      // v2 -> v3 -- bumping the version number is again the only change
      // needed.
      version: 4,
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
