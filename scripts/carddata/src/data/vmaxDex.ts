// scripts/carddata/src/data/vmaxDex.ts
//
// Canonical, ordered list of every VMAX-relevant species. Per the product
// decision behind this module, the only two Pokemon "forms" this app
// tracks are Mega Evolution (see megaDex.ts) and Dynamax/Gigantamax -- and
// the TCG's own expression of Dynamax/Gigantamax is the VMAX card. This
// roster is the union of two independent, authoritative inputs:
//
//   1. Every species with an official Gigantamax form, from the reference
//      wiki's own "Gigantamax" article (fetched once via
//      src/harvest/wikiApiClient.ts, see fetchGigantamaxArticle.ts and
//      data/gigantamax-article.wikitext.txt, gitignored): 32 species, 33
//      forms once Urshifu's two Styles (Single Strike / Rapid Strike) are
//      each counted separately -- matching the article's own stated "32
//      species... 33 different known Gigantamax forms" -- these get
//      `hasGigantamax: true`.
//   2. Every species with an actual VMAX card anywhere in this app's own
//      card databases (public/data/cards/**/*.json), including
//      plain-Dynamax species that never got an official Gigantamax form
//      (e.g. the Eeveelution VMAXes, Rayquaza VMAX) -- these get
//      `hasGigantamax: false`.
//
// The union is 81 entries: 33 Gigantamax forms + 48 plain-Dynamax forms
// (47 species, plus Calyrex's Ice Rider/Shadow Rider counted separately,
// mirroring how Urshifu's two Styles are counted on the Gigantamax side).
// One entry -- Appletun (dex 842) -- has a real, wiki-documented Gigantamax
// form (paired with Flapple in both the source article's own table row and
// the TCG's own release wave) but was never printed as a VMAX card in any
// language's database; it's still included per this module's design
// (a Gigantamax form is a Gigantamax form whether or not the TCG ever
// printed it), with `hasGigantamax: true` and zero real card matches. See
// data/vmax-audit.md for the full derivation, evidence, and per-language
// card counts.
//
// `slug` for a Gigantamax entry matches pokeapi.co's own gmax variety
// naming (e.g. "charizard-gmax") and doubles as the filename stem for
// public/sprites/gmax/{static,animated}/<slug>.{png,gif|webp} -- see
// downloadGmaxSprites.ts. A plain-Dynamax entry's slug ("<species>-dynamax")
// is never looked up against any sprite host; the app falls back to that
// species' own base sprite for those entries by design.
//
// `order` is first VMAX-card release order, derived from the local bulk
// export clone's own Set.releaseDate field (see deriveVmaxOrder.ts, which
// resolves each English VMAX card's setId to its set's release date --
// zero live network calls, the same offline technique
// bulkExportGen1Backfill.ts/bulkExportIngest.ts use for set metadata),
// National Dex number as the tiebreaker within a release wave. Appletun is
// placed immediately after Flapple (same release wave, no card of its own
// to date from). Within a tied release wave, Urshifu's two Styles and
// Calyrex's two Rider forms keep the source article's/games' own
// Single-Strike-before-Rapid-Strike and Ice-before-Shadow ordering.
export interface VmaxForm {
  slug: string;
  baseDex: number;
  /** Species name as used on the card, no "VMAX" suffix (e.g. "Urshifu (Single Strike Style)"). */
  speciesLabel: string;
  /** Full display name: "Gigantamax <Species>" when hasGigantamax, else "Dynamax <Species>". */
  displayName: string;
  order: number;
  hasGigantamax: boolean;
}

// Each row: [slug, baseDex, speciesLabel, hasGigantamax]. Grouped by the
// English TCG set that first printed a VMAX card for that species (see the
// header comment) -- SWSH Black Star Promos actually predates Sword &
// Shield's own base-set release, matching the real card-release history
// (several VMAX promos were distributed alongside Pokemon's Nov 2019
// Sword & Shield video game launch, ahead of Feb 2020's TCG base set).
type VmaxRow = [string, number, string, boolean];

