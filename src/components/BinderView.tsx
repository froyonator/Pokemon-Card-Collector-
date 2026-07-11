import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
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
import type {
  BinderFillDirection,
  BinderSlotEntry,
  CardRecord,
  CustomSlotImage,
  OwnedRecord,
} from '../types';
import { BinderSlot } from './BinderSlot';
import { BinderZoomControl, MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';
import { CardZoomOverlay } from './CardZoomOverlay';
import { SlotImageEditor } from './SlotImageEditor';
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

// .page's own left+right padding (2 * var(--space-2), 8px each = 16px
// total) -- for the same reason GAP_PX above is a JS constant, this can't be
// read from the CSS custom property directly and has to be kept in sync by
// hand if --space-2 ever changes.
const PAGE_PADDING_PX = 16;

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
  ownedCardByDexNumber: Map<number, CardRecord>;
  // A user-uploaded replacement image for an owned card with no real TCGdex
  // image (see CardImage's own uploadedImageUri prop) -- keyed the same way
  // as ownedCardByDexNumber, but resolved separately since it comes from a
  // completely different piece of store state (uploadedImages, keyed by
  // card id) rather than the card cache.
  uploadedImageUriByDexNumber: Map<number, string>;
  onSlotClick: (dexNumber: number) => void;
  isManualArrangeActive: boolean;
  selectedIndex: number | null;
  onSelectSlot: (slotIndex: number) => void;
  onDragStartSlot: (slotIndex: number) => void;
  onDropSlot: (slotIndex: number) => void;
  // Only relevant for a `blank` entry, and only outside manual-arrange mode
  // -- see BinderSlot's own onEditCustomImage prop for the full rationale.
  onEditSlot: (slotIndex: number) => void;
  // Only relevant for an OWNED pokemon entry -- see BinderSlot's own
  // onEnlarge prop for the full rationale.
  onEnlargeSlot: (card: CardRecord) => void;
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
    ownedCardByDexNumber,
    uploadedImageUriByDexNumber,
    onSlotClick,
    isManualArrangeActive,
    selectedIndex,
    onSelectSlot,
    onDragStartSlot,
    onDropSlot,
    onEditSlot,
    onEnlargeSlot,
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
          const ownedCard =
            entry?.type === 'pokemon' ? ownedCardByDexNumber.get(entry.dexNumber) : undefined;
          return (
            <BinderSlot
              key={`${r}-${c}`}
              entry={entry}
              pokemonName={entry?.type === 'pokemon' ? nameByDexNumber.get(entry.dexNumber) : undefined}
              spriteUrl={entry?.type === 'pokemon' ? spriteUrl(entry.dexNumber) : undefined}
              ownedCardImageBase={ownedCard?.imageBase}
              uploadedImageUri={
                entry?.type === 'pokemon' ? uploadedImageUriByDexNumber.get(entry.dexNumber) : undefined
              }
              onClick={onSlotClick}
              isManualArrangeActive={isManualArrangeActive}
              isSelected={selectedIndex === slotIndex}
              onSelect={() => onSelectSlot(slotIndex)}
              onDragStart={() => onDragStartSlot(slotIndex)}
              onDrop={() => onDropSlot(slotIndex)}
              onEditCustomImage={entry?.type === 'blank' ? () => onEditSlot(slotIndex) : undefined}
              onEnlarge={ownedCard ? () => onEnlargeSlot(ownedCard) : undefined}
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
  const setBinderSlotCustomImage = useAppStore((s) => s.setBinderSlotCustomImage);
  const uploadedImages = useAppStore((s) => s.uploadedImages);
  const activeBinder = binders.find((b) => b.id === activeBinderId) ?? binders[0];
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isZoomModeActive, setIsZoomModeActive] = useState(false);
  // Which blank slot's custom-image editor is currently open, as an index
  // into `sequence` below -- undefined/null means no editor is open. See
  // handleSaveCustomImage and the portaled SlotImageEditor overlay further
  // down for how this is consumed.
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  // The card currently shown large in CardZoomOverlay, opened via a
  // BinderSlot's Enlarge button -- mirrors DexGrid.tsx's own zoomedCard
  // state exactly (same reasoning: BinderSlot stays presentational, so this
  // lives here instead).
  const [zoomedCard, setZoomedCard] = useState<CardRecord | null>(null);
  // The actual binder pages, not the toolbar around them -- see
  // handleClickCapture below for why only clicks landing in here get
  // swallowed.
  const spreadRef = useRef<HTMLDivElement>(null);

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

  // Any click anywhere exits zoom mode. A click that lands on the binder
  // pages themselves (.spread, via spreadRef) also gets swallowed --
  // stopped and prevented -- so it doesn't also activate whatever was
  // underneath it (e.g. opening a binder slot's Picker). Captured on window
  // in the CAPTURE phase, so it runs before the click reaches its actual
  // target and can be stopped there.
  //
  // A click OUTSIDE .spread is left alone (still exits zoom mode, but isn't
  // stopped/prevented): the zoom slider itself, the page-nav/"Keep empty"
  // buttons, and -- once this component is mounted inside the full app --
  // Binder Settings' controls are all real, deliberate interactions a user
  // might reasonably make while zoom mode happens to still be active, not a
  // click-through to something unexpected underneath. Swallowing those too
  // silently ate the click's own effect (e.g. toggling Manual arrange),
  // requiring a confusing second click to actually do anything -- confirmed
  // live in the browser before this exemption was added.
  useEffect(() => {
    if (!isZoomModeActive) return;
    function handleClickCapture(event: MouseEvent) {
      if (spreadRef.current?.contains(event.target as Node)) {
        event.stopPropagation();
        event.preventDefault();
      }
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
    // A selection, in-progress drag, or open custom-image editor is a
    // position WITHIN this specific binder's current layout. Switching to a
    // different binder, or changing this binder's own
    // rows/columns/fillDirection (which changes what a given slotIndex even
    // refers to), makes a leftover index dangerously stale -- without this,
    // a pending "Keep empty" or a still-open SlotImageEditor from a
    // previous binder or layout could silently write into the WRONG binder
    // or the WRONG position once acted on. zoomedCard isn't index-based (it
    // holds a full CardRecord, so it can't corrupt the wrong slot), but it's
    // cleared too so an Enlarge overlay from a previous binder doesn't
    // linger after switching away from it.
    setDragFromIndex(null);
    setSelectedIndex(null);
    setEditingSlotIndex(null);
    setZoomedCard(null);
  }, [activeBinder.id, activeBinder.config]);

  const nameByDexNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of dexEntries) map.set(entry.number, entry.name);
    return map;
  }, [dexEntries]);

  // Holds each owned dex number's full CardRecord, not just its imageBase --
  // the Enlarge button (see onEnlargeSlot below) needs the whole record to
  // open CardZoomOverlay with, and BinderSlot's own ownedCardImageBase prop
  // is derived from it (`.imageBase`) at each BinderPage's BinderSlot
  // invocation instead of being precomputed as a separate map here.
  // Deliberately keyed on activeBinder.language, not any grid-global
  // language: a binder set to a different language than the rest of the app
  // needs its owned-card art resolved from THAT language's cache, exactly
  // like DexGrid.tsx's openCards does for the language-aware Picker. This
  // only reflects whatever's already cached for that language -- it doesn't
  // trigger a fetch itself (see the design spec's documented tradeoff on
  // not auto-prefetching a binder's own language in the background).
  const ownedCardByDexNumber = useMemo(() => {
    void dataVersion;
    const map = new Map<number, CardRecord>();
    for (const entry of dexEntries) {
      const ownedRecord = owned[entry.number];
      if (!ownedRecord) continue;
      const cards = getCachedCards(activeBinder.language, entry.number) ?? [];
      const card = cards.find((c) => c.id === ownedRecord.cardId);
      if (card) map.set(entry.number, card);
    }
    return map;
  }, [dexEntries, owned, activeBinder.language, dataVersion]);

  // A user-uploaded replacement image for the owned card (see CardImage's
  // own uploadedImageUri prop) -- resolved straight from the owned record's
  // cardId, unlike ownedCardByDexNumber above, since uploadedImages is
  // keyed by card id directly and needs no cache lookup at all. Fixes a
  // pre-existing gap where an uploaded replacement image (set via CardImage's
  // upload fallback for a card with no real TCGdex image) never reached
  // Binder view -- only the Picker ever showed it.
  const uploadedImageUriByDexNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of dexEntries) {
      const ownedRecord = owned[entry.number];
      if (!ownedRecord) continue;
      const uri = uploadedImages[ownedRecord.cardId];
      if (uri) map.set(entry.number, uri);
    }
    return map;
  }, [dexEntries, owned, uploadedImages]);

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

  function handleSaveCustomImage(customImage: CustomSlotImage) {
    if (editingSlotIndex === null) return;
    setBinderSlotCustomImage(activeBinder.id, editingSlotIndex, customImage);
    setEditingSlotIndex(null);
  }

  // The blank entry currently being edited, if any -- resolved once here
  // (rather than indexing `sequence[editingSlotIndex]` again inline below)
  // so TypeScript can actually narrow its `customImage` field; re-indexing
  // the array a second time in the JSX wouldn't be recognized as the same
  // expression and would lose that narrowing.
  const editingEntry = editingSlotIndex !== null ? sequence[editingSlotIndex] : undefined;

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
    <>
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
          ref={spreadRef}
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
                  ownedCardByDexNumber={ownedCardByDexNumber}
                  uploadedImageUriByDexNumber={uploadedImageUriByDexNumber}
                  onSlotClick={(dexNumber) => onSlotClick(dexNumber, activeBinder.language)}
                  isManualArrangeActive={isManualArrangeActive}
                  selectedIndex={selectedIndex}
                  onSelectSlot={setSelectedIndex}
                  onDragStartSlot={setDragFromIndex}
                  onDropSlot={handleDrop}
                  onEditSlot={setEditingSlotIndex}
                  onEnlargeSlot={setZoomedCard}
                  side={side}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      {/* Portaled straight to document.body (both the editor overlay and
          CardZoomOverlay itself), same reason as ManageGroupsPanel /
          CardZoomOverlay's own doc comment: this can be opened from deep
          inside .spread, which is transformed by the zoom slider's own
          `scale(...)` (see the style prop above) -- rendering the editor
          inline there would inherit that transform and visually shrink
          along with the binder, which portaling out of the component tree
          sidesteps entirely. */}
      {editingSlotIndex !== null &&
        createPortal(
          <div
            className={styles.editorOverlay}
            role="dialog"
            aria-label="Edit custom binder slot image"
          >
            <SlotImageEditor
              initialImage={editingEntry?.type === 'blank' ? editingEntry.customImage ?? null : null}
              onSave={handleSaveCustomImage}
              onCancel={() => setEditingSlotIndex(null)}
            />
          </div>,
          document.body
        )}
      {zoomedCard && (
        <CardZoomOverlay
          card={zoomedCard}
          uploadedImageUri={uploadedImages[zoomedCard.id]}
          onClose={() => setZoomedCard(null)}
        />
      )}
    </>
  );
}
