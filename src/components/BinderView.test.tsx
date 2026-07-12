import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from 'framer-motion';
import { BinderView } from './BinderView';
import { useAppStore } from '../state/store';
import { setCachedCards } from '../storage/cardCache';
import type { DexEntry } from '../data/gen1Dex';

// ResizeObserver is globally mocked in src/test/setup.ts (jsdom doesn't
// implement it at all) -- BinderView measures its .spread container via one
// to compute real pixel slot sizes (see src/state/binderSlotSizing.ts).

// The real implementation needs a live HTMLImageElement decode, unavailable
// in this project's jsdom test environment (verified live in a browser
// instead, same as loadImageDimensions's own doc comment explains) -- this
// only needs a stable, known width/height for the split-image save flow's
// own math to run against.
vi.mock('../state/loadImageDimensions', () => ({
  loadImageDimensions: vi.fn().mockResolvedValue({ width: 400, height: 400 }),
}));

// useReducedMotion -> true by default for this whole file: BinderView skips
// the leaf-turn animation entirely under reduced motion, making every
// navigation land instantly -- which is exactly the deterministic behavior
// the dozens of non-animation tests here need (a real leaf takes ~850ms of
// real time to settle, during which the covered half still shows the
// OUTGOING page by design). The dedicated "page turning" describe block
// flips this to false to test the leaf itself, asynchronously.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: vi.fn(() => true) };
});

const dexEntries: DexEntry[] = [
  { number: 1, name: 'Bulbasaur' },
  { number: 2, name: 'Ivysaur' },
  { number: 3, name: 'Venusaur' },
  { number: 4, name: 'Charmander' },
  { number: 5, name: 'Charmeleon' },
];

function resetStore() {
  // Cleared here (not just Zustand state reset) since setCachedCards writes
  // straight to localStorage and several tests below seed card data for the
  // owned-card-display feature -- without this, one test's cached card
  // could leak into an unrelated test running later in this file.
  localStorage.clear();
  useAppStore.setState({
    binders: [
      {
        id: 'a',
        name: 'My Binder',
        language: 'en',
        config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
        customOrder: null,
      },
    ],
    activeBinderId: 'a',
    hasUnsavedChanges: false,
  });
}

// All manual-arrange tests below run against resetStore()'s single binder
// (id 'a'), so reading that binder's customOrder is equivalent to reading
// "the active binder's" customOrder.
function activeBinderCustomOrder() {
  return useAppStore.getState().binders[0].customOrder;
}

