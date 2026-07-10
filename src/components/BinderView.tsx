import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spriteUrl } from '../api/pokeapi';
import {
  computeBinderPages,
  computeSpreadPageIndices,
  defaultBinderSequence,
  insertBlankAt,
  moveEntry,
} from '../state/binderLayout';
import { useAppStore } from '../state/store';
import type { DexEntry } from '../data/gen1Dex';
import { BinderSlot } from './BinderSlot';
import styles from './BinderView.module.css';

export interface BinderViewProps {
  dexEntries: DexEntry[];
  onSlotClick: (dexNumber: number, language: string) => void;
  isManualArrangeActive?: boolean;
}

export function BinderView({
  dexEntries,
  onSlotClick,
  isManualArrangeActive = false,
}: BinderViewProps) {
  const binders = useAppStore((s) => s.binders);
  const activeBinderId = useAppStore((s) => s.activeBinderId);
  const setBinderCustomOrder = useAppStore((s) => s.setBinderCustomOrder);
  const activeBinder = binders.find((b) => b.id === activeBinderId) ?? binders[0];
  const shouldReduceMotion = useReducedMotion();
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    setSpreadIndex(0);
    // A selection or in-progress drag is a position WITHIN this specific
    // binder's current layout. Switching to a different binder, or changing
    // this binder's own rows/columns/fillDirection (which changes what a
    // given slotIndex even refers to), makes a leftover index dangerously
    // stale -- without this, a pending "Keep empty" from a previous binder
    // or layout could silently write a blank into the WRONG binder or the
    // WRONG position once acted on.
    setDragFromIndex(null);
    setSelectedIndex(null);
  }, [activeBinder.id, activeBinder.config]);

  const nameByDexNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of dexEntries) map.set(entry.number, entry.name);
    return map;
  }, [dexEntries]);

  const sequence = activeBinder.customOrder ?? defaultBinderSequence(dexEntries);

  // Manual-arrange edits always operate on `sequence` as it exists RIGHT
  // NOW (whether that's the live default or an already-customized order),
  // and every edit writes the full result back via setBinderCustomOrder --
  // this is what "snapshots the current default sequence on first edit"
  // means in practice: there's no separate snapshot step, the first edit's
  // own write IS the snapshot, and every edit after that reads the
  // already-persisted customOrder as its starting point instead of
  // recomputing the default.
  function handleDrop(toIndex: number) {
    if (dragFromIndex === null || dragFromIndex === toIndex) {
      setDragFromIndex(null);
      return;
    }
    setBinderCustomOrder(activeBinder.id, moveEntry(sequence, dragFromIndex, toIndex));
    setDragFromIndex(null);
  }

  function handleKeepEmpty() {
    if (selectedIndex === null) return;
    setBinderCustomOrder(activeBinder.id, insertBlankAt(sequence, selectedIndex));
    setSelectedIndex(null);
  }

  const pages = useMemo(
    () => computeBinderPages(sequence, activeBinder.config),
    [sequence, activeBinder.config]
  );
  const spreads = useMemo(
    () => computeSpreadPageIndices(activeBinder.config.pageCount),
    [activeBinder.config.pageCount]
  );
  const currentSpread = spreads[spreadIndex] ?? [];

  const pageMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, rotateY: -90 },
        animate: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: 90 },
        transition: { duration: 0.35 },
      };

  return (
    <div className={styles.binder}>
      <div className={styles.nav}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={spreadIndex === 0}
          onClick={() => setSpreadIndex((i) => Math.max(0, i - 1))}
        >
          &larr;
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={spreadIndex >= spreads.length - 1}
          onClick={() => setSpreadIndex((i) => Math.min(spreads.length - 1, i + 1))}
        >
          &rarr;
        </button>
        {isManualArrangeActive && selectedIndex !== null && (
          <button type="button" onClick={handleKeepEmpty}>
            Keep empty
          </button>
        )}
      </div>
      <div className={styles.spread}>
        <AnimatePresence>
          {currentSpread.map((pageIndex) => (
            <motion.div
              key={pageIndex}
              className={styles.page}
              aria-label={`Page ${pageIndex + 1}`}
              style={{
                // minmax(0, 1fr), not a bare 1fr: a bare 1fr track's default
                // minimum is its content's intrinsic size, which let a
                // revealed sprite balloon the whole grid on hover before the
                // fixed pixel sizing in BinderSlot.module.css also capped
                // this at the image level. Both fixes address the same
                // underlying "grid track sized from unconstrained content"
                // problem, from different layers, since either alone would
                // leave a future slot-content change able to reintroduce it.
                gridTemplateColumns: `repeat(${activeBinder.config.columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${activeBinder.config.rows}, minmax(0, 1fr))`,
              }}
              {...pageMotion}
            >
              {pages[pageIndex]?.flatMap((row, r) =>
                row.map((entry, c) => {
                  // Must invert computeBinderPages's own fill order exactly:
                  // horizontal fill assigns sequence index r*columns+c to
                  // grid[r][c], vertical fill assigns c*rows+r instead. Using
                  // the horizontal formula unconditionally here would make
                  // drag-and-drop and "keep empty" silently act on the WRONG
                  // sequence position under vertical fill.
                  const { rows, columns, fillDirection } = activeBinder.config;
                  const withinPage =
                    fillDirection === 'horizontal' ? r * columns + c : c * rows + r;
                  const slotIndex = pageIndex * rows * columns + withinPage;
                  return (
                    <BinderSlot
                      key={`${r}-${c}`}
                      entry={entry}
                      pokemonName={
                        entry?.type === 'pokemon'
                          ? nameByDexNumber.get(entry.dexNumber)
                          : undefined
                      }
                      spriteUrl={
                        entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined
                      }
                      onClick={(dexNumber) => onSlotClick(dexNumber, activeBinder.language)}
                      isManualArrangeActive={isManualArrangeActive}
                      isSelected={selectedIndex === slotIndex}
                      onSelect={() => setSelectedIndex(slotIndex)}
                      onDragStart={() => setDragFromIndex(slotIndex)}
                      onDrop={() => handleDrop(slotIndex)}
                    />
                  );
                })
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
