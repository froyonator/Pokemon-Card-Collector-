// src/data/regionalDex.ts
//
// App-side mirror of scripts/carddata/src/data/regionalDex.ts (the data
// pipeline's canonical regional-form list). App code can't import across the
// scripts/carddata package boundary, so this is a hand-kept copy of the same
// four-family roster, ordering, and card-name matcher patterns -- if the
// pipeline module's ALOLAN_DEX/GALARIAN_DEX/HISUIAN_DEX/PALDEAN_DEX or the
// per-locale marker table ever change, mirror the change here too.
//
// Every regional form gets a SYNTHETIC dex number, one numbering block per
// family (ALOLAN_DEX_BASE + order, GALARIAN_DEX_BASE + order, etc), so it
// flows through every existing dexEntries/tile/ownership code path (owned
// map, wishlist, binders) completely unchanged -- see generations.ts's
// 'alolan'/'galarian'/'hisuian'/'paldean' Generation entries, which are what
// actually wire these into the app's generation selector.
//
// Unlike Mega/VMAX, a regional card is NOT purely additive on its base
// species' own tile: see excludeRegionalFormCards below and its callers in
// state/loadCardData.ts and components/DexGrid.tsx -- a base species tile
// (e.g. plain Growlithe, dex 58) must never show a regional-tagged print
// (e.g. "Hisuian Growlithe"); that print belongs only on its own regional
// family tile.
export type RegionalFamily = 'alolan' | 'galarian' | 'hisuian' | 'paldean';

export const ALOLAN_DEX_BASE = 22000;
export const GALARIAN_DEX_BASE = 23000;
export const HISUIAN_DEX_BASE = 24000;
export const PALDEAN_DEX_BASE = 25000;

const FAMILY_BASE: Record<RegionalFamily, number> = {
  alolan: ALOLAN_DEX_BASE,
  galarian: GALARIAN_DEX_BASE,
  hisuian: HISUIAN_DEX_BASE,
  paldean: PALDEAN_DEX_BASE,
};

export interface RegionalDexEntry {
  /** Synthetic dex number: this family's own base + within-family order. */
  number: number;
  /** The real national dex number of the base species (e.g. 58 for Growlithe). */
  baseDexNumber: number;
  /** Plain species name, no family/form qualifier (e.g. "Tauros"). */
  speciesLabel: string;
  /** Full display name (e.g. "Paldean Tauros (Aqua Breed)"). */
  name: string;
  family: RegionalFamily;
  order: number;
  /**
   * True when this form has its own self-hosted sprite under
   * public/sprites/regional/ (see sprites.ts's regionalSpriteUrls). False for
   * an exclusive-evolution species (e.g. Obstagoon) whose only form already
   * IS the regional look -- it reuses the base species' own sprite instead.
   */
  hasOwnVariety: boolean;
  /** Sprite-archive/name-matching slug -- only meaningful when hasOwnVariety
   * is true; see regionalSpriteUrls. */
  slug: string;
}

// --- Row shape: [slug, baseDex, speciesLabel, formQualifier?] --------------
type RegionalRow = [string, number, string, string?];

function displayNameOf(family: RegionalFamily, speciesLabel: string, formQualifier?: string): string {
  const familyLabel = { alolan: 'Alolan', galarian: 'Galarian', hisuian: 'Hisuian', paldean: 'Paldean' }[family];
  const base = `${familyLabel} ${speciesLabel}`;
  return formQualifier ? `${base} (${formQualifier})` : base;
}

// --- Alolan (19 varieties, all hasOwnVariety: true) -----------------------
const ALOLAN_VARIETIES: RegionalRow[] = [
  ['rattata-alola', 19, 'Rattata'],
  ['raticate-alola', 20, 'Raticate'],
  ['raticate-totem-alola', 20, 'Raticate', 'Totem Form'],
  ['raichu-alola', 26, 'Raichu'],
  ['sandshrew-alola', 27, 'Sandshrew'],
  ['sandslash-alola', 28, 'Sandslash'],
  ['vulpix-alola', 37, 'Vulpix'],
  ['ninetales-alola', 38, 'Ninetales'],
  ['diglett-alola', 50, 'Diglett'],
  ['dugtrio-alola', 51, 'Dugtrio'],
  ['meowth-alola', 52, 'Meowth'],
  ['persian-alola', 53, 'Persian'],
  ['geodude-alola', 74, 'Geodude'],
  ['graveler-alola', 75, 'Graveler'],
  ['golem-alola', 76, 'Golem'],
  ['grimer-alola', 88, 'Grimer'],
  ['muk-alola', 89, 'Muk'],
  ['exeggutor-alola', 103, 'Exeggutor'],
  ['marowak-alola', 105, 'Marowak'],
];

