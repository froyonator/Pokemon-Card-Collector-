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

// --- Curated X/Y overrides for cards a wiki source confirms depict one
// specific Mega form, even though their own card name carries no X/Y token
// (the legacy "M Charizard EX" / "M Mewtwo EX" family never does -- see
// AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX above). Where a card's own
// TCG-reference-wiki article (fetched politely via harvest/wikiApiClient.ts,
// see scripts/carddata/data/gap-audit/, gitignored, for the raw wikitext
// evidence) states outright which Mega form it depicts -- e.g. its
// "===Origin===" section reading "This card depicts {{me|Mewtwo}} X." -- that
// beats the token-absence default below, splitting the print onto its one
// true tile instead of showing it on both. A print with NO such determinable
// evidence stays on every variant tile, exactly as before this table
// existed.
//
// Keyed by normalized setId + leading-zero-stripped localId, mirroring
// scripts/carddata's own dedup key (augmentFromSupplemental.ts's dedupKey:
// `${setId.toUpperCase()}::${localId with leading zeros stripped}`) so a
// card independently re-derived by a different source (or a different
// language's copy of the SAME physical print, which shares setId+localId
// with the English one -- verified live against this table's own German
// entries, see megaDex.test.ts) lands on the identical key. Verified against
// two live Japanese examples (dex 6 and dex 150's XY-era sets): the
// Japanese static database uses ITS OWN independent setId scheme for
// XY-era sets (e.g. "M2" for what English calls "xy2") and, independently,
// carries none of the ambiguous tokenless "M<Species>EX" prints at all for
// Charizard/Mewtwo -- only the already-tokened modern "メガ<Species>Xex"
// family -- so this table needs no Japanese entries for either species; the
// setId-sharing assumption holds for the European localizations (verified
// live: German/French/Spanish/Italian/Portuguese all reuse the exact same
// "xy2"/"xy8"/"g1" setIds as English for these prints) but does not need to
// and does not hold for Japanese.
function overrideKey(setId: string, localId: string): string {
  return `${setId.toUpperCase()}::${String(localId).replace(/^0+(?=\d)/, '')}`;
}

export const VARIANT_OVERRIDES: Record<string, MegaVariant> = {
  // --- Charizard (dex 6) ---
  // "M Charizard-EX (Generations 12)": ndex=006MX, "This card depicts
  // Charizard X."
  [overrideKey('g1', '12')]: 'X',
  // "M Charizard-EX (Flashfire 13)": ndex=006MY, "This card depicts
  // Charizard Y." Also covers its own listed reprints: the Flashfire 107
  // Secret print, and the Evolutions 13/101 Regular and Full Art reprints
  // (same artwork, same card, per that article's own reprint gallery).
  [overrideKey('xy2', '13')]: 'Y',
  [overrideKey('xy2', '107')]: 'Y',
  [overrideKey('xy12', '13')]: 'Y',
  [overrideKey('xy12', '101')]: 'Y',
  // "M Charizard-EX (Flashfire 69)": ndex=006MX, "This card depicts
  // Charizard X." Also covers its own listed reprint: the Flashfire 108
  // Secret print.
  [overrideKey('xy2', '69')]: 'X',
  [overrideKey('xy2', '108')]: 'X',
  // --- Mewtwo (dex 150) ---
  // "M Mewtwo-EX (BREAKthrough 63)": ndex=150MX, "This card depicts Mewtwo
  // X." Also covers its own listed reprint: the BREAKthrough 159 Full Art
  // print.
  [overrideKey('xy8', '63')]: 'X',
  [overrideKey('xy8', '159')]: 'X',
  // "M Mewtwo-EX (BREAKthrough 64)": ndex=150MY, "This card depicts Mewtwo
  // Y." Also covers its own listed reprint: the BREAKthrough 160 Full Art
  // print.
  [overrideKey('xy8', '64')]: 'Y',
  [overrideKey('xy8', '160')]: 'Y',
  // No override entries for Raichu (dex 26): the newest game wave's DLC
  // Mega Raichu X/Y forms have zero printed TCG cards in the data today
  // (verified live: dex 26's static bucket, every language, carries no
  // Mega-tagged card at all), so there is nothing tokenless to disambiguate
  // yet. Add entries here the same way the moment a real print appears.
};

function lookupVariantOverride(setId: string | undefined, localId: string | undefined): MegaVariant | null {
  if (!setId || !localId) return null;
  return VARIANT_OVERRIDES[overrideKey(setId, localId)] ?? null;
}

// Extracts the species token immediately adjacent to a card's Mega marker,
// for multi-Pokemon ("&"-joined TAG TEAM) card names only -- e.g. "Mega
// Sableye & Tyranitar GX" or the German "Mega-Zobiris & Despotar GX". Real
// TCG naming convention always puts the Mega-tagged Pokemon FIRST in such a
// name (confirmed against every "&" mega-tagged card observed in the data,
// see megaDex.test.ts), so only the segment before the first "&" is ever
// the Mega one; whatever species follows "&" is just a same-card teammate
// with no Mega tag of its own. Returns null for a plain (non-"&") card name
// -- the adjacency guard in cardMatchesMegaEntry only ever needs to run for
// the multi-Pokemon shape; a single-species card's Mega tag unambiguously
// belongs to that one species already (see the module comment up top).
function megaAdjacentSpeciesToken(cardName: string): string | null {
  const ampIndex = cardName.indexOf('&');
  if (ampIndex === -1) return null;
  const firstSegment = cardName.slice(0, ampIndex).trim();
  const latinMatch = firstSegment.match(/^(?:Mega|M)[- ](.+)$/);
  if (latinMatch) return latinMatch[1].trim();
  const jaMatch = firstSegment.match(/^メガ(.+)$/);
  if (jaMatch) return jaMatch[1].trim();
  return null;
}

