import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexGrid } from './DexGrid';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { setCachedCards } from '../storage/cardCache';
import type { TileProps } from './Tile';

// Regression coverage for the Tile.tsx/DexGrid.tsx memoization fix: marking
// ONE dex number owned replaces `owned` with a brand-new object reference
// for the WHOLE record (see the zustand store's markOwned), which used to
// mean every Tile in the grid got a freshly-allocated onClick/onEnlarge
// closure on every such change -- defeating Tile's own React.memo wrapper
// for all up to 151 tiles, not just the one whose data actually changed.
//
// Mocking Tile itself (rather than rendering the real one) is what lets
// this test actually observe function IDENTITY, not just rendered output --
// two renders of an unrelated tile can produce identical DOM either because
// nothing re-rendered (the fix working) or because it re-rendered and
// happened to produce the same markup (the bug, silently). Only capturing
// the literal prop values distinguishes the two.
const capturedProps = new Map<number, TileProps>();

vi.mock('./Tile', () => ({
  Tile: (props: TileProps) => {
    capturedProps.set(props.dexNumber, props);
    return <button>{props.name}</button>;
  },
}));

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  capturedProps.clear();
  localStorage.clear();
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    uploadedImages: {},
    hasUnsavedChanges: false,
  });
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DexGrid Tile callback stability', () => {
  it('hands every Tile the same onClick reference across a re-render triggered by an unrelated dex number becoming owned', () => {
    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    const onClickBefore = capturedProps.get(2)?.onClick;
    expect(onClickBefore).toBeDefined();

    // Mark dex 1 (not dex 2) owned -- exactly the "brand-new object
    // reference for the WHOLE owned record" mutation the fix targets.
    // Wrapped in act() so the resulting re-render is flushed synchronously
    // before the assertions below run, instead of leaving them racing a
    // still-pending update.
    act(() => {
      useAppStore.setState({
        owned: { 1: { dexNumber: 1, cardId: 'some-card-id', condition: 'Near Mint', addedAt: '2024-01-01' } },
      });
    });

    // Confirms the update actually landed (dex 1's own tile re-rendered
    // with its new owned state) -- without this, a version of the test that
    // never actually re-rendered anything would trivially "pass" the
    // reference-equality check below for the wrong reason.
    expect(capturedProps.get(1)?.state).toBe('owned');

    const onClickAfter = capturedProps.get(2)?.onClick;
    expect(onClickAfter).toBe(onClickBefore);
  });

  it('hands every Tile the same onEnlarge reference across a re-render triggered by an unrelated dex number becoming owned', () => {
    // onEnlarge is only passed down (non-undefined) once there's a real
    // ownedCard resolved for that dex number -- see DexGrid.tsx's own
    // ownedCard lookup -- so dex 3 needs actual cached card data to match
    // against, not just an owned record.
    setCachedCards('en', 3, [
      {
        id: 'venusaur-card',
        name: 'Venusaur',
        dexNumber: 3,
        setId: 'base',
        setName: 'Base Set',
        localId: '1',
        rarity: 'Ultra Rare',
        imageBase: 'https://example.com/venusaur',
        language: 'en',
      },
    ]);
    render(
      <DexGrid view="card" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );

    act(() => {
      useAppStore.setState({
        owned: { 3: { dexNumber: 3, cardId: 'venusaur-card', condition: 'Near Mint', addedAt: '2024-01-01' } },
      });
    });
    const onEnlargeBefore = capturedProps.get(3)?.onEnlarge;
    expect(onEnlargeBefore).toBeDefined();

    // Mark a DIFFERENT dex number owned too -- dex 3's own onEnlarge
    // reference should stay stable even though the shared `owned` object it
    // was derived from has once again been fully replaced.
    act(() => {
      useAppStore.setState({
        owned: {
          3: { dexNumber: 3, cardId: 'venusaur-card', condition: 'Near Mint', addedAt: '2024-01-01' },
          1: { dexNumber: 1, cardId: 'bulbasaur-card', condition: 'Near Mint', addedAt: '2024-01-01' },
        },
      });
    });

    expect(capturedProps.get(1)?.state).toBe('owned');
    const onEnlargeAfter = capturedProps.get(3)?.onEnlarge;
    expect(onEnlargeAfter).toBe(onEnlargeBefore);
  });

  it('opens the Picker for the correct dex number when the shared onClick is invoked with that dex number', async () => {
    // Guards against a lookup-by-argument implementation that silently
    // breaks (e.g. always resolving dex 1, or resolving nothing at all)
    // once onClick stops closing over per-iteration data.
    render(
      <DexGrid view="sprite" isManualArrangeActive={false} onLoadingChange={() => {}} refreshRequestId={0} />
    );
    const onClick = capturedProps.get(1)?.onClick;
    expect(onClick).toBeDefined();
    act(() => {
      onClick?.(1);
    });
    expect(await screen.findByRole('dialog', { name: /card options for bulbasaur/i })).toBeInTheDocument();
  });
});