// --- Galarian (20 pokeapi varieties + 6 exclusive evolutions = 26) -------
const GALARIAN_VARIETIES: RegionalRow[] = [
  ['meowth-galar', 52, 'Meowth'],
  ['ponyta-galar', 77, 'Ponyta'],
  ['rapidash-galar', 78, 'Rapidash'],
  ['slowpoke-galar', 79, 'Slowpoke'],
  ['slowbro-galar', 80, 'Slowbro'],
  ['farfetchd-galar', 83, "Farfetch'd"],
  ['weezing-galar', 110, 'Weezing'],
  ['mr-mime-galar', 122, 'Mr. Mime'],
  ['articuno-galar', 144, 'Articuno'],
  ['zapdos-galar', 145, 'Zapdos'],
  ['moltres-galar', 146, 'Moltres'],
  ['slowking-galar', 199, 'Slowking'],
  ['corsola-galar', 222, 'Corsola'],
  ['zigzagoon-galar', 263, 'Zigzagoon'],
  ['linoone-galar', 264, 'Linoone'],
  ['darumaka-galar', 554, 'Darumaka'],
  ['darmanitan-galar-standard', 555, 'Darmanitan', 'Standard Mode'],
  ['darmanitan-galar-zen', 555, 'Darmanitan', 'Zen Mode'],
  ['yamask-galar', 562, 'Yamask'],
  ['stunfisk-galar', 618, 'Stunfisk'],
];
const GALARIAN_EXCLUSIVE_EVOLUTIONS: RegionalRow[] = [
  ['obstagoon', 862, 'Obstagoon'],
  ['perrserker', 863, 'Perrserker'],
  ['cursola', 864, 'Cursola'],
  ['sirfetchd', 865, "Sirfetch'd"],
  ['mr-rime', 866, 'Mr. Rime'],
  ['runerigus', 867, 'Runerigus'],
];

// --- Hisuian (16 pokeapi varieties + 3 exclusive evolutions = 19) --------
const HISUIAN_VARIETIES: RegionalRow[] = [
  ['growlithe-hisui', 58, 'Growlithe'],
  ['arcanine-hisui', 59, 'Arcanine'],
  ['voltorb-hisui', 100, 'Voltorb'],
  ['electrode-hisui', 101, 'Electrode'],
  ['typhlosion-hisui', 157, 'Typhlosion'],
  ['qwilfish-hisui', 211, 'Qwilfish'],
  ['sneasel-hisui', 215, 'Sneasel'],
  ['samurott-hisui', 503, 'Samurott'],
  ['lilligant-hisui', 549, 'Lilligant'],
  ['zorua-hisui', 570, 'Zorua'],
  ['zoroark-hisui', 571, 'Zoroark'],
  ['braviary-hisui', 628, 'Braviary'],
  ['sliggoo-hisui', 705, 'Sliggoo'],
  ['goodra-hisui', 706, 'Goodra'],
  ['avalugg-hisui', 713, 'Avalugg'],
  ['decidueye-hisui', 724, 'Decidueye'],
];
const HISUIAN_EXCLUSIVE_EVOLUTIONS: RegionalRow[] = [
  ['basculegion', 902, 'Basculegion'],
  ['sneasler', 903, 'Sneasler'],
  ['overqwil', 904, 'Overqwil'],
];

// --- Paldean (4 pokeapi varieties + 1 exclusive evolution = 5) ----------
const PALDEAN_VARIETIES: RegionalRow[] = [
  ['tauros-paldea-combat-breed', 128, 'Tauros', 'Combat Breed'],
  ['tauros-paldea-blaze-breed', 128, 'Tauros', 'Blaze Breed'],
  ['tauros-paldea-aqua-breed', 128, 'Tauros', 'Aqua Breed'],
  ['wooper-paldea', 194, 'Wooper'],
];
const PALDEAN_EXCLUSIVE_EVOLUTIONS: RegionalRow[] = [['clodsire', 980, 'Clodsire']];

function buildEntries(
  family: RegionalFamily,
  rows: RegionalRow[],
  hasOwnVariety: boolean,
  startOrder: number
): RegionalDexEntry[] {
  const base = FAMILY_BASE[family];
  let order = startOrder;
  return rows.map(([slug, baseDexNumber, speciesLabel, formQualifier]) => {
    const entry: RegionalDexEntry = {
      number: base + order,
      baseDexNumber,
      speciesLabel,
      name: displayNameOf(family, speciesLabel, formQualifier),
      family,
      order,
      hasOwnVariety,
      slug,
    };
    order += 1;
    return entry;
  });
}

export const ALOLAN_DEX: RegionalDexEntry[] = buildEntries('alolan', ALOLAN_VARIETIES, true, 1);

