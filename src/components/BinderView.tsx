import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { spriteUrl } from '../api/pokeapi';
import {
  computeBinderPages,
  computeSplitRange,
  computeSpreadPageIndices,
  defaultBinderSequence,
  insertBlankAt,
  moveEntry,
  positionToSlotIndex,
  removeEntryAt,
  slotIndexToPosition,
} from '../state/binderLayout';
import { computeSlotSize } from '../state/binderSlotSizing';
import { loadImageDimensions } from '../state/loadImageDimensions';
import { sliceImageForSlots } from '../state/slotImageSplit';
import { useAppStore } from '../state/store';
import { getCachedCards } from '../storage/cardCache';
import type { DexEntry } from '../data/gen1Dex';
import type { SplitRange } from '../state/binderLayout';
import type {
  BinderFillDirection,
  BinderSlotEntry,
  CardRecord,
  CustomSlotImage,
  OwnedRecord,
} from '../types';
import { BinderShelf } from './BinderShelf';
import { BinderSlot } from './BinderSlot';
import { BinderZoomControl, MAX_ZOOM, MIN_ZOOM } from './BinderZoomControl';
import { CardZoomOverlay } from './CardZoomOverlay';
import { SlotImageEditor } from './SlotImageEditor';
import styles from './BinderView.module.css';

// A page hinged at the spine (its inner edge, set via .pageLeft/.pageRight's
// transform-origin in BinderView.module.css) rather than rotating around its
// own center -- matches how a real binder page turns on its rings, not a
// book-corner curl (a paper effect that doesn't fit a rigid binder page,
// How long the turning leaf takes to swing over its spine hinge. The
// physical model (see the flip state + leaf JSX in BinderView below): a
// binder sheet has the outgoing page printed on one face and the incoming
// page on the other, so turning it shows the OLD page lifting away while
// the NEW page's content rides into view on its back -- exactly like
// flipping a real magazine page, and unlike the previous
// one-page-rotates-and-fades approach, which read as a page folding onto
// its neighbor.
const FLIP_MS = 850;
const FLIP_EASE = [0.45, 0.05, 0.2, 1] as const;

// Which page sits in which half of the open binder for a given spread.
// Both halves are always rendered (a missing page shows the inside of the
// binder cover instead): the very first page hangs alone on the RIGHT of
// the rings (everything else is still flipped over to the right, like a
// fresh binder), while a lone FINAL page hangs on the LEFT (every sheet has
// been flipped; only the back cover remains on the right). The previous
// lone-page handling parked every lone page on the right -- physically
// wrong for the final page, and its :only-child CSS positioning silently
// broke (leaving the lone first page floating mid-spread) the moment the
// decorative spine became a sibling of the pages.
function spreadHalves(
  spread: number[],
  spreadIndex: number
): { left: number | undefined; right: number | undefined } {
  if (spread.length === 2) return { left: spread[0], right: spread[1] };
  if (spread.length === 1) {
    return spreadIndex === 0
      ? { left: undefined, right: spread[0] }
      : { left: spread[0], right: undefined };
  }
  return { left: undefined, right: undefined };
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
  // Lets Escape back out of manual arrange mode too, not just zoom mode --
  // this component doesn't own isManualArrangeActive itself (it's lifted to
  // App.tsx, shared with Sidebar/BinderSettings' own toggle button), so
  // exiting it from in here needs an explicit callback rather than local
  // state. Optional since not every caller wires manual arrange up at all.
  onExitManualArrange?: () => void;
  // When true, entering the binder view lands on the shelf of ALL binders
  // (each drawn as a leather volume; see BinderShelf) instead of directly
  // inside the active binder -- the "home" the user pictures for their
  // collection of binders. Defaults to false so existing tests/callers of a
  // bare BinderView keep their direct-to-binder behavior.
  startOnShelf?: boolean;
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
  // Takes the originating click event too (not just the slotIndex) so
  // BinderView's own handleSelectSlot can read Shift off it for the
  // split-image range-selection flow (see BinderSlot's own onSelect prop
  // for the full rationale).
  onSelectSlot: (slotIndex: number, event: React.MouseEvent<HTMLButtonElement>) => void;
  onDragStartSlot: (slotIndex: number) => void;
  onDropSlot: (slotIndex: number) => void;
  // Only relevant for a `blank` entry, and only outside manual-arrange mode
  // -- see BinderSlot's own onEditCustomImage prop for the full rationale.
  onEditSlot: (slotIndex: number) => void;
  // Only relevant for an OWNED pokemon entry -- see BinderSlot's own
  // onEnlarge prop for the full rationale.
  onEnlargeSlot: (card: CardRecord) => void;
  // Which half of the open binder this page sits in -- drives the
  // spine-side styling (punched holes, gutter shading, asymmetric padding;
  // see .pageLeft/.pageRight in BinderView.module.css).
  side: 'left' | 'right';
  // True for the copies rendered on the turning leaf's two faces: purely
  // visual duplicates of real pages, so they carry no accessible name (the
  // real page under/after the leaf owns "Page N") and no pointer events
  // (see .leaf in BinderView.module.css). Without this, mid-flip the same
  // page would exist twice for assistive tech and test queries alike.
  decorative?: boolean;
}