// --- SWSH Black Star Promos (Nov 2019) ---
const WAVE_SWSHP: VmaxRow[] = [
  ['venusaur-gmax', 3, 'Venusaur', true],
  ['charizard-gmax', 6, 'Charizard', true],
  ['blastoise-gmax', 9, 'Blastoise', true],
  ['pikachu-gmax', 25, 'Pikachu', true],
  ['meowth-gmax', 52, 'Meowth', true],
  ['eevee-gmax', 133, 'Eevee', true],
  ['vaporeon-dynamax', 134, 'Vaporeon', false],
  ['jolteon-dynamax', 135, 'Jolteon', false],
  ['flareon-dynamax', 136, 'Flareon', false],
  ['crobat-dynamax', 169, 'Crobat', false],
  ['deoxys-dynamax', 386, 'Deoxys', false],
  ['zeraora-dynamax', 807, 'Zeraora', false],
  ['dragapult-dynamax', 887, 'Dragapult', false],
  ['eternatus-dynamax', 890, 'Eternatus', false],
];

// --- Sword & Shield (Feb 2020) ---
const WAVE_SWSH1: VmaxRow[] = [
  ['lapras-gmax', 131, 'Lapras', true],
  ['snorlax-gmax', 143, 'Snorlax', true],
  ['stonjourner-dynamax', 874, 'Stonjourner', false],
  ['morpeko-dynamax', 877, 'Morpeko', false],
];

// --- Rebel Clash (May 2020) ---
const WAVE_SWSH2: VmaxRow[] = [
  ['malamar-dynamax', 687, 'Malamar', false],
  ['rillaboom-gmax', 812, 'Rillaboom', true],
  ['cinderace-gmax', 815, 'Cinderace', true],
  // Toxtricity: the source article notes some references (Pokemon HOME's
  // mobile Pokedex, the official Japanese Pokedex site) list a separate
  // Gigantamax look per base form (Amped/Low Key), but the article's own
  // table -- and every VMAX card printed -- treats Toxtricity as ONE
  // shared Gigantamax form. pokeapi.co's static sprite host still requires
  // the base-form qualifier even though the card/game treat it as one
  // look (see toxtricity-amped-gmax in downloadGmaxSprites.ts).
  ['toxtricity-amped-gmax', 849, 'Toxtricity', true],
  ['copperajah-gmax', 879, 'Copperajah', true],
  // Inteleon: the VMAX card record's own dexNumber field is bugged in
  // every language's database (tagged 888 -- Zacian's dex -- instead of
  // Inteleon's real 818; every other Inteleon print in the same databases
  // correctly carries 818). This roster uses the real dex number, matching
  // this whole file's convention (see megaDex.ts) of hardcoding baseDex
  // from authoritative species facts rather than trusting a card record's
  // own field. See data/vmax-audit.md for the full bug writeup.
  ['inteleon-gmax', 818, 'Inteleon', true],
];

// --- Darkness Ablaze (Aug 2020) ---
const WAVE_SWSH3: VmaxRow[] = [
  ['butterfree-gmax', 12, 'Butterfree', true],
  ['scizor-dynamax', 212, 'Scizor', false],
  ['salamence-dynamax', 373, 'Salamence', false],
  ['centiskorch-gmax', 851, 'Centiskorch', true],
  ['grimmsnarl-gmax', 861, 'Grimmsnarl', true],
];

// --- Champion's Path (Sep 2020) ---
const WAVE_SWSH3_5: VmaxRow[] = [
  ['gardevoir-dynamax', 282, 'Gardevoir', false],
  ['drednaw-gmax', 834, 'Drednaw', true],
  ['alcremie-gmax', 869, 'Alcremie', true],
];

// --- Vivid Voltage (Nov 2020) ---
const WAVE_SWSH4: VmaxRow[] = [
  ['togekiss-dynamax', 468, 'Togekiss', false],
  ['darmanitan-galar-dynamax', 555, 'Darmanitan (Galarian)', false],
  ['aegislash-dynamax', 681, 'Aegislash', false],
  ['orbeetle-gmax', 826, 'Orbeetle', true],
  ['coalossal-gmax', 839, 'Coalossal', true],
];

// --- Shining Fates (Feb 2021) ---
const WAVE_SWSH4_5: VmaxRow[] = [
  ['ditto-dynamax', 132, 'Ditto', false],
  ['dhelmise-dynamax', 781, 'Dhelmise', false],
  ['cramorant-dynamax', 845, 'Cramorant', false],
];