export const GALARIAN_DEX: RegionalDexEntry[] = [
  ...buildEntries('galarian', GALARIAN_VARIETIES, true, 1),
  ...buildEntries('galarian', GALARIAN_EXCLUSIVE_EVOLUTIONS, false, GALARIAN_VARIETIES.length + 1),
];

export const HISUIAN_DEX: RegionalDexEntry[] = [
  ...buildEntries('hisuian', HISUIAN_VARIETIES, true, 1),
  ...buildEntries('hisuian', HISUIAN_EXCLUSIVE_EVOLUTIONS, false, HISUIAN_VARIETIES.length + 1),
];

export const PALDEAN_DEX: RegionalDexEntry[] = [
  ...buildEntries('paldean', PALDEAN_VARIETIES, true, 1),
  ...buildEntries('paldean', PALDEAN_EXCLUSIVE_EVOLUTIONS, false, PALDEAN_VARIETIES.length + 1),
];

export const REGIONAL_DEX_BY_FAMILY: Record<RegionalFamily, RegionalDexEntry[]> = {
  alolan: ALOLAN_DEX,
  galarian: GALARIAN_DEX,
  hisuian: HISUIAN_DEX,
  paldean: PALDEAN_DEX,
};

export const REGIONAL_DEX_ENTRIES: RegionalDexEntry[] = [...ALOLAN_DEX, ...GALARIAN_DEX, ...HISUIAN_DEX, ...PALDEAN_DEX];

const REGIONAL_DEX_ENTRY_BY_NUMBER = new Map<number, RegionalDexEntry>(
  REGIONAL_DEX_ENTRIES.map((entry) => [entry.number, entry])
);

export function isRegionalDexNumber(dexNumber: number): boolean {
  return REGIONAL_DEX_ENTRY_BY_NUMBER.has(dexNumber);
}

export function regionalDexEntryByNumber(dexNumber: number): RegionalDexEntry | undefined {
  return REGIONAL_DEX_ENTRY_BY_NUMBER.get(dexNumber);
}

export function regionalDexEntriesForBaseDex(baseDexNumber: number): RegionalDexEntry[] {
  return REGIONAL_DEX_ENTRIES.filter((entry) => entry.baseDexNumber === baseDexNumber);
}

export interface RegionalFamilyMeta {
  family: RegionalFamily;
  label: string;
  introducedIn: string;
  formCount: number;
}

export const REGIONAL_FAMILIES: RegionalFamilyMeta[] = [
  { family: 'alolan', label: 'Alolan', introducedIn: 'Sun & Moon', formCount: ALOLAN_DEX.length },
  { family: 'galarian', label: 'Galarian', introducedIn: 'Sword & Shield', formCount: GALARIAN_DEX.length },
  { family: 'hisuian', label: 'Hisuian', introducedIn: 'Legends: Arceus', formCount: HISUIAN_DEX.length },
  { family: 'paldean', label: 'Paldean', introducedIn: 'Scarlet & Violet', formCount: PALDEAN_DEX.length },
];

