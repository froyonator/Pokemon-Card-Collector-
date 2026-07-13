// scripts/carddata/src/data/megaDex.ts
//
// Canonical, ordered list of every official Mega Evolution form (the X&Y /
// Omega Ruby & Alpha Sapphire generation of Mega Evolution): 46 species, 48
// forms once Charizard X/Y and Mewtwo X/Y are each counted separately. This
// is the single source of truth the app's mega-grouping worker and the
// sprite/card audits both read from.
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
// they belong to, consistent with how they're normally listed.
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

function buildForms(): MegaForm[] {
  const forms: MegaForm[] = [];
  let order = 1;
  for (const [slug, baseDex, speciesLabel] of [...XY_WAVE, ...ORAS_WAVE]) {
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
