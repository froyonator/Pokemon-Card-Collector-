import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderView } from './BinderView';
import { useAppStore } from '../state/store';
import type { DexEntry } from '../data/gen1Dex';

const dexEntries: DexEntry[] = [
  { number: 1, name: 'Bulbasaur' },
  { number: 2, name: 'Ivysaur' },
  { number: 3, name: 'Venusaur' },
  { number: 4, name: 'Charmander' },
  { number: 5, name: 'Charmeleon' },
];

function resetStore() {
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
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} />);
    expect(screen.getByLabelText(/page 1/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/page 2/i)).not.toBeInTheDocument();
  });

  it('advancing to the next spread shows pages 2 and 3 together', async () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByLabelText(/page 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page 3/i)).toBeInTheDocument();
  });

  it('the previous button on the first spread is disabled', () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it("clicking a filled slot calls onSlotClick with the dex number and the active binder's language", async () => {
    const onSlotClick = vi.fn();
    render(<BinderView dexEntries={dexEntries} onSlotClick={onSlotClick} />);
    await userEvent.click(screen.getByRole('button', { name: /bulbasaur/i }));
    expect(onSlotClick).toHaveBeenCalledWith(1, 'en');
  });
});

describe('BinderView manual arrange', () => {
  beforeEach(resetStore);

  it('dragging one slot onto another snapshots the default order and moves the entry', () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
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
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
    const charmeleon = screen.getByRole('button', { name: /charmeleon/i }); // now first
    const charmander = screen.getByRole('button', { name: /charmander/i }); // now second

    fireEvent.dragStart(charmeleon);
    fireEvent.drop(charmander);

    const order = activeBinderCustomOrder();
    expect(order?.[0]).toEqual({ type: 'pokemon', dexNumber: 4 });
    expect(order?.[1]).toEqual({ type: 'pokemon', dexNumber: 5 });
  });

  it('selecting a slot and choosing Keep empty inserts a blank and shifts the rest forward', async () => {
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
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
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
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
      <BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />
    );
    await userEvent.click(screen.getByRole('button', { name: /select ivysaur/i }));
    expect(screen.getByRole('button', { name: /keep empty/i })).toBeInTheDocument();

    useAppStore.getState().setActiveBinder('b');
    rerender(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);

    expect(screen.queryByRole('button', { name: /keep empty/i })).not.toBeInTheDocument();
    expect(useAppStore.getState().binders.find((b) => b.id === 'b')?.customOrder).toBeNull();
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
    render(<BinderView dexEntries={dexEntries} onSlotClick={() => {}} isManualArrangeActive />);
    await userEvent.click(screen.getByRole('button', { name: /select bulbasaur/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep empty/i }));

    expect(activeBinderCustomOrder()).toEqual([
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 1 },
      { type: 'blank' },
      { type: 'pokemon', dexNumber: 2 },
    ]);
  });
});
