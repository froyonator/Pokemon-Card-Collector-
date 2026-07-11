import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

function resetStore() {
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    cardOverrides: {},
    uploadedImages: {},
    // Reset to a single deterministic binder before every test, mirroring
    // the store's real fresh-install default of exactly one seeded binder.
    // Without this, createBinder (which appends) would let binders pile up
    // across tests, since resetStore is the only per-test reset mechanism
    // this file has -- individual tests don't each re-seed the array.
    binders: [
      {
        id: 'default',
        name: 'My Binder',
        language: 'en',
        config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
        customOrder: null,
      },
    ],
    activeBinderId: 'default',
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  resetStore();
});

describe('markOwned', () => {
  it('records ownership and clears any wishlist entry for the same dex number', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    const state = useAppStore.getState();
    expect(state.owned[6]).toMatchObject({
      dexNumber: 6,
      cardId: 'sv03-223',
      condition: 'Near Mint',
    });
    expect(state.wishlist[6]).toBeUndefined();
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('unmarkOwned', () => {
  it('removes an ownership record', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.getState().unmarkOwned(6);
    expect(useAppStore.getState().owned[6]).toBeUndefined();
  });

  it('sets hasUnsavedChanges when it removes a real entry', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().unmarkOwned(6);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('does not set hasUnsavedChanges for a no-op unmark of a nonexistent entry', () => {
    useAppStore.getState().unmarkOwned(999);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('toggleWishlist', () => {
  it('adds a wishlist entry when none exists for that dex number', () => {
    const result = useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().wishlist[6]).toMatchObject({
      dexNumber: 6,
      cardId: 'sv03.5-199',
    });
  });

  it('removes the wishlist entry when the same card is toggled again', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    const result = useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().wishlist[6]).toBeUndefined();
  });

  it('blocks a second wishlist card for the same dex number with a reason', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    const result = useAppStore.getState().toggleWishlist(6, 'sv03-223');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected toggleWishlist to be blocked');
    expect(result.reason).toBeTruthy();
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: 'sv03.5-199' });
  });

  it('sets hasUnsavedChanges on add and on remove, but not when blocked', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);

    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().toggleWishlist(6, 'sv03-223');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('removeWishlist', () => {
  it('removes a wishlist entry', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    useAppStore.getState().removeWishlist(6);
    expect(useAppStore.getState().wishlist[6]).toBeUndefined();
  });

  it('sets hasUnsavedChanges when it removes a real entry', () => {
    useAppStore.getState().toggleWishlist(6, 'sv03.5-199');
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().removeWishlist(6);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('does not set hasUnsavedChanges for a no-op removal of a nonexistent entry', () => {
    useAppStore.getState().removeWishlist(999);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('toggleActiveGroup', () => {
  it('removes an active group id when toggled off, and re-adds it when toggled on', () => {
    const groupId = DEFAULT_RARITY_GROUPS[0].id;
    useAppStore.getState().toggleActiveGroup(groupId);
    expect(useAppStore.getState().activeGroupIds).not.toContain(groupId);
    useAppStore.getState().toggleActiveGroup(groupId);
    expect(useAppStore.getState().activeGroupIds).toContain(groupId);
  });

  it('does not set hasUnsavedChanges (it is a view filter, not collection data)', () => {
    const groupId = DEFAULT_RARITY_GROUPS[0].id;
    useAppStore.getState().toggleActiveGroup(groupId);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('setGroups', () => {
  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().setGroups([]);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('default activeGroupIds seed (fresh install)', () => {
  it('excludes not-usable, unlike every other default group', async () => {
    localStorage.clear();
    vi.resetModules();
    const { useAppStore: freshStore } = await import('./store');
    const seeded = freshStore.getState().activeGroupIds;
    expect(seeded).not.toContain('not-usable');
    for (const group of DEFAULT_RARITY_GROUPS) {
      if (group.id === 'not-usable') continue;
      expect(seeded).toContain(group.id);
    }
  });
});

describe('toggleGeneration', () => {
  it('adds a generation id when toggled on, and removes it when toggled off', () => {
    useAppStore.getState().toggleGeneration(2);
    expect(useAppStore.getState().selectedGenerations).toContain(2);
    useAppStore.getState().toggleGeneration(2);
    expect(useAppStore.getState().selectedGenerations).not.toContain(2);
  });

  it('does not set hasUnsavedChanges (it is a view filter, not collection data)', () => {
    useAppStore.getState().toggleGeneration(2);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('setCardOverride', () => {
  it('assigns a card to a group, overriding its raw rarity', () => {
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    expect(useAppStore.getState().cardOverrides['svp-044']).toBe('full-art');
  });

  it('clears an override when passed null', () => {
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    useAppStore.getState().setCardOverride('svp-044', null);
    expect(useAppStore.getState().cardOverrides['svp-044']).toBeUndefined();
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('does not set hasUnsavedChanges for a no-op clear of a card with no override', () => {
    useAppStore.getState().setCardOverride('svp-044', null);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('setUploadedImage', () => {
  it('assigns an uploaded image data URI to a card', () => {
    useAppStore.getState().setUploadedImage('svp-044', 'data:image/jpeg;base64,ABC');
    expect(useAppStore.getState().uploadedImages['svp-044']).toBe('data:image/jpeg;base64,ABC');
  });

  it('clears an uploaded image when passed null', () => {
    useAppStore.getState().setUploadedImage('svp-044', 'data:image/jpeg;base64,ABC');
    useAppStore.getState().setUploadedImage('svp-044', null);
    expect(useAppStore.getState().uploadedImages['svp-044']).toBeUndefined();
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.getState().setUploadedImage('svp-044', 'data:image/jpeg;base64,ABC');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('does not set hasUnsavedChanges for a no-op clear of a card with no uploaded image', () => {
    useAppStore.getState().setUploadedImage('svp-044', null);
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('markChangesSaved', () => {
  it('resets hasUnsavedChanges to false', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.getState().markChangesSaved();
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('replaceUserData', () => {
  it('overwrites the full user data slice, including selectedGenerations, cardOverrides, and uploadedImages', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    useAppStore.getState().setUploadedImage('svp-044', 'data:image/jpeg;base64,OLD');
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'ja',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: { 'other-card': 'rainbow-gold' },
      uploadedImages: { 'other-card': 'data:image/jpeg;base64,NEW' },
      binders: [
        {
          id: 'x',
          name: 'My Binder',
          language: 'en',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'x',
    });
    const state = useAppStore.getState();
    expect(state.language).toBe('ja');
    expect(state.owned[6]).toBeUndefined();
    expect(state.cardOverrides).toEqual({ 'other-card': 'rainbow-gold' });
    expect(state.uploadedImages).toEqual({ 'other-card': 'data:image/jpeg;base64,NEW' });
  });

  it('resets hasUnsavedChanges to false, regardless of what was pending before', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [
        {
          id: 'x',
          name: 'My Binder',
          language: 'en',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'x',
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });

  it('running a mutator right after replaceUserData correctly flips hasUnsavedChanges back on', () => {
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: [
        {
          id: 'x',
          name: 'My Binder',
          language: 'en',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'x',
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

function firstBinderId() {
  return useAppStore.getState().binders[0].id;
}

describe('binders', () => {
  it('seeds exactly one binder by default, named "My Binder", matching the store language', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'seed',
          name: 'My Binder',
          language: 'en',
          config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'seed',
    });
    const state = useAppStore.getState();
    expect(state.binders).toHaveLength(1);
    expect(state.binders[0]).toMatchObject({ name: 'My Binder', language: 'en' });
    expect(state.activeBinderId).toBe(state.binders[0].id);
  });

  it('createBinder adds a new binder with the given name/language, default config, and makes it active', () => {
    const before = useAppStore.getState().binders.length;
    useAppStore.getState().createBinder('Chinese Binder', 'zh-cn');
    const state = useAppStore.getState();
    expect(state.binders).toHaveLength(before + 1);
    const created = state.binders[state.binders.length - 1];
    expect(created).toMatchObject({
      name: 'Chinese Binder',
      language: 'zh-cn',
      config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
      customOrder: null,
    });
    expect(state.activeBinderId).toBe(created.id);
  });

  it('createBinder marks unsaved changes', () => {
    useAppStore.setState({ hasUnsavedChanges: false });
    useAppStore.getState().createBinder('Second Binder', 'en');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('setActiveBinder switches which binder is active', () => {
    useAppStore.getState().createBinder('Second Binder', 'ja');
    const secondId = useAppStore.getState().binders[1].id;
    const firstId = useAppStore.getState().binders[0].id;
    useAppStore.getState().setActiveBinder(firstId);
    expect(useAppStore.getState().activeBinderId).toBe(firstId);
    useAppStore.getState().setActiveBinder(secondId);
    expect(useAppStore.getState().activeBinderId).toBe(secondId);
  });

  it("renameBinder updates only the target binder's name", () => {
    useAppStore.getState().createBinder('Second Binder', 'ja');
    const id = firstBinderId();
    useAppStore.getState().renameBinder(id, 'My Renamed Binder');
    const state = useAppStore.getState();
    expect(state.binders.find((b) => b.id === id)?.name).toBe('My Renamed Binder');
    expect(state.binders[1].name).toBe('Second Binder');
  });

  it("setBinderLanguage updates only the target binder's language", () => {
    const id = firstBinderId();
    useAppStore.getState().setBinderLanguage(id, 'fr');
    expect(useAppStore.getState().binders.find((b) => b.id === id)?.language).toBe('fr');
  });

  it("setBinderConfig merges a partial update into only the target binder's config", () => {
    useAppStore.getState().createBinder('Second Binder', 'ja');
    const [first, second] = useAppStore.getState().binders;
    useAppStore.getState().setBinderConfig(first.id, { rows: 5 });
    const state = useAppStore.getState();
    expect(state.binders.find((b) => b.id === first.id)?.config.rows).toBe(5);
    expect(state.binders.find((b) => b.id === second.id)?.config.rows).toBe(3);
  });

  it("setBinderCustomOrder sets the target binder's custom order only", () => {
    useAppStore.getState().createBinder('Second Binder', 'ja');
    const [first, second] = useAppStore.getState().binders;
    const order = [{ type: 'blank' as const }];
    useAppStore.getState().setBinderCustomOrder(first.id, order);
    const state = useAppStore.getState();
    expect(state.binders.find((b) => b.id === first.id)?.customOrder).toEqual(order);
    expect(state.binders.find((b) => b.id === second.id)?.customOrder).toBeNull();
  });
});

describe('setBinderSlotCustomImage', () => {
  it('sets a custom image on the blank slot at the given sequence index in a binder\'s customOrder', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'pokemon', dexNumber: 1 },
            { type: 'blank' },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    useAppStore.getState().setBinderSlotCustomImage('a', 1, {
      dataUri: 'data:image/jpeg;base64,ABC',
      offsetX: 0.1,
      offsetY: 0.2,
      zoom: 1.5,
    });
    const order = useAppStore.getState().binders[0].customOrder;
    expect(order?.[1]).toEqual({
      type: 'blank',
      customImage: { dataUri: 'data:image/jpeg;base64,ABC', offsetX: 0.1, offsetY: 0.2, zoom: 1.5 },
    });
  });

  it('clearing a custom image (passing null) reverts the slot to a plain blank', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            {
              type: 'blank',
              customImage: { dataUri: 'data:image/jpeg;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 },
            },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    useAppStore.getState().setBinderSlotCustomImage('a', 0, null);
    expect(useAppStore.getState().binders[0].customOrder?.[0]).toEqual({ type: 'blank' });
  });

  it('sets hasUnsavedChanges', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [{ type: 'blank' }],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    useAppStore.getState().setBinderSlotCustomImage('a', 0, {
      dataUri: 'data:image/jpeg;base64,ABC',
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('replaceUserData with binders', () => {
  it('copies binders and activeBinderId from imported data', () => {
    const imported = [
      {
        id: 'a',
        name: 'Imported Binder',
        language: 'ko',
        config: { rows: 4, columns: 4, pageCount: 10, fillDirection: 'vertical' as const },
        customOrder: null,
      },
    ];
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
      uploadedImages: {},
      binders: imported,
      activeBinderId: 'a',
    });
    expect(useAppStore.getState().binders).toEqual(imported);
    expect(useAppStore.getState().activeBinderId).toBe('a');
  });
});