// Loose match between a Mega-adjacent species token pulled off a card name
// (see megaAdjacentSpeciesToken) and a plain reference species name derived
// straight from the data (see derivePlainSpeciesName) -- tolerant of a
// trailing X/Y/Z variant letter on the token side (e.g. token "Charizard X"
// against reference "Charizard"), since a hypothetical future TAG TEAM card
// naming an X/Y-split species would carry one.
function speciesTokenMatches(token: string, referenceSpeciesName: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase();
  const normalizedToken = normalize(token);
  const normalizedReference = normalize(referenceSpeciesName);
  if (normalizedToken === normalizedReference) return true;
  return normalizedToken.replace(/\s+[xyz]$/, '') === normalizedReference;
}

// Derives a plain (non-Mega, non-multi-Pokemon) reference name for whatever
// species a card bucket belongs to, straight from that bucket's own sibling
// cards -- no per-language species-name table needed. Picks the SHORTEST
// such name in the bucket (ties broken by first occurrence): a bare print
// (e.g. "Sableye") is reliably shorter than a modified one that happens to
// share the same species (e.g. "Sableye G", "Dark Tyranitar", "Team
// Rocket's Tyranitar"), so this is robust against which exact plain card
// happens to appear in the bucket. Returns null if the bucket has no plain
// card at all to derive from (e.g. a species whose only static coverage is
// Mega prints) -- callers treat that as "can't determine," not "no match,"
// so the multi-Pokemon adjacency guard in cardMatchesMegaEntry is skipped
// entirely rather than wrongly rejecting every card.
function derivePlainSpeciesName<T extends { name: string }>(cards: T[]): string | null {
  let best: string | null = null;
  for (const card of cards) {
    const name = card.name.trim();
    if (name.includes('&') || isMegaCardName(name)) continue;
    if (best === null || name.length < best.length) best = name;
  }
  return best;
}

// Whether a card name belongs to a given Mega dex entry. Callers are
// expected to have already scoped `cardName` to the entry's base species
// (see the module comment above) -- this only adds the Mega-family check
// and, for the six variant-split species, the X/Y/Z split.
//
// `referenceSpeciesName` (from derivePlainSpeciesName) guards against a
// multi-Pokemon TAG TEAM card bleeding onto a teammate species' OWN Mega
// tile just because that teammate is independently a Mega species too --
// e.g. "Mega Sableye & Tyranitar GX" is filed under both Sableye's and
// Tyranitar's dex buckets (it depicts both), and both have their own Mega
// entry, but the "Mega" tag itself belongs only to Sableye, the adjacent
// name (regression: reported live as Mega Tyranitar showing this card).
// Omitted (or a card with no plain sibling to derive it from), this guard
// is skipped -- see derivePlainSpeciesName's own doc comment.
//
// `overrideVariant` (from lookupVariantOverride) is curated evidence that a
// specific print, even a tokenless one, is confirmed as one specific X/Y
// form -- see VARIANT_OVERRIDES above. It's consulted BEFORE the name-token
// heuristic below: a tokenless card WITH an override is no longer
// ambiguous, so it stops showing on every variant tile and instead shows
// only on its one confirmed one.
export function cardMatchesMegaEntry(
  cardName: string,
  entry: MegaDexEntry,
  options: { referenceSpeciesName?: string | null; overrideVariant?: MegaVariant | null } = {}
): boolean {
  const { referenceSpeciesName = null, overrideVariant = null } = options;
  if (!isMegaCardName(cardName)) return false;

  if (referenceSpeciesName) {
    const adjacentToken = megaAdjacentSpeciesToken(cardName);
    if (adjacentToken !== null && !speciesTokenMatches(adjacentToken, referenceSpeciesName)) {
      return false;
    }
  }

  if (!VARIANT_SPLIT_BASE_DEX.has(entry.baseDexNumber)) return true;
  const wantedVariant = entryVariant(entry);

  if (overrideVariant !== null) {
    // A curated override is always an explicit X/Y/Z call, so for a
    // classic-vs-Z species it can never belong to the un-suffixed classic
    // entry (wantedVariant === null) -- only to the one matching suffixed
    // entry, exactly like a real name-token would.
    return wantedVariant !== null && overrideVariant === wantedVariant;
  }

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
    // No readable variant token and no override: shown on every variant
    // tile for the X/Y-only families (there's no un-suffixed entry for it
    // to belong to instead, see AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX
    // above). For a Z-form species this branch is unreachable for a
    // tokenless card -- it already matched the wantedVariant === null
    // entry above and returned there -- so this only ever evaluates false
    // for one of the three Z entries, correctly excluding it.
    return AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX.has(entry.baseDexNumber);
  }
  return cardVariant === wantedVariant;
}

export function cardsForMegaEntry<T extends { name: string; setId?: string; localId?: string }>(
  cards: T[],
  entry: MegaDexEntry
): T[] {
  const referenceSpeciesName = derivePlainSpeciesName(cards);
  return cards.filter((card) =>
    cardMatchesMegaEntry(card.name, entry, {
      referenceSpeciesName,
      overrideVariant: lookupVariantOverride(card.setId, card.localId),
    })
  );
}