// Sets `node` on every ref in `refs`, function or object alike. BinderPage's
// root node currently only has its own usePageSize() measurement ref, but
// the component stays a forwardRef (below) so an outside caller CAN attach
// one -- this helper is what lets both coexist whenever that happens.
function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

// Wrapped in React.memo (memo can wrap a forwardRef result) for the
// same reason as Tile.tsx/BinderSlot.tsx's own memo wrappers -- a page full
// of BinderSlots shouldn't re-render just because some BinderView state
// unrelated to this page's own content changed (e.g. the zoom slider, or a
// selection on the OTHER page of a spread). This only helps as long as
// BinderView also hands this component referentially-stable props -- see
// BinderView's own onSlotClick/onSelectSlot/onDropSlot below for the other
// half (the two Maps, nameByDexNumber and ownedCardByDexNumber /
// uploadedImageUriByDexNumber, were already correctly useMemo'd).
const BinderPage = memo(forwardRef<HTMLDivElement, BinderPageProps>(function BinderPage(
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
    decorative = false,
  },
  forwardedRef
) {
  const [measureRef, size] = usePageSize();
  const slotSize = computeSlotSize({
    containerWidth: size.width - PAGE_PADDING_PX,
    containerHeight: size.height - PAGE_PADDING_PX,
    rows,
    columns,
    gap: GAP_PX,
  });

  return (
    <div
      ref={mergeRefs(measureRef, forwardedRef)}
      className={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight].join(' ')}
      aria-label={decorative ? undefined : `Page ${pageIndex + 1}`}
      aria-hidden={decorative || undefined}
      style={{
        gridTemplateColumns: `repeat(${columns}, ${slotSize.width}px)`,
        gridTemplateRows: `repeat(${rows}, ${slotSize.height}px)`,
      }}
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
              ownedCardHostedFullUrl={ownedCard?.hostedFullUrl}
              uploadedImageUri={
                entry?.type === 'pokemon' ? uploadedImageUriByDexNumber.get(entry.dexNumber) : undefined
              }
              onClick={onSlotClick}
              isManualArrangeActive={isManualArrangeActive}
              isSelected={selectedIndex === slotIndex}
              onSelect={(event) => onSelectSlot(slotIndex, event)}
              onDragStart={() => onDragStartSlot(slotIndex)}
              onDrop={() => onDropSlot(slotIndex)}
              onEditCustomImage={entry?.type === 'blank' ? () => onEditSlot(slotIndex) : undefined}
              onEnlarge={ownedCard ? () => onEnlargeSlot(ownedCard) : undefined}
            />
          );
        })
      )}
    </div>
  );
}));

// The state a turning leaf needs: which way it swings, which page is
// printed on each of its two faces, and what the spread looked like BEFORE
// the turn. Faces are always real pages -- the flipped sheet always
// carries the outgoing page on its front and the incoming page on its
// back, whichever direction it turns. fromLeft/fromRight exist because the
// half the leaf is about to LAND ON must keep showing the outgoing page
// until the leaf covers it: swapping both halves to the destination the
// instant navigation starts made the covered side visibly "turn into
// itself" with a jarring content pop (reported live), since its new
// content appeared long before the leaf arrived.
interface FlipState {
  direction: 'forward' | 'backward';
  frontPage: number;
  backPage: number;
  fromLeft: number | undefined;
  fromRight: number | undefined;
}

