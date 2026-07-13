// Minimal line-art icons for the Sidebar's tab nav and view toggle, so those
// controls can be single-line icon buttons instead of full-width text
// buttons. Deliberately hand-drawn inline SVG (no icon library dependency)
// to match this codebase's existing "hand-rolled, no component libraries"
// convention, and sized/stroked with currentColor so each icon inherits its
// button's text color for free across light/dark mode and the pressed state.

export function DexGridIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function CollectionIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4" y="2.5" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 6h7M6.5 9.5h7M6.5 13h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function WishlistIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M10 3.4l1.98 4.14 4.52.62-3.28 3.24.8 4.6L10 13.8l-4.02 2.2.8-4.6-3.28-3.24 4.52-.62L10 3.4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SummaryIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M3.5 16.5v-6M9 16.5v-10M14.5 16.5v-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M2.5 16.5h15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Poke Ball outline for the Sprite view toggle. The view toggle previously
// used real Pikachu artwork (a sprite and a cached card image) as its own
// icons; charming in isolation, but the mixed art styles read as clutter
// next to the line-drawn icons everywhere else (reported directly), so all
// three view icons are now drawn from the same hand as the tab icons.
export function SpriteViewIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.75 10h5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.25 10h5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// A trading card (portrait rounded rect with an art window) for the Card
// view toggle -- same line family as SpriteViewIcon above.
export function CardViewIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="5" y="2.5" width="10" height="15" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7.2" y="5" width="5.6" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.2 12.5h5.6M7.2 14.8h3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// A ring binder, used as the Binder view's icon in Sidebar's view toggle.
export function BinderIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="4" y="2.5" width="13" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 2.5v15" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="1.6" cy="6" r="1.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="1.6" cy="10" r="1.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="1.6" cy="14" r="1.1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// Down-into-tray arrow for "Export my collection" -- drawn to match the
// stroke weight/size conventions of the other icons in this file, so the
// corner dock's buttons read as one family.
export function ExportIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 13.5v2A1.5 1.5 0 005 17h10a1.5 1.5 0 001.5-1.5v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Up-out-of-tray arrow for "Import a backup" -- the mirror of ExportIcon.
export function ImportIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M10 12V3M6.5 6.5L10 3l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 13.5v2A1.5 1.5 0 005 17h10a1.5 1.5 0 001.5-1.5v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Trash-can icon for the shelf's per-binder delete affordance -- same line
// family/stroke weight as the rest of this file.
export function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M4 6h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M8 6V4.5a1 1 0 011-1h2a1 1 0 011 1V6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6l.6 9.4a1.5 1.5 0 001.5 1.4h4.8a1.5 1.5 0 001.5-1.4L14.5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.3 8.8l.3 5M11.7 8.8l-.3 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Hand-drawn magnifying-glass icon shared by every "Enlarge" control that
// opens CardZoomOverlay for a closer look at a card -- Picker's per-card
// button and Card-view Tile's owned-card button both reuse this exact
// component rather than each drawing their own copy. Sized/stroked with
// currentColor so it inherits its button's color across light/dark mode.
export function MagnifyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <circle cx="8.3" cy="8.3" r="5.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.4 12.4L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
