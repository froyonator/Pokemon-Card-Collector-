import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';

function resetStore() {
  useAppStore.setState({
    language: 'en',
    currency: 'USD',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    cardOverrides: {},
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

describe('bumpPriceVersion', () => {
  it('increments the price version counter', () => {
    const before = useAppStore.getState().priceVersion;
    useAppStore.getState().bumpPriceVersion();
    expect(useAppStore.getState().priceVersion).toBe(before + 1);
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

describe('markChangesSaved', () => {
  it('resets hasUnsavedChanges to false', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.getState().markChangesSaved();
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('replaceUserData', () => {
  it('overwrites the full user data slice, including selectedGenerations and cardOverrides', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    useAppStore.getState().setCardOverride('svp-044', 'full-art');
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'ja',
      currency: 'EUR',
      activeGroupIds: ['full-art'],
      groups: DEFAULT_RARITY_GROUPS,
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: { 'other-card': 'rainbow-gold' },
    });
    const state = useAppStore.getState();
    expect(state.language).toBe('ja');
    expect(state.currency).toBe('EUR');
    expect(state.owned[6]).toBeUndefined();
    expect(state.cardOverrides).toEqual({ 'other-card': 'rainbow-gold' });
  });

  it('resets hasUnsavedChanges to false, regardless of what was pending before', () => {
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
  });

  it('running a mutator right after replaceUserData correctly flips hasUnsavedChanges back on', () => {
    useAppStore.getState().replaceUserData({
      version: 1,
      language: 'en',
      currency: 'USD',
      activeGroupIds: [],
      groups: [],
      owned: {},
      wishlist: {},
      selectedGenerations: [1],
      cardOverrides: {},
    });
    expect(useAppStore.getState().hasUnsavedChanges).toBe(false);
    useAppStore.getState().markOwned(6, 'sv03-223', 'Near Mint');
    expect(useAppStore.getState().hasUnsavedChanges).toBe(true);
  });
});
