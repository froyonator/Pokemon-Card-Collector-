// scripts/carddata/src/data/megaDex.ts
//
// Canonical, ordered list of every official Mega Evolution form. Derived
// from the reference wiki's own "Mega Evolution" article (fetched once via
// src/harvest/wikiApiClient.ts, see data/mega-evolution-article.wikitext.txt,
// gitignored) so the roster comes from an independent authoritative source
// rather than from our own card database: 96 total forms across three
// waves --
//
//   1. X&Y / Omega Ruby & Alpha Sapphire (46 species, 48 forms once
//      Charizard X/Y and Mewtwo X/Y are each counted separately).
//   2. The newest game wave's base game (26 species/forms).
//   3. The newest game wave's DLC (18 species, 22 forms once every
//      form-variation -- Raichu X/Y, the second mega stone some species
//      that already had a classic mega form gained, Magearna's Original
//      Color variant, and Tatsugiri's three cosmetic forms -- is counted
//      separately, matching the source article's own "if form variations
//      are counted" figure).
//
// 48 + 26 + 22 = 96, matching the source article's total. This is the
// single source of truth the app's mega-grouping worker and the sprite/card
// audits both read from.
//
// `slug` matches the form-variety naming used by the static sprite archive's
// species/variety listing (see downloadMegaSprites.ts) -- e.g.
// "venusaur-mega", "charizard-mega-x" -- and doubles as the filename stem
// for public/sprites/mega/{static,animated}/<slug>.{png,gif|webp}.
//
// `order` is first public release order: X&Y's initial reveal/release wave
// first, then Omega Ruby & Alpha Sapphire's additions, National Pokedex
// number as the tiebreaker within each wave (the standard grouping used by
// Mega Evolution reference material). This is a documented convention, not
// a week-by-week reveal timeline -- Diancie and Mega Blaziken were both
// distributed via mid-generation events but are grouped with the X&Y wave
// they belong to, consistent with how they're normally listed. The two
// newest-wave sections continue this convention: the source article's own
// dex-number listing order within each of its two tables (base game, then
// DLC), which is also each table's own introduction order.
export interface MegaForm {
  slug: string;
  baseDex: number;
  /** Species name as used in-game, no "Mega" prefix (e.g. "Charizard X"). */
  speciesLabel: string;
  /** Full display name (e.g. "Mega Charizard X"). */
  displayName: string;
  order: number;
}

// --- X&Y wave (order 1-32): National Dex order, Charizard/Mewtwo X before Y ---
const XY_WAVE: Array<[string, number, string]> = [
  ['venusaur-mega', 3, 'Venusaur'],
  ['charizard-mega-x', 6, 'Charizard X'],
  ['charizard-mega-y', 6, 'Charizard Y'],
  ['blastoise-mega', 9, 'Blastoise'],
  ['alakazam-mega', 65, 'Alakazam'],
  ['gengar-mega', 94, 'Gengar'],
  ['kangaskhan-mega', 115, 'Kangaskhan'],
  ['pinsir-mega', 127, 'Pinsir'],
  ['gyarados-mega', 130, 'Gyarados'],
  ['aerodactyl-mega', 142, 'Aerodactyl'],
  ['mewtwo-mega-x', 150, 'Mewtwo X'],
  ['mewtwo-mega-y', 150, 'Mewtwo Y'],
  ['ampharos-mega', 181, 'Ampharos'],
  ['steelix-mega', 208, 'Steelix'],
  ['scizor-mega', 212, 'Scizor'],
  ['heracross-mega', 214, 'Heracross'],
  ['houndoom-mega', 229, 'Houndoom'],
  ['tyranitar-mega', 248, 'Tyranitar'],
  ['blaziken-mega', 257, 'Blaziken'],
  ['gardevoir-mega', 282, 'Gardevoir'],
  ['mawile-mega', 303, 'Mawile'],
  ['aggron-mega', 306, 'Aggron'],
  ['medicham-mega', 308, 'Medicham'],
  ['manectric-mega', 310, 'Manectric'],
  ['banette-mega', 354, 'Banette'],
  ['absol-mega', 359, 'Absol'],
  ['latias-mega', 380, 'Latias'],
  ['latios-mega', 381, 'Latios'],
  ['garchomp-mega', 445, 'Garchomp'],
  ['lucario-mega', 448, 'Lucario'],
  ['abomasnow-mega', 460, 'Abomasnow'],
  ['diancie-mega', 719, 'Diancie'],
];