describe('BinderView', () => {
  beforeEach(() => {
    resetStore();
    // Re-pinned every test (not just at module setup) so the "page turning"
    // block's own false doesn't leak into whichever test runs after it.
    vi.mocked(useReducedMotion).mockReturnValue(true);
  });

  it('shows page 1 alone on first render', () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/page 2/i)).not.toBeInTheDocument();
  });

  it('advancing to the next spread shows pages 2 and 3 together', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page 3/i)).toBeInTheDocument();
  });

  it('the previous button on the first spread is disabled', () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  describe('the shelf', () => {
    it('startOnShelf lands on the shelf; opening a binder shows its pages; "All binders" returns to the shelf', async () => {
      render(
        <BinderView
          dexEntries={dexEntries}
          owned={{}}
          dataVersion={0}
          onSlotClick={() => {}}
          startOnShelf
        />
      );
      expect(screen.getByRole('heading', { name: /your binders/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/page 1/i)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Open My Binder' }));
      expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /all binders/i }));
      expect(screen.getByRole('heading', { name: /your binders/i })).toBeInTheDocument();
    });

    it('creating a binder from the shelf makes it the active binder and opens it', async () => {
      render(
        <BinderView
          dexEntries={dexEntries}
          owned={{}}
          dataVersion={0}
          onSlotClick={() => {}}
          startOnShelf
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /new binder/i }));
      await userEvent.type(screen.getByLabelText(/binder name/i), 'Trades');
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

      // Landed inside the freshly-created binder...
      expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
      // ...which is now the store's active binder.
      const { binders, activeBinderId } = useAppStore.getState();
      const created = binders.find((b) => b.name === 'Trades');
      expect(created).toBeDefined();
      expect(activeBinderId).toBe(created!.id);
    });
  });

  describe('page turning', () => {
    // Real 5-page binder (spreads: [0], [1,2], [3,4]) so both a forward and
    // a backward move land on a genuine two-page spread. The turn is a
    // two-faced leaf hinged at the rings: the settled halves under it are
    // the DESTINATION spread from the first frame (the leaf's back face
    // lands on identical content), so app state never waits on animation --
    // these tests pin that, plus the leaf being purely decorative
    // (aria-hidden, no duplicate accessible page names mid-flip).
    beforeEach(() => {
      useAppStore.setState({
        binders: [
          {
            id: 'a',
            name: 'My Binder',
            language: 'en',
            config: { rows: 2, columns: 2, pageCount: 5, fillDirection: 'horizontal' },
            customOrder: null,
          },
        ],
        activeBinderId: 'a',
        hasUnsavedChanges: false,
      });
    });

    it('moving forward keeps the OLD left page under the incoming leaf, reveals the new right page, and settles invisibly', async () => {
      vi.mocked(useReducedMotion).mockReturnValue(false);
      const { container } = render(
        <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
      );
      await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1,2]
      await waitFor(() => expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument(), {
        timeout: 2500,
      });
      await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [3,4]

      // Mid-flight: a forward-hinged decorative leaf is flying...
      const leaf = container.querySelector('[class*="leafForward"]');
      expect(leaf).not.toBeNull();
      expect(container.querySelector('[class*="leafClip"]')).toHaveAttribute('aria-hidden', 'true');
      // ...the half it will land on still shows the OUTGOING page (swapping
      // it to the destination immediately made the covered side visibly
      // "turn into itself" -- the reported bug)...
      expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument();
      // ...the half it lifted away from already reveals the NEW page...
      expect(screen.getByLabelText(/page 5/i)).toBeInTheDocument();
      // ...and the new left page exists only as the leaf's unlabeled,
      // decorative back face until the leaf lands.
      expect(screen.queryByLabelText(/page 4/i)).not.toBeInTheDocument();

      // Settled: the covered half swaps to the destination page in the same
      // render that unmounts the leaf.
      await waitFor(() => expect(screen.getByLabelText(/page 4/i)).toBeInTheDocument(), {
        timeout: 2500,
      });
      await waitFor(() =>
        expect(container.querySelector('[class*="leafForward"]')).toBeNull()
      );
      expect(screen.getAllByLabelText(/page 4/i)).toHaveLength(1);
    });

    it('moving backward keeps the OLD right page under the incoming leaf and reveals the new left page', async () => {
      vi.mocked(useReducedMotion).mockReturnValue(false);
      const { container } = render(
        <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
      );
      // Jump straight to spread [3,4] (instant, no leaf), then flip back.
      fireEvent.change(screen.getByRole('slider', { name: /go to spread/i }), {
        target: { value: '3' },
      });
      expect(screen.getByLabelText(/page 4/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /previous page/i })); // -> spread [1,2]

      // Mid-flight: backward-hinged leaf; covered right half still shows
      // the OUTGOING page 5; revealed left half already shows page 2.
      expect(container.querySelector('[class*="leafBackward"]')).not.toBeNull();
      expect(screen.getByLabelText(/page 5/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/page 3/i)).not.toBeInTheDocument();

      await waitFor(() => expect(screen.getByLabelText(/page 3/i)).toBeInTheDocument(), {
        timeout: 2500,
      });
      await waitFor(() =>
        expect(container.querySelector('[class*="leafBackward"]')).toBeNull()
      );
    });

    it('a lone first page hangs on the right of the rings; a lone final page hangs on the left', async () => {
      // pageCount 4 -> spreads [0], [1,2], [3]: both lone-page cases exist.
      useAppStore.setState({
        binders: [
          {
            id: 'a',
            name: 'My Binder',
            language: 'en',
            config: { rows: 2, columns: 2, pageCount: 4, fillDirection: 'horizontal' },
            customOrder: null,
          },
        ],
        activeBinderId: 'a',
        hasUnsavedChanges: false,
      });
      const { container } = render(
        <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
      );
      const halvesOf = () =>
        Array.from(container.querySelectorAll('[class*="half"]')) as HTMLElement[];

      // Spread [0]: empty left half (inside of the front cover), page 1 right.
      let halves = halvesOf();
      expect(halves[0].querySelector('[class*="coverInside"]')).not.toBeNull();
      expect(halves[1].contains(screen.getByLabelText(/page 1/i))).toBe(true);

      // Jump to the final lone page: page 4 left, empty right half (only the
      // inside of the back cover remains) -- like a real fully-flipped binder.
      await userEvent.selectOptions(screen.getByRole('combobox', { name: /jump to page/i }), '2');
      halves = halvesOf();
      expect(halves[0].contains(screen.getByLabelText(/page 4/i))).toBe(true);
      expect(halves[1].querySelector('[class*="coverInside"]')).not.toBeNull();
    });

    it('the scrubber jumps straight to a spread without animating a leaf', async () => {
      const { container } = render(
        <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
      );
      const scrubber = screen.getByRole('slider', { name: /go to spread/i });
      fireEvent.change(scrubber, { target: { value: '3' } }); // -> spread [3,4]

      expect(screen.getByLabelText(/page 4/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/page 5/i)).toBeInTheDocument();
      // A multi-spread hop is instant -- no leaf.
      expect(container.querySelector('[class*="leaf"]')).toBeNull();
    });
  });

  it("clicking a filled slot calls onSlotClick with the dex number and the active binder's language", async () => {
    const onSlotClick = vi.fn();
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={onSlotClick} />);
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(onSlotClick).toHaveBeenCalledWith(1, 'en');
  });

  it("shows the actual owned card in its slot, resolved from the active binder's own language cache", () => {
    setCachedCards('en', 1, [
      {
        id: 'sv03.5-199',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'sv03.5',
        setName: '151',
        localId: '199',
        rarity: 'Illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        language: 'en',
      },
    ]);
    render(
      <BinderView
        dexEntries={dexEntries}
        owned={{ 1: { dexNumber: 1, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } }}
        dataVersion={0}
        onSlotClick={() => {}}
      />
    );
    expect(screen.getByAltText('Bulbasaur card')).toBeInTheDocument();
    // The sprite-reveal path is no longer reachable once a card is owned.
    expect(screen.queryByAltText('Bulbasaur')).not.toBeInTheDocument();
  });

  it('does not show an owned card art when the owned card id is not present in the cache for any reason', () => {
    render(
      <BinderView
        dexEntries={dexEntries}
        owned={{ 1: { dexNumber: 1, cardId: 'not-cached', condition: 'Near Mint', addedAt: '' } }}
        dataVersion={0}
        onSlotClick={() => {}}
      />
    );
    expect(screen.queryByAltText('Bulbasaur card')).not.toBeInTheDocument();
  });

  it('shows a user-uploaded replacement image on the slot for an owned card with no real image', () => {
    setCachedCards('en', 1, [
      {
        id: 'no-image-card',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'svp',
        setName: 'SVP Black Star Promos',
        localId: '001',
        rarity: 'Promo',
        imageBase: '',
        language: 'en',
      },
    ]);
    useAppStore.setState({ uploadedImages: { 'no-image-card': 'data:image/jpeg;base64,UPLOADED' } });
    render(
      <BinderView
        dexEntries={dexEntries}
        owned={{ 1: { dexNumber: 1, cardId: 'no-image-card', condition: 'Near Mint', addedAt: '' } }}
        dataVersion={0}
        onSlotClick={() => {}}
      />
    );
    expect(screen.getByAltText('Bulbasaur card')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,UPLOADED'
    );
  });

  it("renders an owned card's hostedFullUrl on the slot instead of the live-API-constructed URL when present", () => {
    setCachedCards('en', 1, [
      {
        id: 'sv03.5-199',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'sv03.5',
        setName: '151',
        localId: '199',
        rarity: 'Illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        hostedFullUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp',
        language: 'en',
      },
    ]);
    render(
      <BinderView
        dexEntries={dexEntries}
        owned={{ 1: { dexNumber: 1, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } }}
        dataVersion={0}
        onSlotClick={() => {}}
      />
    );
    expect(screen.getByAltText('Bulbasaur card')).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp'
    );
  });

  it('clicking Enlarge on an owned slot opens the zoom overlay for that card', async () => {
    setCachedCards('en', 1, [
      {
        id: 'sv03.5-199',
        name: 'Bulbasaur',
        dexNumber: 1,
        setId: 'sv03.5',
        setName: '151',
        localId: '199',
        rarity: 'Illustration rare',
        imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
        language: 'en',
      },
    ]);
    render(
      <BinderView
        dexEntries={dexEntries}
        owned={{ 1: { dexNumber: 1, cardId: 'sv03.5-199', condition: 'Near Mint', addedAt: '' } }}
        dataVersion={0}
        onSlotClick={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /enlarge bulbasaur card/i }));

    const zoomDialog = await screen.findByRole('dialog', { name: 'Bulbasaur enlarged' });
    expect(within(zoomDialog).getByAltText(/bulbasaur from 151/i)).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });
});