// --- Card-name matcher (mirrors the pipeline's regional-audit.md) --------
//
// A regional tag alone is NOT enough to identify a match ("Galarian Ponyta"
// and a hypothetical "Galarian Slowpoke" both start with the same marker
// word) -- isRegionalCardName takes the species token (in whatever language
// `cardName` is in) as an explicit parameter and only reports a match when
// that exact token appears immediately adjacent to one of this family's
// confirmed real marker shapes for that language. See the pipeline module's
// own header comment for the full per-language evidence this was audited
// against.
export function escapeRegExp(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface LocaleMarker {
  id: string;
  build: (escapedToken: string) => RegExp;
}

const EN_FUSION_PREFIX = (marker: string) => (token: string) => new RegExp(`(^|&\\s)${marker}[ -]${token}`);
const SUFFIX = (marker: string) => (token: string) => new RegExp(`${token}\\s${marker}`);
const PREFIX_SPACE = (marker: string) => (token: string) => new RegExp(`${marker}\\s+${token}`);

const REGIONAL_LOCALE_MARKERS: Record<RegionalFamily, LocaleMarker[]> = {
  alolan: [
    { id: 'en', build: EN_FUSION_PREFIX('Alolan') },
    { id: 'de', build: (t) => new RegExp(`(^|&\\s)Alola[ -]${t}`) },
    { id: 'es-pt', build: SUFFIX('de Alola') },
    { id: 'it', build: SUFFIX('di Alola') },
    { id: 'fr', build: (t) => new RegExp(`${t}\\s(?:d['’]Alola)`) },
    { id: 'ja', build: PREFIX_SPACE('アローラ') },
    { id: 'zh-tw-cn', build: PREFIX_SPACE('阿羅拉') },
    { id: 'id', build: EN_FUSION_PREFIX('Alolan') },
  ],
  galarian: [
    { id: 'en', build: EN_FUSION_PREFIX('Galarian') },
    { id: 'de', build: (t) => new RegExp(`Galar-${t}`) },
    { id: 'es-pt', build: SUFFIX('de Galar') },
    { id: 'it', build: SUFFIX('di Galar') },
    { id: 'fr', build: SUFFIX('de Galar') },
    { id: 'ja', build: PREFIX_SPACE('ガラル') },
    { id: 'zh-tw', build: PREFIX_SPACE('伽勒爾') },
    { id: 'th', build: PREFIX_SPACE('กาลาร์') },
  ],
  hisuian: [
    { id: 'en', build: EN_FUSION_PREFIX('Hisuian') },
    { id: 'de', build: (t) => new RegExp(`Hisui[ -]${t}`) },
    { id: 'es-pt', build: SUFFIX('de Hisui') },
    { id: 'it', build: SUFFIX('di Hisui') },
    { id: 'fr', build: SUFFIX('de Hisui') },
    { id: 'ja', build: PREFIX_SPACE('ヒスイ') },
    { id: 'zh-tw', build: PREFIX_SPACE('洗翠') },
    { id: 'th', build: PREFIX_SPACE('ฮิซุย') },
  ],
  paldean: [
    { id: 'en', build: EN_FUSION_PREFIX('Paldean') },
    { id: 'de', build: (t) => new RegExp(`Paldea-${t}`) },
    { id: 'es-pt', build: SUFFIX('de Paldea') },
    { id: 'it', build: SUFFIX('di Paldea') },
    { id: 'fr', build: SUFFIX('de Paldea') },
    { id: 'ja', build: PREFIX_SPACE('パルデア') },
    { id: 'zh-tw-cn', build: PREFIX_SPACE('帕底亞') },
    { id: 'th', build: PREFIX_SPACE('พัลเดีย') },
    { id: 'id', build: PREFIX_SPACE('Paldean') },
  ],
};

export function isRegionalCardName(family: RegionalFamily, speciesToken: string, cardName: string): boolean {
  const token = escapeRegExp(speciesToken);
  return REGIONAL_LOCALE_MARKERS[family].some((marker) => marker.build(token).test(cardName));
}

export function cardsForRegionalEntry<T extends { name: string }>(cards: T[], entry: RegionalDexEntry): T[] {
  return cards.filter((card) => isRegionalCardName(entry.family, entry.speciesLabel, card.name));
}

// --- Base-tile inverse exclusion ------------------------------------------
//
// A base species tile (e.g. plain Growlithe, dex 58) must not show a
// regional-tagged print of itself (e.g. "Hisuian Growlithe") -- that card
// belongs only on its own regional family tile. This has to key off EVERY
// (family, speciesLabel) pair recorded for a given base dex number, not just
// one: a handful of species (e.g. Meowth, dex 52) carry regional forms in
// MORE than one family at once, and every one of them must be excluded from
// the shared base tile.
const REGIONAL_FAMILY_LABELS_BY_BASE_DEX: Map<number, Array<{ family: RegionalFamily; speciesLabel: string }>> =
  (() => {
    const map = new Map<number, Array<{ family: RegionalFamily; speciesLabel: string }>>();
    for (const entry of REGIONAL_DEX_ENTRIES) {
      const existing = map.get(entry.baseDexNumber) ?? [];
      if (!existing.some((e) => e.family === entry.family && e.speciesLabel === entry.speciesLabel)) {
        existing.push({ family: entry.family, speciesLabel: entry.speciesLabel });
      }
      map.set(entry.baseDexNumber, existing);
    }
    return map;
  })();

export function regionalFamiliesForBaseDex(
  baseDexNumber: number
): Array<{ family: RegionalFamily; speciesLabel: string }> {
  return REGIONAL_FAMILY_LABELS_BY_BASE_DEX.get(baseDexNumber) ?? [];
}

// Filters a base species' own card bucket down to the cards that are NOT a
// regional-form print of it -- a fast no-op (returns `cards` unchanged, same
// reference) for the overwhelming majority of dex numbers that have no
// regional form at all. Callers (state/loadCardData.ts, components/
// DexGrid.tsx) apply this BEFORE preserveReferencedCards at every base-tile
// cache-write site, so an owned/wishlisted regional card recorded under the
// base dex number (e.g. from before this exclusion existed) is preserved
// right back in by that same mechanism instead of being silently orphaned --
// preserveReferencedCards only ever re-adds a card that's actually
// referenced by `owned`/`wishlist`, so this never resurrects an unowned one.
export function excludeRegionalFormCards<T extends { name: string }>(baseDexNumber: number, cards: T[]): T[] {
  const families = regionalFamiliesForBaseDex(baseDexNumber);
  if (families.length === 0) return cards;
  return cards.filter((card) => !families.some((f) => isRegionalCardName(f.family, f.speciesLabel, card.name)));
}
