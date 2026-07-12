// The binder-cover leather palette, shared by BinderShelf (which draws the
// covers) and BinderSettings (which offers the swatches) -- one source of
// truth so the two can never disagree about what's available. Lives outside
// both component files so each stays component-only exports (Vite fast
// refresh requires that).

// The default leather each binder wears until its owner picks a color --
// matches the open binder's own oxblood shell (BinderView.module.css's
// .spread).
export const DEFAULT_COVER_COLOR = '#3a1f16';

export const COVER_COLORS: { name: string; value: string }[] = [
  { name: 'Oxblood', value: '#3a1f16' },
  { name: 'Forest', value: '#1e3325' },
  { name: 'Navy', value: '#1c2740' },
  { name: 'Charcoal', value: '#26242b' },
  { name: 'Ember', value: '#5a1f1a' },
  { name: 'Mulberry', value: '#3b1f33' },
];