// --- Omega Ruby & Alpha Sapphire wave (order 33-48): National Dex order ---
const ORAS_WAVE: Array<[string, number, string]> = [
  ['beedrill-mega', 15, 'Beedrill'],
  ['pidgeot-mega', 18, 'Pidgeot'],
  ['slowbro-mega', 80, 'Slowbro'],
  ['sceptile-mega', 254, 'Sceptile'],
  ['swampert-mega', 260, 'Swampert'],
  ['sableye-mega', 302, 'Sableye'],
  ['sharpedo-mega', 319, 'Sharpedo'],
  ['camerupt-mega', 323, 'Camerupt'],
  ['altaria-mega', 334, 'Altaria'],
  ['glalie-mega', 362, 'Glalie'],
  ['salamence-mega', 373, 'Salamence'],
  ['metagross-mega', 376, 'Metagross'],
  ['rayquaza-mega', 384, 'Rayquaza'],
  ['lopunny-mega', 428, 'Lopunny'],
  ['gallade-mega', 475, 'Gallade'],
  ['audino-mega', 531, 'Audino'],
];

// --- Newest game wave, base game (order 49-74): source article's own
// dex-number listing order, which is also its introduction order ---
const ZA_BASE_WAVE: Array<[string, number, string]> = [
  ['clefable-mega', 36, 'Clefable'],
  ['victreebel-mega', 71, 'Victreebel'],
  ['starmie-mega', 121, 'Starmie'],
  ['dragonite-mega', 149, 'Dragonite'],
  ['meganium-mega', 154, 'Meganium'],
  ['feraligatr-mega', 160, 'Feraligatr'],
  ['skarmory-mega', 227, 'Skarmory'],
  ['froslass-mega', 478, 'Froslass'],
  ['emboar-mega', 500, 'Emboar'],
  ['excadrill-mega', 530, 'Excadrill'],
  ['scolipede-mega', 545, 'Scolipede'],
  ['scrafty-mega', 560, 'Scrafty'],
  ['eelektross-mega', 604, 'Eelektross'],
  ['chandelure-mega', 609, 'Chandelure'],
  ['chesnaught-mega', 652, 'Chesnaught'],
  ['delphox-mega', 655, 'Delphox'],
  ['greninja-mega', 658, 'Greninja'],
  ['pyroar-mega', 668, 'Pyroar'],
  // Base form is specifically Eternal Flower Floette (the source article's
  // only listed pre-Mega form for this row); speciesLabel stays the plain
  // species name to match this file's existing "no form qualifier unless
  // there are sibling mega forms to disambiguate" convention.
  ['floette-mega', 670, 'Floette'],
  ['malamar-mega', 687, 'Malamar'],
  ['barbaracle-mega', 689, 'Barbaracle'],
  ['dragalge-mega', 691, 'Dragalge'],
  ['hawlucha-mega', 701, 'Hawlucha'],
  // Base form is Zygarde's Complete Forme (the source article's only listed
  // pre-Mega form for this row).
  ['zygarde-mega', 718, 'Zygarde'],
  ['drampa-mega', 780, 'Drampa'],
  ['falinks-mega', 870, 'Falinks'],
];

// --- Newest game wave, DLC (order 75-96): source article's own dex-number
// listing order, which is also its introduction order. Three species here
// (Absol, Garchomp, Lucario) already have a classic X&Y-wave mega form --
// this DLC gave each a SECOND, distinct mega stone/form ("Z"), so both
// share one baseDex the same way Charizard/Mewtwo X and Y already do. ---
const ZA_MEGA_DIMENSION_WAVE: Array<[string, number, string]> = [
  ['raichu-mega-x', 26, 'Raichu X'],
  ['raichu-mega-y', 26, 'Raichu Y'],
  ['chimecho-mega', 358, 'Chimecho'],
  ['absol-mega-z', 359, 'Absol Z'],
  ['staraptor-mega', 398, 'Staraptor'],
  ['garchomp-mega-z', 445, 'Garchomp Z'],
  ['lucario-mega-z', 448, 'Lucario Z'],
  ['heatran-mega', 485, 'Heatran'],
  ['darkrai-mega', 491, 'Darkrai'],
  ['golurk-mega', 623, 'Golurk'],
  // Base species has separate Male/Female forms, but the source article
  // gives them one shared Mega Evolution image/name; pokeapi.co's variety
  // for it is keyed off the male base form.
  ['meowstic-male-mega', 678, 'Meowstic'],
  ['crabominable-mega', 740, 'Crabominable'],
  ['golisopod-mega', 768, 'Golisopod'],
  ['magearna-mega', 801, 'Magearna'],
  ['magearna-original-mega', 801, 'Magearna (Original Color)'],
  ['zeraora-mega', 807, 'Zeraora'],
  ['scovillain-mega', 952, 'Scovillain'],
  ['glimmora-mega', 970, 'Glimmora'],
  ['tatsugiri-curly-mega', 978, 'Tatsugiri (Curly Form)'],
  ['tatsugiri-droopy-mega', 978, 'Tatsugiri (Droopy Form)'],
  ['tatsugiri-stretchy-mega', 978, 'Tatsugiri (Stretchy Form)'],
  ['baxcalibur-mega', 998, 'Baxcalibur'],
];

