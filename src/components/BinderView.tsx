import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spriteUrl } from '../api/pokeapi';
import {
  computeBinderPages,
  computeSpreadPageIndices,
  defaultBinderSequence,
  insertBlankAt,
  moveEntry,
} from '../state/binderLayout';
import { computeSlotSize } from '../state/binderSlotSizing';
import { useAppStore } from '../state/store';
import { getCachedCards } from '../storage/cardCache';
import type { DexEntry } from '../data/gen1Dex';
import type { BinderFillDirection, BinderSlotEntry, OwnedRecord } from '../types';
import { BinderSlot } from './BinderSlot';
import { BinderZoomControl, MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';
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

// Must match .page's own `gap` in BinderView.module.css (currently
// var(--space-2), defined as 8px in src/styles/global.css) -- kept as a
// separate JS constant since computeSlotSize needs a plain number, not a CSS
// custom property. If --space-2 is ever changed, this needs updating too.
const GAP_PX = 8;

// .page's own left+right padding (2 * var(--space-4), 16px each = 32px
// total) -- for the same reason GAP_PX above is a JS constant, this can't be
// read from the CSS custom property directly and has to be kept in sync by
// hand if --space-4 ever changes.
const PAGE_PADDING_PX = 32;

// Each rendered page needs its OWN independent measured size -- a two-page
// spread renders two .page elements that each claim an equal share of
// .spread's width via flex: 1 (see BinderView.module.css), so one shared
// measurement of the whole spread can't tell computeSlotSize how big a
// single page's own box actually is. React hooks can't be called inside the
// currentSpread.map(...) callback below, which is why this is a reusable
// hook and BinderPage (below) is its own component -- one usePageSize() call
// per rendered page.
function usePageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

interface BinderPageProps {
  pageIndex: number;
  rows: number;
  columns: number;
  entries: (BinderSlotEntry | undefined)[][];
  fillDirection: BinderFillDirection;
  nameByDexNumber: Map<number, string>;
  ownedCardImageByDexNumber: Map<number, string>;
  onSlotClick: (dexNumber: number) => void;
  isManualArrangeActive: boolean;
  selectedIndex: number | null;
  onSelectSlot: (slotIndex: number) => void;
  onDragStartSlot: (slotIndex: number) => void;
  onDropSlot: (slotIndex: number) => void;
  // Which edge this page hinges on -- see getPageMotion above, which
  // BinderPage calls directly since the motion also needs to pair with the
  // matching .pageLeft/.pageRight CSS class for its transform-origin.
  side: 'left' | 'right';
}

// Sets `node` on every ref in `refs`, function or object alike -- needed
// because BinderPage's root DOM node has two independent consumers: its own
// usePageSize() measurement ref, AND (see the forwardRef wrapper below) a
// ref that AnimatePresence's popLayout mode attaches from OUTSIDE the
// component to freeze the exiting page's size/position. Neither can be
// dropped in favor of the other.
function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

// A plain function component here would break AnimatePresence's
// mode="popLayout": PopChild clones its immediate child and attaches its own
// ref to it (to measure and freeze the exiting page's size before taking it
// out of flow -- see BinderView.tsx's use of AnimatePresence below), and a
// ref can only attach to a DOM node or a forwardRef component, not a plain
// function component. Without this, popLayout's exit measurement silently
// no-ops and the original "both pages slide right" bug (see the
// AnimatePresence comment below) comes back.
const BinderPage = forwardRef<HTMLDivElement, BinderPageProps>(function BinderPage(
  {
    pageIndex,
    rows,
    columns,
    entries,
    fillDirection,
    nameByDexNumber,
    ownedCardImageByDexNumber,
    onSlotClick,
    isManualArrangeActive,
    selectedIndex,
    onSelectSlot,
    onDragStartSlot,
    onDropSlot,
    side,
  },
  forwardedRef
) {
  const [measureRef, size] = usePageSize();
  const shouldReduceMotion = useReducedMotion();
  const slotSize = computeSlotSize({
    containerWidth: size.width - PAGE_PADDING_PX,
    containerHeight: size.height - PAGE_PADDING_PX,
    rows,
    columns,
    gap: GAP_PX,
  });

  return (
    <motion.div
      ref={mergeRefs(measureRef, forwardedRef)}
      className={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight].join(' ')}
      aria-label={`Page ${pageIndex + 1}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, ${slotSize.width}px)`,
        gridTemplateRows: `repeat(${rows}, ${slotSize.height}px)`,
      }}
      {...getPageMotion(side, shouldReduceMotion)}
    >
      {entries.flatMap((row, r) =>
        row.map((entry, c) => {
          // Must invert computeBinderPages's own fill order exactly:
          // horizontal fill assigns sequence index r*columns+c to grid[r][c],
          // vertical fill assigns c*rows+r instead. Using the horizontal
          // formula unconditionally here would make drag-and-drop and "keep
          // empty" silently act on the WRONG sequence position under
          // vertical fill.
          const withinPage = fillDirection === 'horizontal' ? r * columns + c : c * rows + r;
          const slotIndex = pageIndex * rows * columns + withinPage;
          return (
            <BinderSlot
              key={`${r}-${c}`}
              entry={entry}
              pokemonName={entry?.type === 'pokemon' ? nameByDexNumber.get(entry.dexNumber) : undefined}
              spriteUrl={entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined}
              ownedCardImageBase={
                entry?.type === 'pokemon' ? ownedCardImageByDexNumber.get(entry.dexNumber) : undefined
              }
              onClick={onSlotClick}
              isManualArrangeActive={isManualArrangeActive}
              isSelected={selectedIndex === slotIndex}
              onSelect={() => onSelectSlot(slotIndex)}
              onDragStart={() => onDragStartSlot(slotIndex)}
              onDrop={() => onDropSlot(slotIndex)}
            />
          );
        })
      )}
    </motion.div>
  );
});

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
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isZoomModeActive, setIsZoomModeActive] = useState(false);

  // Keyboard: 'g' enters zoom mode, Escape exits it. Attached to `window`
  // rather than a specific element since the user can press 'g' with focus
  // anywhere on the page, not just while a binder element itself has focus.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'g' || event.key === 'G') {
        setIsZoomModeActive(true);
      } else if (event.key === 'Escape') {
        setIsZoomModeActive(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Any click anywhere exits zoom mode and swallows that specific click so it
  // doesn't also activate whatever was underneath it (e.g. opening a binder
  // slot's Picker) -- captured on window in the CAPTURE phase, so it runs
  // before the click reaches its actual target and can be stopped there.
  useEffect(() => {
    if (!isZoomModeActive) return;
    function handleClickCapture(event: MouseEvent) {
      event.stopPropagation();
      event.preventDefault();
      setIsZoomModeActive(false);
    }
    window.addEventListener('click', handleClickCapture, { capture: true });
    return () => window.removeEventListener('click', handleClickCapture, { capture: true });
  }, [isZoomModeActive]);

  function handleWheel(event: React.WheelEvent) {
    if (!isZoomModeActive) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 20) / 20)));
  }

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
        <BinderZoomControl zoom={zoom} onZoomChange={setZoom} isZoomModeActive={isZoomModeActive} />
      </div>
      <div
        className={styles.spread}
        onWheel={handleWheel}
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
      >
        {/* mode="popLayout": .spread is a plain flex row, so without this an
            exiting page (kept mounted by AnimatePresence during its exit
            animation) stays a normal flex sibling of the newly-entering
            pages, shoving them sideways instead of both animating in place
            over the same screen position -- exactly the "both pages slide
            right" bug this fixes. popLayout takes an exiting element out of
            flow (position: absolute) the moment it starts exiting, so it can
            no longer affect its siblings' layout. */}
        <AnimatePresence mode="popLayout">
          {currentSpread.map((pageIndex, i) => {
            // Only a genuine two-page spread has a "left" page to hinge
            // differently from a "right" page -- a lone first page
            // (currentSpread.length === 1) has no left-hand partner, so it's
            // treated as the right/only page.
            const side: 'left' | 'right' =
              i === 0 && currentSpread.length === 2 ? 'left' : 'right';
            return (
              <BinderPage
                key={pageIndex}
                pageIndex={pageIndex}
                rows={activeBinder.config.rows}
                columns={activeBinder.config.columns}
                entries={pages[pageIndex] ?? []}
                fillDirection={activeBinder.config.fillDirection}
                nameByDexNumber={nameByDexNumber}
                ownedCardImageByDexNumber={ownedCardImageByDexNumber}
                onSlotClick={(dexNumber) => onSlotClick(dexNumber, activeBinder.language)}
                isManualArrangeActive={isManualArrangeActive}
                selectedIndex={selectedIndex}
                onSelectSlot={setSelectedIndex}
                onDragStartSlot={setDragFromIndex}
                onDropSlot={handleDrop}
                side={side}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
