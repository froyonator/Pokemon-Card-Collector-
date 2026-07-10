// TCGdex tags every promo card with the single generic rarity string
// "Promo", regardless of whether it's a plain reprint or a genuine
// full-bleed illustration card. There is no reliable, machine-checkable
// signal (rarity string, card stage, name pattern) that predicts which is
// which, confirmed by directly comparing a rule-box VMAX promo against
// svp-044 (an ordinary Basic-stage Charmander promo that turned out, on
// visual inspection, to be genuinely full art) during the investigation
// that added this file. Card stage and name pattern both failed to predict
// it. So this list is a hand-verified, growing set of specific card ids
// mapped directly to a rarity group id, checked by actually looking at the
// artwork, not derived from any field TCGdex exposes.
//
// This is a starting point, not an attempt at completeness: the promo
// catalog spans decades and hundreds of cards across just Gen 1, let alone
// every generation this app may eventually cover. Add to this list as more
// cards are verified, or classify a card per-user from the picker's own
// "Classify as" control (Task 6 in this plan), which writes to the same
// kind of card id -> group id mapping in the user's own persisted state and
// takes precedence over this file's defaults.
export const DEFAULT_CARD_OVERRIDES: Record<string, string> = {
  // Charmander, SVP Black Star Promos #044 (Obsidian Flames ETB promo).
  // Verified full-bleed illustration: Charmander in a window scene with
  // flowers and a bird, artwork extending to the card's edges, not confined
  // to a framed artwork window. Ordinary Basic-stage Pokemon, no V/VMAX/
  // VSTAR/ex/GX suffix, which is exactly why a stage- or name-based
  // heuristic would have missed it.
  'svp-044': 'full-art',
};