describe('BinderView manual arrange', () => {
  beforeEach(resetStore);

  it('dragging one slot onto another snapshots the default order and moves the entry', () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    const bulbasaur = screen.getByRole('button', { name: /bulbasaur/i });
    const venusaur = screen.getByRole('button', { name: /venusaur/i });

    fireEvent.dragStart(bulbasaur);
    fireEvent.drop(venusaur);

    const order = activeBinderCustomOrder();
    expect(order).not.toBeNull();
    expect(order?.[0]).toEqual({ type: 'pokemon', dexNumber: 2 }); // Ivysaur now leads
    expect(order?.[2]).toEqual({ type: 'pokemon', dexNumber: 1 }); // Bulbasaur moved to Venusaur's old slot
  });

  it('a second drag operates on the already-snapshotted custom order, not a fresh default', () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'pokemon', dexNumber: 5 },
            { type: 'pokemon', dexNumber: 4 },
            { type: 'pokemon', dexNumber: 3 },
            { type: 'pokemon', dexNumber: 2 },
            { type: 'pokemon', dexNumber: 1 },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    const charmeleon = screen.getByRole('button', { name: /charmeleon/i }); // now first
    const charmander = screen.getByRole('button', { name: /charmander/i }); // now second

    fireEvent.dragStart(charmeleon);
    fireEvent.drop(charmander);

    const order = activeBinderCustomOrder();
    expect(order?.[0]).toEqual({ type: 'pokemon', dexNumber: 4 });
    expect(order?.[1]).toEqual({ type: 'pokemon', dexNumber: 5 });
  });

  it('selecting a slot and choosing Keep empty inserts a blank and shifts the rest forward', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select ivysaur/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

    const order = activeBinderCustomOrder();
    expect(order).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
      { type: 'pokemon', dexNumber: 3 },
      { type: 'pokemon', dexNumber: 4 },
      { type: 'pokemon', dexNumber: 5 },
    ]);
  });

  it('dragging under vertical fill moves the correct entry, not the one at the same row/column position under horizontal fill', () => {
    // 2x2 vertical fill: computeBinderPages assigns sequence[0]->grid[0][0],
    // sequence[1]->grid[1][0], sequence[2]->grid[0][1], sequence[3]->grid[1][1]
    // (column-major). Bulbasaur (seq 0) is at grid[0][0]; Ivysaur (seq 1) is
    // at grid[1][0] -- NOT at the position the horizontal-fill formula would
    // compute for slotIndex 1 (which would be grid[0][1], Venusaur's cell).
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'vertical' },
          customOrder: null,
        },
      ],
      activeBinderId: 'a',
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    const bulbasaur = screen.getByRole('button', { name: /bulbasaur/i });
    const ivysaur = screen.getByRole('button', { name: /ivysaur/i });

    fireEvent.dragStart(bulbasaur);
    fireEvent.drop(ivysaur);

    const order = activeBinderCustomOrder();
    // Bulbasaur (seq 0) and Ivysaur (seq 1) swap; Venusaur (seq 2) is
    // untouched -- if the bug were present, this would incorrectly move
    // Venusaur instead of Ivysaur.
    expect(order?.[0]).toEqual({ type: 'pokemon', dexNumber: 2 });
    expect(order?.[1]).toEqual({ type: 'pokemon', dexNumber: 1 });
    expect(order?.[2]).toEqual({ type: 'pokemon', dexNumber: 3 });
  });

  it('switching the active binder clears a pending selection so Keep empty cannot write into the new binder at a stale index', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'Binder A',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: null,
        },
        {
          id: 'b',
          name: 'Binder B',
          language: 'ja',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'a',
    });
    const { rerender } = render(
      <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />
    );
    await userEvent.click(screen.getByRole('button', { name: /select ivysaur/i }));
    expect(screen.getByRole('button', { name: /keep empty/i })).toBeInTheDocument();

    act(() => {
      useAppStore.getState().setActiveBinder('b');
    });
    rerender(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);

    expect(screen.queryByRole('button', { name: /keep empty/i })).not.toBeInTheDocument();
    expect(useAppStore.getState().binders.find((b) => b.id === 'b')?.customOrder).toBeNull();
  });

  it('switching the active binder while the custom-image editor is open closes it, so Save cannot write into the new binder at a stale slot index', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'Binder A',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'blank' },
            { type: 'pokemon', dexNumber: 1 },
            { type: 'pokemon', dexNumber: 2 },
            { type: 'pokemon', dexNumber: 3 },
          ],
        },
        {
          id: 'b',
          name: 'Binder B',
          language: 'ja',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'blank' },
            { type: 'pokemon', dexNumber: 4 },
            { type: 'pokemon', dexNumber: 5 },
            { type: 'blank' },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    const { rerender } = render(
      <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
    );
    await userEvent.click(screen.getByRole('button', { name: /add a custom image to this slot/i }));
    expect(screen.getByRole('dialog', { name: /edit custom binder slot image/i })).toBeInTheDocument();

    act(() => {
      useAppStore.getState().setActiveBinder('b');
    });
    rerender(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);

    expect(
      screen.queryByRole('dialog', { name: /edit custom binder slot image/i })
    ).not.toBeInTheDocument();
    // Binder B's own slot 0 is also a blank -- if the stale-index bug were
    // present, the editor would have stayed open (still holding binder A's
    // editingSlotIndex) and a subsequent Save could have silently written
    // into binder B's slot 0 instead.
    expect(useAppStore.getState().binders.find((b) => b.id === 'b')?.customOrder?.[0]).toEqual({
      type: 'blank',
    });
  });

  it('an existing blank also shifts forward when a new blank is inserted before it', async () => {
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
            { type: 'pokemon', dexNumber: 2 },
          ],
        },
      ],
      activeBinderId: 'a',
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select bulbasaur/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

    expect(activeBinderCustomOrder()).toEqual([
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });

  it('marking a slot empty, then editing it outside manual arrange, opens the editor and saving persists the image to that slot', async () => {
    const { rerender } = render(
      <BinderView
        dexEntries={dexEntries}
        owned={{}}
        dataVersion={0}
        onSlotClick={() => {}}
        isManualArrangeActive
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /select bulbasaur/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));
    expect(activeBinderCustomOrder()?.[0]).toEqual({ type: 'blank' });

    // BinderSlot only offers its "add a custom image" affordance outside
    // manual arrange (dragging/selecting takes priority there) -- turning
    // it off on the SAME render tree is what makes the now-blank first slot
    // editable.
    rerender(
      <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />
    );

    await userEvent.click(screen.getByRole('button', { name: /add a custom image to this slot/i }));
    const dialog = screen.getByRole('dialog', { name: /edit custom binder slot image/i });

    const file = new File(['fake-image-bytes'], 'filler.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText(/upload an image/i), file);
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Save' }));

    expect(activeBinderCustomOrder()?.[0]).toMatchObject({
      type: 'blank',
      customImage: { offsetX: 0, offsetY: 0, zoom: 1 },
    });
    expect(
      screen.queryByRole('dialog', { name: /edit custom binder slot image/i })
    ).not.toBeInTheDocument();
  });

  it('selecting an already-blank slot offers Edit image and Remove empty slot instead of Keep empty', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          // Exactly 3 slots of capacity for exactly 3 entries -- no
          // out-of-capacity padding slot, which would otherwise ALSO render
          // as an ambiguous second "Select this empty slot" match.
          config: { rows: 1, columns: 3, pageCount: 1, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'blank' },
            { type: 'pokemon', dexNumber: 1 },
            { type: 'pokemon', dexNumber: 2 },
          ],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);

    // The blank slot itself is now selectable/draggable during manual
    // arrange (see BinderSlot's own "keeps an empty slot selectable" fix) --
    // its accessible name is "Select this empty slot" while blank and
    // unowned.
    await userEvent.click(screen.getByRole('button', { name: /select this empty slot/i }));

    expect(screen.queryByRole('button', { name: /keep empty/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit image$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove empty slot/i })).toBeInTheDocument();
  });

  it('"Edit image" opens the editor directly without leaving manual arrange mode', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          // Exactly 2 slots of capacity for exactly 2 entries -- see the
          // previous test's comment for why this must match exactly.
          config: { rows: 1, columns: 2, pageCount: 1, fillDirection: 'horizontal' },
          customOrder: [{ type: 'blank' }, { type: 'pokemon', dexNumber: 1 }],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select this empty slot/i }));
    await userEvent.click(screen.getByRole('button', { name: /^edit image$/i }));
    expect(screen.getByRole('dialog', { name: /edit custom binder slot image/i })).toBeInTheDocument();
  });

  it('"Remove empty slot" deletes just that one blank, shifting the rest back, without touching Reset arrangement', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          // Exactly 3 slots of capacity for exactly 3 entries -- see the
          // first test's comment for why this must match exactly.
          config: { rows: 1, columns: 3, pageCount: 1, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'pokemon', dexNumber: 1 },
            { type: 'blank' },
            { type: 'pokemon', dexNumber: 2 },
          ],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select this empty slot/i }));
    await userEvent.click(screen.getByRole('button', { name: /remove empty slot/i }));
    expect(activeBinderCustomOrder()).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });

  it('pressing Escape exits manual arrange mode too, not just zoom mode', async () => {
    const onExitManualArrange = vi.fn();
    render(
      <BinderView
        dexEntries={dexEntries}
        owned={{}}
        dataVersion={0}
        onSlotClick={() => {}}
        isManualArrangeActive
        onExitManualArrange={onExitManualArrange}
      />
    );
    await userEvent.keyboard('{Escape}');
    expect(onExitManualArrange).toHaveBeenCalledTimes(1);
  });

  it('clicking Next page clears a pending selection, so the nav bar no longer offers an action for the page just left behind', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select ivysaur/i }));
    expect(screen.getByRole('button', { name: /keep empty/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(screen.queryByRole('button', { name: /keep empty/i })).not.toBeInTheDocument();
    // The underlying selectedIndex (not just some other gating condition)
    // was actually cleared -- customOrder is still untouched, since there's
    // no more selection left for anything to act on.
    expect(activeBinderCustomOrder()).toBeNull();
  });

  it('clicking Previous page also clears a pending selection', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 2, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: null,
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1, 2]
    // Select a slot that actually lives on the now-visible spread. (The old
    // page-turn model kept the previous page mounted mid-exit-animation, so
    // this test used to reach back and click a slot on page 1 -- pages now
    // swap instantly, so only current-spread slots exist.)
    await userEvent.click(screen.getAllByRole('button', { name: /select this empty slot/i })[0]);
    expect(screen.getByRole('button', { name: /keep empty/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /previous page/i }));

    expect(screen.queryByRole('button', { name: /keep empty/i })).not.toBeInTheDocument();
  });

  // Binder Settings' "Done arranging" button calls onToggleManualArrange
  // directly (see BinderSettings.tsx), which flips isManualArrangeActive off
  // WITHOUT going through the Escape keydown handler or a binder switch --
  // the two other paths that already clear this state inline. Simulated
  // here via rerender with isManualArrangeActive=false, exactly like App.tsx
  // itself would re-render BinderView once its lifted isManualArrangeActive
  // state flips.
  it('turning off manual arrange (e.g. via "Done arranging") clears a pending selection, even though that path never touches Escape or a binder switch', async () => {
    const { rerender } = render(
      <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />
    );
    await userEvent.click(screen.getByRole('button', { name: /select ivysaur/i }));
    expect(screen.getByRole('button', { name: /keep empty/i })).toBeInTheDocument();

    rerender(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    // Back into manual arrange with the selection now gone -- if the bug
    // were present, the previously-selected slot would still show as
    // selected and "Keep empty" would reappear without clicking anything.
    rerender(
      <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />
    );

    expect(screen.queryByRole('button', { name: /keep empty/i })).not.toBeInTheDocument();
  });

  it('turning off manual arrange closes a still-open custom-image editor overlay instead of leaving it functional', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 1, columns: 3, pageCount: 1, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'blank' },
            { type: 'pokemon', dexNumber: 1 },
            { type: 'pokemon', dexNumber: 2 },
          ],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    const { rerender } = render(
      <BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />
    );
    await userEvent.click(screen.getByRole('button', { name: /select this empty slot/i }));
    await userEvent.click(screen.getByRole('button', { name: /^edit image$/i }));
    expect(screen.getByRole('dialog', { name: /edit custom binder slot image/i })).toBeInTheDocument();

    rerender(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);

    expect(
      screen.queryByRole('dialog', { name: /edit custom binder slot image/i })
    ).not.toBeInTheDocument();
  });

  it('"Keep empty" on an out-of-capacity spare slot (beyond the last real entry) is a no-op, since that slot is already implicitly blank', async () => {
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          // 2x2 = 4 slots of capacity for only 3 real entries -- slot index 3
          // is a spare, past-capacity slot with entry === undefined.
          config: { rows: 2, columns: 2, pageCount: 1, fillDirection: 'horizontal' },
          customOrder: [
            { type: 'pokemon', dexNumber: 1 },
            { type: 'pokemon', dexNumber: 2 },
            { type: 'pokemon', dexNumber: 3 },
          ],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    // The one remaining spare slot renders the same "Select this empty
    // slot" affordance as a real kept-empty blank (see BinderSlot.tsx).
    await userEvent.click(screen.getByRole('button', { name: /select this empty slot/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

    // If the bug were present, this would have inserted a new blank right
    // after dexNumber 3 (entries.length) instead of doing nothing, shifting
    // no real entries but still writing a spurious customOrder.
    expect(activeBinderCustomOrder()).toEqual([
      { type: 'pokemon', dexNumber: 1 },
      { type: 'pokemon', dexNumber: 2 },
      { type: 'pokemon', dexNumber: 3 },
    ]);
  });
});

describe('BinderView split-image multi-select', () => {
  // rows x columns = 2 x 3, 3 pages -- spreads: [0], [1,2]. Page 0 (lone)
  // gives a page with no spine restriction at all; the paired spread [1,2]
  // gives a genuine left page (spine = its own last column, index 2) and
  // right page (spine = its own first column, index 0), each 3 columns wide
  // so there's room for both a spine-including and a spine-avoiding 2-column
  // range on the very same page.
  function setUpSplitBinder() {
    const blank = { type: 'blank' as const };
    useAppStore.setState({
      binders: [
        {
          id: 'a',
          name: 'My Binder',
          language: 'en',
          config: { rows: 2, columns: 3, pageCount: 3, fillDirection: 'horizontal' },
          customOrder: [
            // Page 0 (lone): row0 = [blank, blank, pokemon]; row1 = all blank.
            blank,
            blank,
            { type: 'pokemon', dexNumber: 1 },
            blank,
            blank,
            blank,
            // Page 1 ("Page 2", left of the [1,2] spread): all blank.
            blank,
            blank,
            blank,
            blank,
            blank,
            blank,
            // Page 2 ("Page 3", right of the [1,2] spread): all blank.
            blank,
            blank,
            blank,
            blank,
            blank,
            blank,
          ],
        },
      ],
      activeBinderId: 'a',
      hasUnsavedChanges: false,
    });
  }

  beforeEach(() => {
    resetStore();
    setUpSplitBinder();
  });

  function blankSlotsWithin(pageLabel: RegExp) {
    return within(screen.getByLabelText(pageLabel)).getAllByRole('button', {
      name: /select this empty slot/i,
    });
  }

  it('offers "Split image across 2 slots" after clicking one blank slot then shift-clicking an adjacent blank slot on the same lone page', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    const slots = blankSlotsWithin(/page 1/i);
    await userEvent.click(slots[0]); // slot 0 (row0 col0)
    fireEvent.click(slots[1], { shiftKey: true }); // slot 1 (row0 col1)
    expect(screen.getByRole('button', { name: /split image across 2 slots/i })).toBeInTheDocument();
  });

  it('does not offer the split action, and shows a rejection message, when the shift-clicked range touches a non-blank (pokemon) slot', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    const page1 = screen.getByLabelText(/page 1/i);
    const slots = blankSlotsWithin(/page 1/i);
    await userEvent.click(slots[1]); // slot 1 (row0 col1), blank
    fireEvent.click(within(page1).getByRole('button', { name: /select bulbasaur/i }), {
      shiftKey: true,
    }); // slot 2 (row0 col2), pokemon
    expect(screen.queryByRole('button', { name: /split image across/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/crosses the spine or an existing card/i);
  });

  it('offers the split action for a valid non-spine range on a LEFT page of a two-page spread', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1,2]
    const slots = blankSlotsWithin(/page 2/i); // pageIndex 1, the LEFT page
    await userEvent.click(slots[0]); // row0 col0
    fireEvent.click(slots[1], { shiftKey: true }); // row0 col1 -- not the spine (col2)
    expect(screen.getByRole('button', { name: /split image across 2 slots/i })).toBeInTheDocument();
  });

  it('rejects a range on a LEFT page that includes its own spine-adjacent last column', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1,2]
    const slots = blankSlotsWithin(/page 2/i); // pageIndex 1, the LEFT page
    await userEvent.click(slots[1]); // row0 col1
    fireEvent.click(slots[2], { shiftKey: true }); // row0 col2 -- the spine column
    expect(screen.queryByRole('button', { name: /split image across/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('offers the split action for a valid non-spine range on a RIGHT page of a two-page spread', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1,2]
    const slots = blankSlotsWithin(/page 3/i); // pageIndex 2, the RIGHT page
    await userEvent.click(slots[1]); // row0 col1
    fireEvent.click(slots[2], { shiftKey: true }); // row0 col2 -- not the spine (col0)
    expect(screen.getByRole('button', { name: /split image across 2 slots/i })).toBeInTheDocument();
  });

  it('rejects a range on a RIGHT page that includes its own spine-adjacent first column', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1,2]
    const slots = blankSlotsWithin(/page 3/i); // pageIndex 2, the RIGHT page
    await userEvent.click(slots[0]); // row0 col0 -- the spine column
    fireEvent.click(slots[1], { shiftKey: true }); // row0 col1
    expect(screen.queryByRole('button', { name: /split image across/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rejects a range whose anchor and target land on two different pages, even though both are visible in the same spread', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i })); // -> spread [1,2]
    const leftSlots = blankSlotsWithin(/page 2/i);
    const rightSlots = blankSlotsWithin(/page 3/i);
    await userEvent.click(leftSlots[0]);
    fireEvent.click(rightSlots[0], { shiftKey: true });
    expect(screen.queryByRole('button', { name: /split image across/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('uploading and saving an image through the split editor gives each slot in the range its own distinct crop transform', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} isManualArrangeActive />);
    const slots = blankSlotsWithin(/page 1/i);
    await userEvent.click(slots[0]);
    fireEvent.click(slots[1], { shiftKey: true });
    await userEvent.click(screen.getByRole('button', { name: /split image across 2 slots/i }));

    const dialog = screen.getByRole('dialog', { name: /split image across binder slots/i });
    const file = new File(['fake-image-bytes'], 'filler.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText(/upload an image/i), file);
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Save' }));

    expect(
      screen.queryByRole('dialog', { name: /split image across binder slots/i })
    ).not.toBeInTheDocument();

    const order = activeBinderCustomOrder();
    const first = order?.[0];
    const second = order?.[1];
    expect(first).toMatchObject({ type: 'blank' });
    expect(second).toMatchObject({ type: 'blank' });
    const firstImage = first?.type === 'blank' ? first.customImage : undefined;
    const secondImage = second?.type === 'blank' ? second.customImage : undefined;
    expect(firstImage).toBeDefined();
    expect(secondImage).toBeDefined();
    // The two adjacent slots must show DIFFERENT slices of the same source
    // image, not both independently re-cropping to the same center.
    expect(firstImage?.offsetX).not.toBeCloseTo(secondImage?.offsetX ?? 0, 2);
    expect(firstImage?.dataUri).toBe(secondImage?.dataUri);
  });
});

describe('zoom', () => {
  beforeEach(resetStore);

  it('pressing g enters zoom mode, shown via the zoom control hint', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/scroll to zoom/i);
  });

  it('scrolling while in zoom mode changes the zoom slider value', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    const slider = screen.getByRole('slider', { name: /zoom/i });
    const before = Number(slider.getAttribute('value') ?? slider.getAttribute('aria-valuenow'));
    fireEvent.wheel(screen.getByLabelText(/page 1/i).parentElement!, { deltaY: -100 });
    const after = Number((slider as HTMLInputElement).value);
    expect(after).toBeGreaterThan(before);
  });

  it('pressing Escape exits zoom mode', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
  });

  it('clicking anywhere while in zoom mode exits it without triggering the click underneath', async () => {
    const onSlotClick = vi.fn();
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={onSlotClick} />);
    await userEvent.keyboard('g');
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('clicking a nav control (not a binder page) while in zoom mode exits zoom mode but does not swallow that click', async () => {
    render(<BinderView dexEntries={dexEntries} owned={{}} dataVersion={0} onSlotClick={() => {}} />);
    await userEvent.keyboard('g');
    expect(screen.getByText(/scroll to zoom/i)).toBeInTheDocument();

    // "Next page" lives in .nav, a sibling of .spread (the binder pages
    // themselves) -- a real click on it is a deliberate control interaction,
    // not a click-through to something unexpected underneath, so it should
    // both exit zoom mode AND still actually advance the page. The same
    // exemption is what lets a user click the zoom slider itself, or (once
    // this component is mounted inside the full app) a Binder Settings
    // control, without the click being silently eaten first.
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument();
  });
});