export function BinderView({
  dexEntries,
  owned,
  dataVersion,
  onSlotClick,
  isManualArrangeActive = false,
  onExitManualArrange,
  startOnShelf = false,
}: BinderViewProps) {
  const binders = useAppStore((s) => s.binders);
  const activeBinderId = useAppStore((s) => s.activeBinderId);
  const setActiveBinder = useAppStore((s) => s.setActiveBinder);
  const createBinder = useAppStore((s) => s.createBinder);
  const setBinderCustomOrder = useAppStore((s) => s.setBinderCustomOrder);
  const setBinderSlotCustomImage = useAppStore((s) => s.setBinderSlotCustomImage);
  const uploadedImages = useAppStore((s) => s.uploadedImages);
  const activeBinder = binders.find((b) => b.id === activeBinderId) ?? binders[0];
  // Whether the shelf (the library of every binder) is what's on screen,
  // rather than the one open binder. Local state, not persisted: "which
  // room am I standing in" is session ephemera, not collection data.
  const [isShelfOpen, setIsShelfOpen] = useState(startOnShelf);
  const [spreadIndex, setSpreadIndex] = useState(0);
  // The turning leaf currently in flight, or null when the binder is at
  // rest. spreadIndex itself always advances IMMEDIATELY on navigation --
  // the settled halves under the leaf are the destination spread from the
  // first frame (matching how magazine-flip effects work: the leaf's back
  // face lands exactly on top of identical, already-rendered content), so
  // nothing about the app's real state ever waits on an animation.
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // The most recently plainly-clicked slot -- a fresh anchor for a possible
  // FUTURE shift-click, kept separate from selectedIndex so an invalid
  // shift-click attempt (see handleSelectSlot below) can leave both alone
  // instead of silently anchoring onto whatever was last shift-clicked.
  const [rangeAnchorIndex, setRangeAnchorIndex] = useState<number | null>(null);
  // The resolved, currently-valid rectangular block of blank slots a
  // shift-click has selected for the split-image feature, or null when
  // there isn't one (no shift-click yet, or the last one was rejected).
  const [splitRange, setSplitRange] = useState<SplitRange | null>(null);
  // Briefly shown near the nav bar when a shift-click attempt is rejected
  // (crosses the spine, spans two pages, or touches a non-blank slot) --
  // cleared on the very next slot click, whether that click succeeds or
  // not, same as ExportImportControls' own inline error message pattern.
  const [rangeRejectionMessage, setRangeRejectionMessage] = useState<string | null>(null);
  // Whether the split-image editor overlay (for the currently-resolved
  // splitRange) is open -- kept separate from splitRange itself so the
  // overlay only opens on an explicit "Split image across N slots" click,
  // not the instant a valid range is shift-clicked.
  const [isSplitEditorOpen, setIsSplitEditorOpen] = useState(false);
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

  // Keyboard: 'g' enters zoom mode, Escape exits it -- AND, confirmed live
  // as a real dead end otherwise, exits manual arrange mode too. Manual
  // arrange has no other keyboard escape hatch: clicking a slot while it's
  // active only selects it for reordering (never re-opens the Picker), so
  // without this, the only way out was noticing that the SAME "Manual
  // arrange" button in Binder Settings also toggles it back off -- not
  // obvious, since nothing about that button's label hints that clicking it
  // again is how you leave. Attached to `window` rather than a specific
  // element since the user can press 'g'/Escape with focus anywhere on the
  // page, not just while a binder element itself has focus.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'g' || event.key === 'G') {
        setIsZoomModeActive(true);
      } else if (event.key === 'Escape') {
        setIsZoomModeActive(false);
        // Escape is the universal "get me out": it also resets the zoom
        // LEVEL, not just zoom mode. Before this, a runaway zoom (slider
        // dragged to max) left the binder blown up with no keyboard rescue
        // -- Escape only exited the mode, and the zoom slider itself could
        // sit under the scaled content (reported live as "can't do
        // anything or see anything").
        setZoom(1);
        if (isManualArrangeActive) {
          onExitManualArrange?.();
          setSelectedIndex(null);
          setDragFromIndex(null);
          setRangeAnchorIndex(null);
          setSplitRange(null);
          setRangeRejectionMessage(null);
          setIsSplitEditorOpen(false);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isManualArrangeActive, onExitManualArrange]);

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

  // Manual arrange can turn off through more than one path -- Escape (which
  // already clears this same state inline, see the keydown handler above),
  // but also Binder Settings' own "Done arranging" button, which calls
  // onToggleManualArrange directly and has no idea any of this
  // BinderView-local state even exists. Without this effect, a selection
  // (and its sticky highlight), a pending split range, or -- worst of all --
  // a still-open SlotImageEditor overlay (editingSlotIndex !== null) would
  // all silently survive past the moment arrange mode nominally ended, since
  // the editor overlay's own render condition below never checks
  // isManualArrangeActive at all. Keyed only on isManualArrangeActive so it
  // runs exactly once per on->off transition (and harmlessly on mount, when
  // everything's already null/false).
  useEffect(() => {
    if (isManualArrangeActive) return;
    setSelectedIndex(null);
    setRangeAnchorIndex(null);
    setSplitRange(null);
    setRangeRejectionMessage(null);
    setDragFromIndex(null);
    setEditingSlotIndex(null);
    setIsSplitEditorOpen(false);
  }, [isManualArrangeActive]);

  useEffect(() => {
    setSpreadIndex(0);
    setFlip(null);
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
    setRangeAnchorIndex(null);
    setSplitRange(null);
    setRangeRejectionMessage(null);
    setIsSplitEditorOpen(false);
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

  const spreads = useMemo(
    () => computeSpreadPageIndices(activeBinder.config.pageCount),
    [activeBinder.config.pageCount]
  );
  const currentSpread = spreads[spreadIndex] ?? [];
  const currentHalves = spreadHalves(currentSpread, spreadIndex);
  const shouldReduceMotion = useReducedMotion();

  // Single entry point for every way of moving between spreads. Adjacent
  // moves from the arrow buttons animate a leaf turn; the scrubber and the
  // quick-jump selector (and any multi-spread hop) land instantly -- a real
  // binder flip only ever turns one sheet, and animating a 7-spread jump
  // sheet-by-sheet would just be latency.
  function navigateToSpread(to: number, animate: boolean) {
    if (to < 0 || to >= spreads.length || to === spreadIndex) return;
    // A selection (or pending range) is a position on the page(s) just left
    // behind -- without this, the nav bar's "Keep empty"/etc. buttons kept
    // referencing the OLD page's selectedIndex after the new page was
    // already on screen, silently acting on the wrong slot if clicked.
    setSelectedIndex(null);
    setRangeAnchorIndex(null);
    setSplitRange(null);
    setRangeRejectionMessage(null);
    setDragFromIndex(null);

    const from = spreadIndex;
    setSpreadIndex(to);

    const isAdjacent = Math.abs(to - from) === 1;
    if (!animate || !isAdjacent || shouldReduceMotion) {
      setFlip(null);
      return;
    }
    const fromHalves = spreadHalves(spreads[from] ?? [], from);
    const toHalves = spreadHalves(spreads[to] ?? [], to);
    if (to > from) {
      // Forward: the sheet on the right lifts and swings left over the
      // rings. Its front face carries the outgoing right page; its back
      // face carries the incoming left page, landing on the half that
      // keeps showing the OUTGOING left page (fromLeft) until covered.
      if (fromHalves.right === undefined || toHalves.left === undefined) return;
      setFlip({
        direction: 'forward',
        frontPage: fromHalves.right,
        backPage: toHalves.left,
        fromLeft: fromHalves.left,
        fromRight: fromHalves.right,
      });
    } else {
      // Backward: the mirror image -- the left sheet swings right.
      if (fromHalves.left === undefined || toHalves.right === undefined) return;
      setFlip({
        direction: 'backward',
        frontPage: fromHalves.left,
        backPage: toHalves.right,
        fromLeft: fromHalves.left,
        fromRight: fromHalves.right,
      });
    }
  }

  // Deterministic cleanup for the leaf even if Framer Motion's
  // onAnimationComplete never fires (e.g. a throttled background tab, or a
  // test environment with no real animation frames) -- finalizing twice is
  // a harmless no-op either way.
  useEffect(() => {
    if (!flip) return;
    const timer = window.setTimeout(() => setFlip(null), FLIP_MS + 200);
    return () => window.clearTimeout(timer);
  }, [flip]);

  // Resolves a given pageIndex's OWN side/pairing info within the CURRENTLY
  // displayed spread -- exactly mirroring the `side` computation the JSX
  // below already does for each rendered BinderPage, just runnable from a
  // slot-click handler that only knows a flat slotIndex (not which literal
  // DOM side it renders on). Needed by computeSplitRange to know which
  // column, if any, is this page's spine-adjacent one. Returns side: null
  // when pageIndex isn't part of the current spread at all (shouldn't
  // normally happen for a slot that was just clicked, but keeps this total
  // rather than throwing).
  function resolvePagePairing(pageIndex: number): {
    side: 'left' | 'right' | null;
    hasLeftNeighbor: boolean;
    hasRightNeighbor: boolean;
  } {
    const i = currentSpread.indexOf(pageIndex);
    if (i === -1) return { side: null, hasLeftNeighbor: false, hasRightNeighbor: false };
    const side: 'left' | 'right' = currentHalves.left === pageIndex ? 'left' : 'right';
    return {
      side,
      hasLeftNeighbor: side === 'right' && currentSpread.length === 2,
      hasRightNeighbor: side === 'left' && currentSpread.length === 2,
    };
  }

  // Every (row, col) position within a resolved range must currently be a
  // real blank entry -- reusing setBinderSlotCustomImage's own requirement
  // (it silently no-ops on anything else, see store.ts) rather than a
  // separate, looser notion of "blank". A pokemon entry in the range, or an
  // out-of-capacity position past the end of `sequence`, both fail this.
  function isRangeAllBlank(range: SplitRange): boolean {
    for (let row = range.rowStart; row <= range.rowEnd; row++) {
      for (let col = range.colStart; col <= range.colEnd; col++) {
        const slotIndex = positionToSlotIndex(range.pageIndex, row, col, activeBinder.config);
        if (sequence[slotIndex]?.type !== 'blank') return false;
      }
    }
    return true;
  }

  // A plain click always starts a fresh single-slot selection AND becomes
  // the new anchor for a possible future shift-click -- a shift-click, if
  // there IS an anchor already, instead tries to resolve a rectangular
  // range between that anchor and this slot. An INVALID range (crosses the
  // spine, spans two pages, or touches a non-blank slot) clears any
  // previously-resolved splitRange and surfaces a rejection message, but
  // deliberately leaves selectedIndex/rangeAnchorIndex untouched -- so it
  // doesn't silently select something nonsensical in their place.
  //
  // Wrapped in useCallback (rather than a plain function declaration) so
  // this keeps the same identity across BinderView renders that don't
  // change any of its actual inputs -- it's passed straight through to
  // BinderPage as onSelectSlot, and BinderPage is now memoized (see its own
  // comment) specifically so a page's slots don't all re-render for
  // BinderView-local changes unrelated to that page's content (e.g. the
  // zoom slider). A fresh function identity here on every render would
  // defeat that regardless of the memo wrapper.
  const handleSelectSlot = useCallback(
    (slotIndex: number, event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && rangeAnchorIndex !== null) {
        const { pageIndex } = slotIndexToPosition(slotIndex, activeBinder.config);
        const { side, hasLeftNeighbor, hasRightNeighbor } = resolvePagePairing(pageIndex);
        const range = computeSplitRange(
          rangeAnchorIndex,
          slotIndex,
          activeBinder.config,
          side,
          hasLeftNeighbor,
          hasRightNeighbor
        );
        if (range && isRangeAllBlank(range)) {
          setSplitRange(range);
          setRangeRejectionMessage(null);
        } else {
          setSplitRange(null);
          setRangeRejectionMessage(
            'That range crosses the spine or an existing card. Pick two blank slots on the same page, avoiding the spine-adjacent column.'
          );
        }
        return;
      }
      setSelectedIndex(slotIndex);
      setRangeAnchorIndex(slotIndex);
      setSplitRange(null);
      setRangeRejectionMessage(null);
    },
    // resolvePagePairing/isRangeAllBlank are plain functions redefined on
    // every render (not memoized themselves), so they're deliberately left
    // out here -- listing them would make this recompute every render
    // regardless, defeating the point. Both are pure reads of
    // currentSpread/sequence/activeBinder.config, which ARE listed below,
    // so this still recomputes exactly when what they'd actually return
    // could change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeAnchorIndex, activeBinder.config, currentSpread, sequence]
  );

  // Slices the uploaded aggregate image across every slot in the current
  // splitRange and persists each slot's own piece -- the split-image
  // feature's actual save step. Needs the source image's real pixel
  // dimensions first (sliceImageForSlots is pure and takes them as plain
  // numbers), which means loading it, hence async; see
  // loadImageDimensions's own doc comment for why that's a separate,
  // easily-mocked module rather than inlined here.
  async function handleSaveSplitImage(
    aggregate: { offsetX: number; offsetY: number; zoom: number },
    dataUri: string
  ) {
    if (!splitRange) return;
    const { width, height } = await loadImageDimensions(dataUri);
    const slices = sliceImageForSlots(dataUri, width, height, splitRange.rows, splitRange.cols, aggregate);
    for (let r = 0; r < splitRange.rows; r++) {
      for (let c = 0; c < splitRange.cols; c++) {
        const slotIndex = positionToSlotIndex(
          splitRange.pageIndex,
          splitRange.rowStart + r,
          splitRange.colStart + c,
          activeBinder.config
        );
        setBinderSlotCustomImage(activeBinder.id, slotIndex, slices[r][c]);
      }
    }
    setSplitRange(null);
    setRangeAnchorIndex(null);
    setSelectedIndex(null);
    setIsSplitEditorOpen(false);
  }

  // Manual-arrange edits always operate on `sequence` as it exists RIGHT
  // NOW (whether that's the live default or an already-customized order),
  // and every edit writes the full result back via setBinderCustomOrder --
  // this is what "snapshots the current default sequence on first edit"
  // means in practice: there's no separate snapshot step, the first edit's
  // own write IS the snapshot, and every edit after that reads the
  // already-persisted customOrder as its starting point instead of
  // recomputing the default.
  //
  // Wrapped in useCallback for the same reason as handleSelectSlot just
  // above (passed straight through to the now-memoized BinderPage as
  // onDropSlot).
  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragFromIndex === null || dragFromIndex === toIndex) {
        setDragFromIndex(null);
        return;
      }
      setBinderCustomOrder(activeBinder.id, moveEntry(sequence, dragFromIndex, toIndex));
      setDragFromIndex(null);
    },
    [dragFromIndex, activeBinder.id, sequence, setBinderCustomOrder]
  );

  function handleKeepEmpty() {
    if (selectedIndex === null) return;
    setBinderCustomOrder(activeBinder.id, insertBlankAt(sequence, selectedIndex));
    setSelectedIndex(null);
  }

  // The exact inverse of Keep empty: deletes just this ONE blank slot,
  // shifting the rest back -- previously the only way to undo a single
  // kept-empty slot was "Reset arrangement", which throws away every other
  // manual change (drags, other blanks) too.
  function handleRemoveEmpty() {
    if (selectedIndex === null) return;
    setBinderCustomOrder(activeBinder.id, removeEntryAt(sequence, selectedIndex));
    setSelectedIndex(null);
  }

  // Opens the custom-image editor for the currently-selected blank slot
  // directly from the nav bar, without leaving manual arrange mode first.
  // BinderSlot's own click handling disables editing while manual arrange
  // is active (dragging/selecting takes priority for a raw click on the
  // slot itself), but that restriction was making the editor nearly
  // undiscoverable in practice -- confirmed live: exiting manual arrange,
  // then finding and clicking the slot's own small "+" affordance again, is
  // an easy-to-miss two-step dance. This button is a deliberate, explicit
  // action, not a raw slot click, so it bypasses that restriction on
  // purpose.
  function handleEditSelected() {
    if (selectedIndex === null) return;
    setEditingSlotIndex(selectedIndex);
  }

  // Which nav-bar action(s) make sense for the current selection: Keep
  // empty for a real pokemon entry (turns it into a blank slot), or
  // Edit image/Remove empty slot for a blank entry that already exists (an
  // out-of-capacity slot beyond `sequence`'s own length resolves to
  // `undefined` here, same as before this was added -- it still only gets
  // Keep empty, matching its pre-existing behavior).
  const selectedEntry = selectedIndex !== null ? sequence[selectedIndex] : undefined;

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

  // Wraps the onSlotClick prop (which already resolves to a stable function
  // from the caller's perspective as long as ITS caller passes one) with
  // this binder's own language, and keeps that wrapping itself stable
  // across renders that don't change onSlotClick/activeBinder.language --
  // passed straight through to the now-memoized BinderPage below.
  const handleBinderPageSlotClick = useCallback(
    (dexNumber: number) => onSlotClick(dexNumber, activeBinder.language),
    [onSlotClick, activeBinder.language]
  );

  // Everything a BinderPage needs except its own identity -- shared by the
  // two settled halves and the turning leaf's two decorative faces, so the
  // four usages below can't drift apart.
  const sharedPageProps = {
    rows: activeBinder.config.rows,
    columns: activeBinder.config.columns,
    fillDirection: activeBinder.config.fillDirection,
    nameByDexNumber,
    ownedCardByDexNumber,
    uploadedImageUriByDexNumber,
    onSlotClick: handleBinderPageSlotClick,
    isManualArrangeActive,
    selectedIndex,
    onSelectSlot: handleSelectSlot,
    onDragStartSlot: setDragFromIndex,
    onDropSlot: handleDrop,
    onEditSlot: setEditingSlotIndex,
    onEnlargeSlot: setZoomedCard,
  };

  if (isShelfOpen) {
    return (
      <BinderShelf
        binders={binders}
        onOpenBinder={(id) => {
          setActiveBinder(id);
          setIsShelfOpen(false);
        }}
        onCreateBinder={(name) => {
          // createBinder also makes the new binder active (see store.ts),
          // so closing the shelf lands straight inside it.
          createBinder(name, activeBinder.language);
          setIsShelfOpen(false);
        }}
      />
    );
  }

  // What each half DISPLAYS while a leaf is in flight is NOT the settled
  // (destination) state: the half the leaf will land on keeps showing the
  // OUTGOING page until it's physically covered -- forward keeps the old
  // left page under the incoming leaf, backward keeps the old right page.
  // The revealed half (the one the leaf lifts away from) shows the new page
  // immediately, exposed underneath as the leaf rises. At completion the
  // covered half swaps to the destination page in the same render that
  // unmounts the leaf, whose landed back face is pixel-identical content --
  // so the swap is invisible.
  const displayLeft = flip
    ? flip.direction === 'forward'
      ? flip.fromLeft
      : currentHalves.left
    : currentHalves.left;
  const displayRight = flip
    ? flip.direction === 'forward'
      ? currentHalves.right
      : flip.fromRight
    : currentHalves.right;

  return (
    <>
      <div className={styles.binder}>
        <div ref={spreadRef} className={styles.spread} onWheel={handleWheel}>
          {/* The zoom scale lives on this INNER wrapper, not the shell:
              scaling the shell itself painted the binder over the sidebar,
              nav, and everything else at high zoom (reported live as the
              binder "enlarging to full screen with everything else gone").
              The shell's own overflow scrolls the scaled content instead. */}
          <div
            className={styles.spreadScale}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
          >
            {/* The binder's ring spine: decorative hardware in the center
                channel. Rendered before the halves so it never unmounts
                during a page turn. */}
            <div className={styles.spine} aria-hidden="true">
              <span className={styles.ring} />
              <span className={styles.ring} />
              <span className={styles.ring} />
              <span className={styles.ring} />
            </div>
            {/* Both halves always exist; a half with no page shows the inside
                of the binder cover (spread 1's empty left, or the empty right
                after flipping past a lone final page) -- see spreadHalves and
                displayLeft/displayRight above. */}
            <div className={styles.half}>
              {displayLeft !== undefined ? (
                <BinderPage
                  key={displayLeft}
                  pageIndex={displayLeft}
                  entries={pages[displayLeft] ?? []}
                  side="left"
                  {...sharedPageProps}
                />
              ) : (
                <div className={styles.coverInside} aria-hidden="true" />
              )}
            </div>
            <div className={styles.half}>
              {displayRight !== undefined ? (
                <BinderPage
                  key={displayRight}
                  pageIndex={displayRight}
                  entries={pages[displayRight] ?? []}
                  side="right"
                  {...sharedPageProps}
                />
              ) : (
                <div className={styles.coverInside} aria-hidden="true" />
              )}
            </div>
            {/* The turning leaf: a two-faced sheet hinged at the rings.
                Front face = the page being turned away; back face = the
                incoming page, pre-flipped so it lands showing the right
                content. Wrapped in an overflow-clipping layer because the
                leaf's rotating 3D projection extends past its own box --
                unclipped, that transient overhang toggled the spread's
                scrollbar on and off mid-flip, visibly shoving the pages
                sideways and covering the spine rings (reported live).
                Purely decorative: the real pages above own all interaction
                and accessible names. */}
            {flip && (
              <div className={styles.leafClip} aria-hidden="true">
                <motion.div
                  key={`${flip.frontPage}-${flip.backPage}`}
                  className={[
                    styles.leaf,
                    flip.direction === 'forward' ? styles.leafForward : styles.leafBackward,
                  ].join(' ')}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: flip.direction === 'forward' ? -180 : 180 }}
                  transition={{ duration: FLIP_MS / 1000, ease: FLIP_EASE }}
                  onAnimationComplete={() => setFlip(null)}
                >
                  <div className={styles.leafFace}>
                    <BinderPage
                      pageIndex={flip.frontPage}
                      entries={pages[flip.frontPage] ?? []}
                      side={flip.direction === 'forward' ? 'right' : 'left'}
                      decorative
                      {...sharedPageProps}
                    />
                  </div>
                  <div className={styles.leafFaceBack}>
                    <BinderPage
                      pageIndex={flip.backPage}
                      entries={pages[flip.backPage] ?? []}
                      side={flip.direction === 'forward' ? 'left' : 'right'}
                      decorative
                      {...sharedPageProps}
                    />
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </div>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.shelfReturn}
            aria-label="All binders"
            onClick={() => setIsShelfOpen(true)}
          >
            ‹ All binders
          </button>
          <button
            type="button"
            aria-label="Previous page"
            disabled={spreadIndex === 0}
            onClick={() => navigateToSpread(spreadIndex - 1, true)}
          >
            &larr;
          </button>
          <input
            type="range"
            className={styles.pageScrubber}
            aria-label="Go to spread"
            min={1}
            max={spreads.length}
            step={1}
            value={spreadIndex + 1}
            onChange={(event) => navigateToSpread(Number(event.target.value) - 1, false)}
          />
          <span
            className={styles.pageIndicator}
            aria-label={`Spread ${spreadIndex + 1} of ${spreads.length}`}
          >
            {spreadIndex + 1} / {spreads.length}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={spreadIndex >= spreads.length - 1}
            onClick={() => navigateToSpread(spreadIndex + 1, true)}
          >
            &rarr;
          </button>
          <select
            className={styles.pageJump}
            aria-label="Jump to page"
            value={spreadIndex}
            onChange={(event) => navigateToSpread(Number(event.target.value), false)}
          >
            {spreads.map((spread, i) => (
              <option key={i} value={i}>
                {spread.length === 2
                  ? `Pages ${spread[0] + 1}–${spread[1] + 1}`
                  : `Page ${spread[0] + 1}`}
              </option>
            ))}
          </select>
          {/* A valid shift-click range takes over the nav bar entirely --
              offering the split action INSTEAD OF (not alongside) the
              single-slot Keep empty/Edit image/Remove empty slot buttons
              below, which all stay gated on splitRange === null. */}
          {isManualArrangeActive && splitRange !== null && (
            <button type="button" onClick={() => setIsSplitEditorOpen(true)}>
              Split image across {splitRange.rows * splitRange.cols} slots
            </button>
          )}
          {isManualArrangeActive &&
            splitRange === null &&
            selectedIndex !== null &&
            selectedEntry?.type !== 'blank' && (
              <button type="button" onClick={handleKeepEmpty}>
                Keep empty
              </button>
            )}
          {isManualArrangeActive &&
            splitRange === null &&
            selectedIndex !== null &&
            selectedEntry?.type === 'blank' && (
              <>
                <button type="button" onClick={handleEditSelected}>
                  Edit image
                </button>
                <button type="button" onClick={handleRemoveEmpty}>
                  Remove empty slot
                </button>
              </>
            )}
          {isManualArrangeActive && rangeRejectionMessage && <p role="alert">{rangeRejectionMessage}</p>}
          <BinderZoomControl zoom={zoom} onZoomChange={setZoom} isZoomModeActive={isZoomModeActive} />
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
      {/* Same portal-to-document.body pattern as the single-slot editor
          overlay just above, for the exact same reason (see that block's
          own comment) -- guarded on splitRange too, not just
          isSplitEditorOpen, so this can never render with a stale/cleared
          range (e.g. right after Save resets both in the same tick). */}
      {isSplitEditorOpen &&
        splitRange &&
        createPortal(
          <div
            className={styles.editorOverlay}
            role="dialog"
            aria-label="Split image across binder slots"
          >
            <SlotImageEditor
              initialImage={null}
              frameWidthUnits={splitRange.cols * 5}
              frameHeightUnits={splitRange.rows * 7}
              onSave={(image) =>
                handleSaveSplitImage(
                  { offsetX: image.offsetX, offsetY: image.offsetY, zoom: image.zoom },
                  image.dataUri
                )
              }
              onCancel={() => setIsSplitEditorOpen(false)}
            />
          </div>,
          document.body
        )}
      {/* AnimatePresence gives CardZoomOverlay's own exit prop (the reverse
          spin-and-shrink close) somewhere to actually play: without it,
          React would rip the overlay out of the tree the instant
          zoomedCard goes back to null, same as any other conditional
          render. */}
      <AnimatePresence>
        {zoomedCard && (
          <CardZoomOverlay
            key={zoomedCard.id}
            card={zoomedCard}
            uploadedImageUri={uploadedImages[zoomedCard.id]}
            onClose={() => setZoomedCard(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