function buildForms(): MegaForm[] {
  const forms: MegaForm[] = [];
  let order = 1;
  for (const [slug, baseDex, speciesLabel] of [...XY_WAVE, ...ORAS_WAVE, ...ZA_BASE_WAVE, ...ZA_MEGA_DIMENSION_WAVE]) {
    forms.push({ slug, baseDex, speciesLabel, displayName: `Mega ${speciesLabel}`, order: order++ });
  }
  return forms;
}

export const MEGA_DEX: MegaForm[] = buildForms();

export function megaFormBySlug(slug: string): MegaForm | undefined {
  return MEGA_DEX.find((f) => f.slug === slug);
}

export function megaFormsForDex(baseDex: number): MegaForm[] {
  return MEGA_DEX.filter((f) => f.baseDex === baseDex);
}

// --- Card-name matcher patterns (from the mega-audit.md name audit) --------
//
// Every family of card name actually observed across public/data/cards/**
// that tags a card as a Mega form. A card matches if ANY pattern tests true
// against its `name` field. See scripts/carddata/data/mega-audit.md for the
// full per-language coverage numbers these were audited against.
//
// Guard, re-verified against the newest-wave roster above: "Yanmega" is a
// real, unrelated species (dex 469, not a Mega form of anything) whose name
// happens to contain the substring "mega". None of the three patterns below
// match it or "Yanmega ex" -- `legacy-m-ex` requires the species name to
// come immediately after a bare "M" separator, and `modern-mega-ex-gx` /
// `ja-modern-mega` both anchor "Mega"/"メガ" to the START of the name
// (`^Mega`/`^メガ`), so a species name that merely CONTAINS "mega" midword
// never matches. See the `shouldNotMatch` fixtures in megaDex.test.ts.
export interface MegaNamePattern {
  id: string;
  re: RegExp;
  description: string;
}

export const MEGA_NAME_PATTERNS: MegaNamePattern[] = [
  {
    id: 'legacy-m-ex',
    // The XY-era "M <Species> EX" family, e.g. "M Charizard EX",
    // "M-Charizard EX", "M Manectric-EX" -- localizations mix a space or a
    // hyphen both after the leading "M" and before the trailing "EX", so
    // both separators are accepted in both positions. Requires the
    // trailing "EX" to avoid matching species whose name happens to start
    // with "M" (there are none observed, but the EX suffix keeps it safe).
    re: /^M[- ][A-Za-zÀ-ÿ].*[- ]EX$/,
    description: 'Legacy XY-era "M <Species> EX" cards (English/European languages).',
  },
  {
    id: 'modern-mega-ex-gx',
    // The modern (post-reboot) "Mega <Species> ex" family, plus the
    // "Mega <SpeciesA> & <SpeciesB> GX" fusion-tag cards from the same era,
    // e.g. "Mega Charizard X ex", "Mega-Meganium-ex", "Mega Sableye &
    // Tyranitar GX". A space or hyphen separates "Mega" from the species
    // name; the suffix is lowercase "ex" or uppercase "GX".
    re: /^Mega[ -][A-Za-zÀ-ÿ].*\b(ex|GX)$/,
    description: 'Modern "Mega <Species> ex" / "Mega <A> & <B> GX" cards (English/European languages).',
  },
  {
    id: 'ja-modern-mega',
    // Japanese modern-era equivalent: katakana "メガ" prefix directly
    // fused to the species name, lowercase latin "ex" suffix, e.g.
    // "メガリザードンXex". Deliberately requires the "ex" suffix so it does
    // NOT match species whose katakana name happens to start with メガ
    // coincidentally (e.g. "メガニウム" / Meganium, which has no card by
    // that name matching this pattern since it never ends in "ex").
    re: /^メガ.+ex$/,
    description: 'Japanese modern-era "メガ<Species>ex" cards.',
  },
];

export function isMegaCardName(name: string): boolean {
  return MEGA_NAME_PATTERNS.some((p) => p.re.test(name));
}
