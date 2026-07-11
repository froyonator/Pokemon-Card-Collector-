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