// --- Battle Styles (Mar 2021) ---
const WAVE_SWSH5: VmaxRow[] = [
  ['victini-dynamax', 494, 'Victini', false],
  ['tapu-koko-dynamax', 785, 'Tapu Koko', false],
  ['corviknight-gmax', 823, 'Corviknight', true],
  ['flapple-gmax', 841, 'Flapple', true],
  // Appletun: see this file's header comment -- a real Gigantamax form
  // (paired with Flapple in the source article's own table row and this
  // same TCG wave) with no VMAX card of its own in any language's
  // database, confirmed by direct search of every card database.
  ['appletun-gmax', 842, 'Appletun', true],
  ['urshifu-single-strike-gmax', 892, 'Urshifu (Single Strike Style)', true],
  ['urshifu-rapid-strike-gmax', 892, 'Urshifu (Rapid Strike Style)', true],
];

// --- Chilling Reign (Jun 2021) ---
const WAVE_SWSH6: VmaxRow[] = [
  ['slowking-galar-dynamax', 199, 'Slowking (Galarian)', false],
  ['celebi-dynamax', 251, 'Celebi', false],
  ['blaziken-dynamax', 257, 'Blaziken', false],
  ['metagross-dynamax', 376, 'Metagross', false],
  ['tornadus-dynamax', 641, 'Tornadus', false],
  ['sandaconda-gmax', 844, 'Sandaconda', true],
  // Calyrex is Dynamax-only -- no Gigantamax form exists for either Rider
  // form (absent from the source Gigantamax article by design; confirmed).
  ['calyrex-ice-dynamax', 898, 'Calyrex (Ice Rider)', false],
  ['calyrex-shadow-dynamax', 898, 'Calyrex (Shadow Rider)', false],
];

// --- Evolving Skies (Aug 2021) ---
const WAVE_SWSH7: VmaxRow[] = [
  ['gyarados-dynamax', 130, 'Gyarados', false],
  ['espeon-dynamax', 196, 'Espeon', false],
  ['umbreon-dynamax', 197, 'Umbreon', false],
  ['rayquaza-dynamax', 384, 'Rayquaza', false],
  ['leafeon-dynamax', 470, 'Leafeon', false],
  ['glaceon-dynamax', 471, 'Glaceon', false],
  ['garbodor-gmax', 569, 'Garbodor', true],
  ['sylveon-dynamax', 700, 'Sylveon', false],
  ['trevenant-dynamax', 709, 'Trevenant', false],
  ['lycanroc-dynamax', 745, 'Lycanroc', false],
  ['dracozolt-dynamax', 880, 'Dracozolt', false],
  ['duraludon-gmax', 884, 'Duraludon', true],
];

// --- Fusion Strike (Nov 2021) ---
const WAVE_SWSH8: VmaxRow[] = [
  ['gengar-gmax', 94, 'Gengar', true],
  ['mew-dynamax', 151, 'Mew', false],
  ['chandelure-dynamax', 609, 'Chandelure', false],
  ['greedent-dynamax', 820, 'Greedent', false],
  ['boltund-dynamax', 836, 'Boltund', false],
];

// --- Brilliant Stars (Feb 2022) ---
const WAVE_SWSH9: VmaxRow[] = [
  ['kingler-gmax', 99, 'Kingler', true],
  ['aggron-dynamax', 306, 'Aggron', false],
  ['mimikyu-dynamax', 778, 'Mimikyu', false],
];

// --- Astral Radiance (May 2022) ---
const WAVE_SWSH10: VmaxRow[] = [
  ['machamp-gmax', 68, 'Machamp', true],
  ['heatran-dynamax', 485, 'Heatran', false],
];

// --- Pokemon GO (Jul 2022) ---
const WAVE_SWSH10_5: VmaxRow[] = [['melmetal-gmax', 809, 'Melmetal', true]];

// --- Lost Origin (Sep 2022) ---
const WAVE_SWSH11: VmaxRow[] = [['kyurem-dynamax', 646, 'Kyurem', false]];

// --- Silver Tempest (Nov 2022) ---
const WAVE_SWSH12: VmaxRow[] = [['regieleki-dynamax', 894, 'Regieleki', false]];

// --- Crown Zenith (Jan 2023) ---
const WAVE_SWSH12_5: VmaxRow[] = [['hatterene-gmax', 858, 'Hatterene', true]];

