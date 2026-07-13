// src/data/megaDex.ts
//
// App-side mirror of scripts/carddata/src/data/megaDex.ts (the data
// pipeline's canonical Mega Evolution list). App code can't import across
// the scripts/carddata package boundary, so this is a hand-kept copy of the
// same 96-form roster, ordering, and card-name matcher patterns -- if the
// pipeline module's MEGA_DEX or MEGA_NAME_PATTERNS ever change, mirror the
// change here too.
//
// Every Mega form gets a SYNTHETIC dex number (MEGA_DEX_BASE + release
// order) so it flows through every existing dexEntries/tile/ownership code
// path (owned map, wishlist, binders) completely unchanged -- see
// generations.ts's 'mega' Generation entry, which is what actually wires
// these into the app's generation selector.

export const MEGA_DEX_BASE = 20000;

export interface MegaDexEntry {
  /** Synthetic dex number: MEGA_DEX_BASE + release order (20001-20096). */
  number: number;
  /** The real national dex number of the base species (e.g. 6 for Charizard). */
  baseDexNumber: number;
  /** Display name, e.g. "Mega Charizard X". */
  name: string;
  /** Sprite-archive/name-matching slug, e.g. "charizard-mega-x". */
  slug: string;
  /** Sprite file stem under public/sprites/mega/{static,animated}/. Same
   * value as `slug` today -- kept as its own field in case the sprite
   * archive's filename convention and the name-matching slug ever diverge. */
  spriteSlug: string;
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
  ['floette-mega', 670, 'Floette'],
  ['malamar-mega', 687, 'Malamar'],
  ['barbaracle-mega', 689, 'Barbaracle'],
  ['dragalge-mega', 691, 'Dragalge'],
  ['hawlucha-mega', 701, 'Hawlucha'],
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

function buildEntries(): MegaDexEntry[] {
  const entries: MegaDexEntry[] = [];
  let order = 1;
  for (const [slug, baseDexNumber, speciesLabel] of [
    ...XY_WAVE,
    ...ORAS_WAVE,
    ...ZA_BASE_WAVE,
    ...ZA_MEGA_DIMENSION_WAVE,
  ]) {
    entries.push({
      number: MEGA_DEX_BASE + order,
      baseDexNumber,
      name: `Mega ${speciesLabel}`,
      slug,
      spriteSlug: slug,
      order,
    });
    order += 1;
  }
  return entries;
}

export const MEGA_DEX_ENTRIES: MegaDexEntry[] = buildEntries();

const MEGA_DEX_ENTRY_BY_NUMBER = new Map<number, MegaDexEntry>(
  MEGA_DEX_ENTRIES.map((entry) => [entry.number, entry])
);

export function isMegaDexNumber(dexNumber: number): boolean {
  return MEGA_DEX_ENTRY_BY_NUMBER.has(dexNumber);
}

export function megaDexEntryByNumber(dexNumber: number): MegaDexEntry | undefined {
  return MEGA_DEX_ENTRY_BY_NUMBER.get(dexNumber);
}

export function megaDexEntriesForBaseDex(baseDexNumber: number): MegaDexEntry[] {
  return MEGA_DEX_ENTRIES.filter((entry) => entry.baseDexNumber === baseDexNumber);
}

// --- Card-name matcher patterns (mirrors the pipeline's mega-audit.md) ----
//
// Every family of card name observed across public/data/cards/** that tags
// a card as a Mega form. A card matches if ANY pattern tests true against
// its `name` field. See scripts/carddata/data/mega-audit.md (gitignored)
// for the full per-language coverage numbers these were audited against.
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
    // with "M".
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
    // Japanese modern-era equivalent: katakana "メガ" prefix directly fused
    // to the species name, lowercase latin "ex" suffix, e.g.
    // "メガリザードンXex". Deliberately requires the "ex" suffix so it does
    // NOT match species whose katakana name happens to start with メガ
    // coincidentally (e.g. "メガニウム" / Meganium).
    re: /^メガ.+ex$/,
    description: 'Japanese modern-era "メガ<Species>ex" cards.',
  },
];

export function isMegaCardName(name: string): boolean {
  return MEGA_NAME_PATTERNS.some((p) => p.re.test(name));
}

