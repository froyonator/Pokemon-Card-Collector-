// Rarity -> holo/foil effect tier and era -> approximate art-window mask,
// for the enlarged-card pointer-reactive foil effect (see
// CardZoomOverlay.tsx and cardEffects.module.css). Kept as one small pure
// module, independent of React, so both the component and its tests can
// call it directly.
//
// ---------------------------------------------------------------------------
// Rarity -> tier mapping (the canonical version -- cardEffects.module.css's
// header comment mirrors this table for readers who only ever open the CSS):
//
//   none    Common and Uncommon -- no foil layer rendered at all. These are
//           the two rarities that never had any holo/foil treatment on the
//           physical card, so CardZoomOverlay skips mounting the effect
//           layer entirely rather than rendering an always-invisible one.
//   sheen   Rare, None/Promo/Classic Collection, and any rarity string not
//           recognized below (including "Unknown") -- a faint ambient sheen
//           only, no holo pattern. This is the safe fallback for anything
//           this table doesn't know about.
//   holo    The classic-holo family: *Holo* (Common Holo, Uncommon Holo,
//           Holo Rare and its V/VMAX/VSTAR suffixes, Rare Holo and its
//           LV.X suffix), Rare PRIME, Rare VMAX, Rare VSTAR, Radiant Rare,
//           the Shiny Rare family, and Double Rare -- the classic holo
//           shine, MASKED to the illustration window (see deriveCardEra /
//           ART_WINDOW below), matching how these prints only foil the art
//           itself, not the full card face.
//   ultra   The Full Art-adjacent tiers: Hyper Rare, Illustration Rare,
//           Special Illustration Rare, Mega Hyper Rare, Secret Rare, Ultra
//           Rare (and the "Ultra-Rare Rare" data quirk), Shiny Ultra Rare --
//           full-surface foil + rainbow sheen, the strongest tier, since
//           these prints' foil pattern runs edge to edge.
//
// Reverse-holo prints (foil everywhere EXCEPT the art window) exist in the
// physical TCG, but nothing in our data can currently identify one:
// CardRecord (src/types/index.ts) has no variant/finish field, and none of
// the rarity strings actually present in public/data/cards/*.json say
// "reverse" (checked across every language database). FoilMaskShape below
// keeps an 'inverse-window' case ready for the day a pipeline change adds
// that signal, but getFoilMaskSpec never produces it yet -- see its own
// comment.
// ---------------------------------------------------------------------------

export type FoilTier = 'none' | 'sheen' | 'holo' | 'ultra';

// The two rarities that never carry any foil treatment on the physical
// card -- everything else not in HOLO_RARITIES/ULTRA_RARITIES below still
// gets the faint 'sheen' fallback (see the mapping table above).
const NO_FOIL_RARITIES = new Set(['common', 'uncommon']);

const HOLO_RARITIES = new Set([
  'common holo',
  'uncommon holo',
  'holo rare',
  'holo rare v',
  'holo rare vmax',
  'holo rare vstar',
  'rare holo',
  'rare holo lv.x',
  'rare prime',
  'rare vmax',
  'rare vstar',
  'radiant rare',
  'shiny rare',
  'shiny rare v',
  'shiny rare vmax',
  'double rare',
]);

const ULTRA_RARITIES = new Set([
  'hyper rare',
  'illustration rare',
  'special illustration rare',
  'mega hyper rare',
  'secret rare',
  'shiny ultra rare',
  'ultra rare',
  'ultra-rare rare',
]);

// Rarity strings in the wild data have inconsistent casing (e.g. "Double
// Rare" vs "Double rare") -- comparisons here always normalize to lowercase
// so both spellings land in the same tier.
export function getFoilTier(rarity: string): FoilTier {
  const normalized = rarity.trim().toLowerCase();
  if (ULTRA_RARITIES.has(normalized)) return 'ultra';
  if (HOLO_RARITIES.has(normalized)) return 'holo';
  if (NO_FOIL_RARITIES.has(normalized)) return 'none';
  return 'sheen';
}

// ---------------------------------------------------------------------------
// Era derivation, for sizing the classic-holo tier's illustration-window
// mask. This is a GEOMETRIC APPROXIMATION, not a measured per-card mask: the
// art window's position/proportions are grouped into three rough frame-era
// buckets (rather than one rect per set) because card-frame geometry is
// similar within each bucket. The rects below were sanity-checked against
// representative hosted scans (one classic-era card measured directly via
// an in-browser pixel-variance scan; the others are standard, widely-known
// TCG frame proportions for their era) -- they are deliberately NOT exact.
//
// This function is the seam a future pipeline job can replace: swap
// deriveCardEra + ART_WINDOW for a lookup into real per-card measured masks
// (keyed by card id) without touching getFoilMaskSpec's callers or the
// effect layers in cardEffects.module.css at all -- both already just
// consume whatever FoilMaskSpec they're handed.
// ---------------------------------------------------------------------------

