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
import { getCachedCards } from '../storage/cardCache';
import type { DexEntry } from '../data/gen1Dex';
import type { OwnedRecord } from '../types';
import { BinderSlot } from './BinderSlot';
import styles from './BinderView.module.css';

// A page hinged at the spine (its inner edge, set via .pageLeft/.pageRight's
// transform-origin in BinderView.module.css) rather than rotating around its
// own center -- matches how a real binder page turns on its rings, not a
// book-corner curl (a paper effect that doesn't fit a rigid binder page,
// evaluated and rejected in favor of this spine-hinge approach). The left
// page in a spread hinges on its right edge; the right page (or a lone first
// page, which has no left-hand partner to hinge against) hinges on its left
// edge. `awayRotation`'s sign is chosen so a page swings AWAY from the
// viewer on exit/entry, as if genuinely rotating back on its hinge, rather
// than rotating through the viewer's side of the page.
function getPageMotion(side: 'left' | 'right', shouldReduceMotion: boolean | null) {
  if (shouldReduceMotion) {
    return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  }
  const awayRotation = side === 'left' ? 130 : -130;
  return {
    initial: { opacity: 0, rotateY: awayRotation },
    animate: { opacity: 1, rotateY: 0, transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] as const } },
    exit: { opacity: 0, rotateY: awayRotation, transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] as const } },
  };
}

export interface BinderViewProps {
  dexEntries: DexEntry[];
  owned: Record<number, OwnedRecord>;
  // A pure cache-busting signal from DexGrid, bumped whenever new card data
  // lands in localStorage -- mirrors DexGrid's own cardsByDexNumber memo,
  // which this component's ownedCardsByDexNumber memo below is the
  // binder-language equivalent of.
  dataVersion: number;
  onSlotClick: (dexNumber: number, language: string) => void;
  isManualArrangeActive?: boolean;
}

export function BinderView({
  dexEntries,
  owned,
  dataVersion,
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

  // Deliberately keyed on activeBinder.language, not any grid-global
  // language: a binder set to a different language than the rest of the app
  // needs its owned-card art resolved from THAT language's cache, exactly
  // like DexGrid.tsx's openCards does for the language-aware Picker. This
  // only reflects whatever's already cached for that language -- it doesn't
  // trigger a fetch itself (see the design spec's documented tradeoff on
  // not auto-prefetching a binder's own language in the background).
  const ownedCardImageByDexNumber = useMemo(() => {
    void dataVersion;
    const map = new Map<number, string>();
    for (const entry of dexEntries) {
      const ownedRecord = owned[entry.number];
      if (!ownedRecord) continue;
      const cards = getCachedCards(activeBinder.language, entry.number) ?? [];
      const card = cards.find((c) => c.id === ownedRecord.cardId);
      if (card) map.set(entry.number, card.imageBase);
    }
    return map;
  }, [dexEntries, owned, activeBinder.language, dataVersion]);

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
          {currentSpread.map((pageIndex, i) => {
            // Only a genuine two-page spread has a "left" page to hinge
            // differently from a "right" page -- a lone first page
            // (currentSpread.length === 1) has no left-hand partner, so it's
            // treated as the right/only page.
            const side: 'left' | 'right' =
              i === 0 && currentSpread.length === 2 ? 'left' : 'right';
            return (
              <motion.div
                key={pageIndex}
                className={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight].join(
                  ' '
                )}
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
                {...getPageMotion(side, shouldReduceMotion)}
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
                        ownedCardImageBase={
                          entry?.type === 'pokemon'
                            ? ownedCardImageByDexNumber.get(entry.dexNumber)
                            : undefined
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
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
