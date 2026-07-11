import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BinderView } from './BinderView';
import { useAppStore } from '../state/store';
import { setCachedCards } from '../storage/cardCache';
import type { DexEntry } from '../data/gen1Dex';

// ResizeObserver is globally mocked in src/test/setup.ts (jsdom doesn't
// implement it at all) -- BinderView measures its .spread container via one
// to compute real pixel slot sizes (see src/state/binderSlotSizing.ts).

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
  beforeEach(resetStore);

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