export type CardEra = 'classic' | 'transitional' | 'modern';

// Vintage: WotC (Base/Jungle/Fossil/Gym), Neo, e-Card, and the EX series --
// roughly 1999-2007. Thin border, art window ends well above the card's
// midpoint (attack text below takes up nearly half the card).
const CLASSIC_PREFIXES = ['base', 'gym', 'neo', 'ecard', 'si1', 'pop2', 'pop3', 'pop4', 'pop5', 'pop6'];
const CLASSIC_EX = /^ex\d/;

// Diamond & Pearl / Platinum, HeartGold & SoulSilver, Black & White, XY --
// roughly 2007-2016. Slightly larger art window than the vintage bucket.
const TRANSITIONAL_PREFIXES = ['dp', 'pl', 'hgss', 'bw', 'xy'];

// Sun & Moon, Sword & Shield, Scarlet & Violet -- 2017 onward. Thinnest
// borders, largest art window of the three buckets. Also the default for
// any set id this function doesn't recognize, since an unrecognized id is
// most likely to be a newer set added after this table was last updated.
const MODERN_PREFIXES = ['sm', 'swsh', 'sv'];

// McDonald's-collection-style ids embed the era as a literal suffix, e.g.
// "2014xy", "2017sm", "2021swsh", "2023sv".
const DATED_ERA_SUFFIX = /^20\d{2}(xy|sm|swsh|sv)$/;

// Theme-deck ids embed the era as a short token, e.g. "tk-dp-l", "tk-hs-g"
// (HeartGold/SoulSilver's own "hs" shorthand), "tk-xy-n", "tk-sm-r",
// "tk-ex-m".
const THEME_DECK = /^tk-([a-z]+)-/;

function eraForToken(token: string): CardEra | null {
  // Theme-deck ids carry these two era tokens bare (no trailing set number)
  // -- "tk-hs-g" for a HeartGold/SoulSilver deck, "tk-ex-m" for an EX-series
  // deck -- so both need an exact-match check alongside the prefix/regex
  // matches below, which are shaped for real set ids like "hgss1"/"ex1".
  if (token === 'hs') return 'transitional';
  if (token === 'ex') return 'classic';
  if (CLASSIC_PREFIXES.some((prefix) => token.startsWith(prefix)) || CLASSIC_EX.test(token)) {
    return 'classic';
  }
  if (TRANSITIONAL_PREFIXES.some((prefix) => token.startsWith(prefix))) return 'transitional';
  if (MODERN_PREFIXES.some((prefix) => token.startsWith(prefix))) return 'modern';
  return null;
}

export function deriveCardEra(setId: string): CardEra {
  const id = setId.trim().toLowerCase();

  const dated = id.match(DATED_ERA_SUFFIX);
  if (dated) return eraForToken(dated[1]) ?? 'modern';

  const themeDeck = id.match(THEME_DECK);
  if (themeDeck) return eraForToken(themeDeck[1]) ?? 'modern';

  return eraForToken(id) ?? 'modern';
}

export interface FoilInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Percentages for a CSS `inset()` clip-path: how far in from each edge the
// illustration window sits. Bottom is the largest number in every bucket
// because the window ends well above the card's own bottom edge (attack
// text, weakness/resistance, and the footer all sit below it).
const ART_WINDOW: Record<CardEra, FoilInset> = {
  classic: { top: 10, right: 6, bottom: 42, left: 6 },
  transitional: { top: 9, right: 5, bottom: 40, left: 5 },
  modern: { top: 8, right: 4, bottom: 38, left: 4 },
};

export type FoilMaskShape = 'full' | 'window' | 'inverse-window';

export interface FoilMaskSpec {
  shape: FoilMaskShape;
  // Only meaningful when shape is 'window' or 'inverse-window'.
  inset?: FoilInset;
}

// tier -> mask shape: 'holo' is the only tier that masks today (see the
// module doc comment above for why 'inverse-window' is never returned yet).
// 'sheen' and 'ultra' both cover the full card -- 'sheen' because its
// effect is faint enough that a mask would be imperceptible, 'ultra'
// because those prints' real foil pattern genuinely runs edge to edge.
export function getFoilMaskSpec(tier: FoilTier, era: CardEra): FoilMaskSpec {
  if (tier === 'holo') return { shape: 'window', inset: ART_WINDOW[era] };
  return { shape: 'full' };
}

export interface CardFoilEffect {
  tier: FoilTier;
  mask: FoilMaskSpec;
}

// The single entry point CardZoomOverlay actually calls: rarity + setId in,
// a complete effect spec out.
export function getCardFoilEffect(rarity: string, setId: string): CardFoilEffect {
  const tier = getFoilTier(rarity);
  const era = deriveCardEra(setId);
  return { tier, mask: getFoilMaskSpec(tier, era) };
}
