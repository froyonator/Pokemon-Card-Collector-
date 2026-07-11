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

// A ring binder, used as the Binder view's icon in Sidebar's view toggle --
// unlike the Sprite/Card view icons (real Pikachu artwork, resolved in
// Sidebar.tsx), there's no equivalent "real" binder asset already in the
// app to reuse, so this one is drawn from scratch.
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