const ALL_WAVES: VmaxRow[][] = [
  WAVE_SWSHP,
  WAVE_SWSH1,
  WAVE_SWSH2,
  WAVE_SWSH3,
  WAVE_SWSH3_5,
  WAVE_SWSH4,
  WAVE_SWSH4_5,
  WAVE_SWSH5,
  WAVE_SWSH6,
  WAVE_SWSH7,
  WAVE_SWSH8,
  WAVE_SWSH9,
  WAVE_SWSH10,
  WAVE_SWSH10_5,
  WAVE_SWSH11,
  WAVE_SWSH12,
  WAVE_SWSH12_5,
];

function buildForms(): VmaxForm[] {
  const forms: VmaxForm[] = [];
  let order = 1;
  for (const wave of ALL_WAVES) {
    for (const [slug, baseDex, speciesLabel, hasGigantamax] of wave) {
      forms.push({
        slug,
        baseDex,
        speciesLabel,
        displayName: `${hasGigantamax ? 'Gigantamax' : 'Dynamax'} ${speciesLabel}`,
        order: order++,
        hasGigantamax,
      });
    }
  }
  return forms;
}

export const VMAX_DEX: VmaxForm[] = buildForms();

export function vmaxFormBySlug(slug: string): VmaxForm | undefined {
  return VMAX_DEX.find((f) => f.slug === slug);
}

export function vmaxFormsForDex(baseDex: number): VmaxForm[] {
  return VMAX_DEX.filter((f) => f.baseDex === baseDex);
}

// --- Card-name matcher patterns (from the vmax-audit.md name audit) -------
//
// Every family of card name actually observed across public/data/cards/**
// that tags a card as a VMAX form. A card matches if ANY pattern tests true
// against its `name` field. See scripts/carddata/data/vmax-audit.md for the
// full per-language coverage numbers these were audited against.
//
// Two families were found, both keyed on the literal "VMAX" token (Rainbow
// Rare / Shiny Vault VMAX reprints reuse the exact same card name as their
// non-shiny counterpart -- confirmed live: "Charizard VMAX" carries rarities
// "Holo Rare VMAX", "Shiny rare VMAX", "Secret Rare", etc. with no name
// change, so no separate rainbow/shiny pattern is needed):
export interface VmaxNamePattern {
  id: string;
  re: RegExp;
  description: string;
}

export const VMAX_NAME_PATTERNS: VmaxNamePattern[] = [
  {
    id: 'latin-vmax',
    // Western/Latin-script family: "<Species...> VMAX", almost always
    // space-separated, with one confirmed real hyphen variant
    // ("Pikachu Surfeur-VMAX", fr) alongside the space-separated version of
    // the exact same card ("Pikachu Surfeur VMAX") for the same species --
    // both separators are real, observed data, not a hypothetical. Anchored
    // to the END of the string so it can never match "<Species> VSTAR" or
    // "<Species> V" (neither contains the literal substring "VMAX" at all,
    // but the anchor also guards against any future suffix ever being
    // appended after "VMAX"). Requires a space or hyphen immediately before
    // "VMAX" so it never matches the CJK-fused family below.
    re: /[ -]VMAX$/,
    description: 'Western "<Species> VMAX" cards (English/European languages), space or hyphen separated.',
  },
  {
    id: 'cjk-fused-vmax',
    // Chinese (zh-tw confirmed; zh-cn has zero VMAX cards in the database
    // today but would use the same convention if backfilled) family: the
    // species name fused directly to "VMAX" with NO separator, e.g.
    // "夢幻VMAX", "衝浪皮卡丘VMAX". Requires a CJK/kana character
    // immediately before "VMAX" (never a plain space/hyphen, which is the
    // Western family above) so the two patterns can't double-match the
    // same real name. Deliberately NOT end-anchored: one real card name in
    // the data carries a trailing footnote after "VMAX" baked right into
    // the `name` field ("夢幻VMAX\n[極巨化/匯流]", a Scarlet & Violet-era
    // promo reprint) that must still match.
    re: /[㐀-鿿぀-ヿ]VMAX/,
    description: 'CJK "<Species>VMAX" cards (Chinese), species fused directly to VMAX with no separator.',
  },
];

export function isVmaxCardName(name: string): boolean {
  return VMAX_NAME_PATTERNS.some((p) => p.re.test(name));
}