// --- Per-entry filtering (species + X/Y/Z variant splitting) -------------
//
// Species scoping itself doesn't need a literal name-substring check here:
// callers filter a base species' ALREADY dex-number-scoped card bucket
// (this app's static database is keyed by Pokemon dex number, so every card
// in, say, dex 6's bucket is already a Charizard card in whatever language
// it's in -- "M Glurak EX" in German, "M Charizard EX" in English). Doing a
// literal English-name substring check on top would incorrectly reject
// every non-English Mega card. isMegaCardName alone is what narrows an
// already species-scoped bucket down to just its Mega prints.
//
// Charizard (dex 6), Mewtwo (dex 150), and Raichu (dex 26, added with the
// newest game wave's DLC) each have two separate Mega forms (X and Y)
// sharing one base species, and NO un-suffixed entry of their own -- every
// card for that species is either the X form, the Y form, or (the legacy
// "M Charizard EX" family) ambiguous between the two.
//
// Absol (359), Garchomp (445), and Lucario (448) also gained a SECOND mega
// form in that same DLC wave (a "Z" mega stone), but -- unlike the X/Y
// pairs -- each KEPT its original, un-suffixed entry (e.g. "absol-mega")
// alongside the new "-mega-z" one. That shapes the split rule differently:
// see the wantedVariant === null branch in cardMatchesMegaEntry below.
//
// Every one of these six base dex numbers needs SOME variant split; which
// rule applies (X/Y-style "ambiguous shows on every variant tile" vs.
// Z-style "ambiguous belongs to the un-suffixed entry only") is decided by
// AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX below.
const VARIANT_SPLIT_BASE_DEX = new Set([6, 26, 150, 359, 445, 448]);

// The X/Y-only families: no un-suffixed entry exists for these, so a
// tokenless (ambiguous) card name -- e.g. the legacy "M Charizard EX"
// family, which never distinguishes X from Y in its name at all, see
// mega-audit.md -- can't be dropped into a "base" bucket the way a Z-form
// species' ambiguous cards can. It's shown on every variant tile of the
// species instead, rather than silently disappearing from all of them.
const AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX = new Set([6, 26, 150]);

type MegaVariant = 'X' | 'Y' | 'Z';

function entryVariant(entry: MegaDexEntry): MegaVariant | null {
  if (entry.slug.endsWith('-mega-x')) return 'X';
  if (entry.slug.endsWith('-mega-y')) return 'Y';
  if (entry.slug.endsWith('-mega-z')) return 'Z';
  return null;
}

// Reads an explicit X/Y/Z variant token out of a card name, or null if the
// name carries no such token (e.g. the legacy "M Charizard EX" family,
// which never distinguishes X from Y in its name at all -- see
// mega-audit.md). No real "Z"-token card name has been observed anywhere in
// the data yet (see mega-audit.md and megaDex.test.ts's fixtures), but the
// token is recognized here on the same terms as X/Y so a future Mega
// Absol/Garchomp/Lucario Z print is picked up automatically, without a code
// change, the moment its name follows the same convention. Two shapes are
// recognized:
//  - Latin family: a standalone "X"/"Y"/"Z" token bounded by spaces/
//    hyphens/the string's own edges, e.g. "Mega Charizard X ex" or "Mega
//    Charizard X-ex". Deliberately does NOT match the "X" inside "EX"/"ex"
//    itself (no boundary on both sides there).
//  - Japanese modern family: the variant letter fused directly onto the
//    "ex" suffix with no separator at all, e.g. "メガリザードンXex".
function extractVariantToken(cardName: string): MegaVariant | null {
  const latinMatch = cardName.match(/(?:^|[\s-])([XYZ])(?=$|[\s-])/);
  if (latinMatch) return latinMatch[1] as MegaVariant;
  const jaMatch = cardName.match(/([XYZ])ex$/);
  if (jaMatch) return jaMatch[1] as MegaVariant;
  return null;
}

// Whether a card name belongs to a given Mega dex entry. Callers are
// expected to have already scoped `cardName` to the entry's base species
// (see the module comment above) -- this only adds the Mega-family check
// and, for the six variant-split species, the X/Y/Z split.
export function cardMatchesMegaEntry(cardName: string, entry: MegaDexEntry): boolean {
  if (!isMegaCardName(cardName)) return false;
  if (!VARIANT_SPLIT_BASE_DEX.has(entry.baseDexNumber)) return true;
  const wantedVariant = entryVariant(entry);
  const cardVariant = extractVariantToken(cardName);
  if (wantedVariant === null) {
    // The un-suffixed "classic" entry of a Z-form species (Absol/Garchomp/
    // Lucario's own original entry, kept alongside their new "-mega-z"
    // one -- see the module comment above). A card with no explicit
    // variant token IS this classic form by default; a card that DOES
    // carry an explicit token belongs on that other, suffixed entry
    // instead, not here too. (X/Y-only species have no un-suffixed entry
    // at all, so this branch never runs for them.)
    return cardVariant === null;
  }
  if (cardVariant === null) {
    // No readable variant token: shown on every variant tile for the
    // X/Y-only families (there's no un-suffixed entry for it to belong to
    // instead, see AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX above).
    // For a Z-form species this branch is unreachable for a tokenless card
    // -- it already matched the wantedVariant === null entry above and
    // returned there -- so this only ever evaluates false for one of the
    // three Z entries, correctly excluding it.
    return AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX.has(entry.baseDexNumber);
  }
  return cardVariant === wantedVariant;
}

export function cardsForMegaEntry<T extends { name: string }>(cards: T[], entry: MegaDexEntry): T[] {
  return cards.filter((card) => cardMatchesMegaEntry(card.name, entry));
}
