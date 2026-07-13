// scripts/carddata/src/data/regionalDex.ts
//
// Canonical, ordered list of every official regional form across the four
// families this app tracks: Alolan (Sun & Moon), Galarian (Sword & Shield),
// Hisuian (Legends: Arceus), and Paldean (Scarlet & Violet). Mirrors the
// design of megaDex.ts/vmaxDex.ts: a one-time, hand-verified research pass
// against an independent authoritative source (pokeapi.co's own species
// variety listing), hardcoded here rather than fetched at runtime or during
// every pipeline run.
//
// ROSTER DERIVATION -- two inputs, unioned, exactly like vmaxDex.ts unions
// the Gigantamax wiki article with the app's own VMAX card evidence:
//
//   1. Every pokeapi.co "variety" of an existing species whose name ends in
//      -alola, -galar, -hisui, or -paldea (Rattata -> "rattata-alola", etc),
//      found via a full listing of https://pokeapi.co/api/v2/pokemon --
//      1351 entries total, filtered live. These get `hasOwnVariety: true`:
//      pokeapi assigns them their own numeric form id and the modern
//      animated sprite host has independent coverage for most of them, so
//      each one gets its own self-hosted sprite (see
//      downloadRegionalSprites.ts) distinct from the base species sprite.
//      A handful of species have more than one such variety -- included as
//      separate entries sharing one baseDex, the same convention
//      megaDex.ts uses for Charizard X/Y: Tauros's three Paldean breeds
//      (combat/blaze/aqua) and Galarian Darmanitan's two modes
//      (standard/zen). One further variety, Totem Alolan Raticate
//      ("raticate-totem-alola"), is a real, separately-form-tagged pokeapi
//      variety with no card of its own in any language's database --
//      included anyway per the same "a form is a form whether or not the
//      TCG printed it" precedent vmaxDex.ts set for Appletun.
//
//   2. Species whose ONLY form is a regional-exclusive evolution -- no
//      non-regional counterpart exists, so pokeapi never suffixes them
//      (Obstagoon is just "obstagoon", not "obstagoon-galar"). These get
//      `hasOwnVariety: false` and reuse the ordinary base-species sprite
//      already downloaded by downloadSprites.ts for every dex number 1-1025
//      -- there is nothing extra to fetch. Confirmed via pokeapi.co's own
//      pokemon-species `evolves_from_species` field for every species in
//      dex ranges 855-870 (Galar wave), 895-910 (Hisui wave), and 975-985
//      (Paldea wave): Obstagoon/Perrserker/Cursola/Sirfetch'd/Mr. Rime/
//      Runerigus each evolve from a species that HAS a Galarian variety
//      (Linoone/Meowth/Corsola/Farfetch'd/Mr. Mime/Yamask); Basculegion/
//      Sneasler/Overqwil each evolve from a species with a Hisuian variety
//      (Basculin/Sneasel/Qwilfish); Clodsire evolves from Paldean Wooper.
//      Included in this module ONLY when at least one real card name in
//      this app's own database (public/data/cards/**/*.json) actually
//      carries that family's tag for the species -- confirmed live for all
//      ten listed above ("Galarian Obstagoon", "Hisuian Basculegion",
//      "Paldean Clodsire", etc). Three more Hisui-wave exclusive evolutions
//      exist in the games (Wyrdeer from Stantler, Kleavor from Scyther,
//      Ursaluna from Ursaring) but were deliberately left OUT of this
//      roster: every "Wyrdeer"/"Kleavor"/"Ursaluna" card in every language
//      database was checked and NONE carries a "Hisuian" tag of any kind
//      (unlike Basculegion/Sneasler/Overqwil, which do) -- the TCG simply
//      never marks these three as regional, so there is no tag for the
//      name-matcher below to ever match and no product reason to invent a
//      roster slot for them. See data/regional-audit.md.
//
// `slug` for an hasOwnVariety:true entry is pokeapi's own variety name
// (e.g. "vulpix-alola") and doubles as the filename stem for
// public/sprites/regional/{static,animated}/<slug>.{png,gif|webp} -- see
// downloadRegionalSprites.ts. For an hasOwnVariety:false entry, `slug` is
// simply that species' own pokeapi/default name (e.g. "obstagoon"); it is
// never looked up against a sprite host by this module's download script.
//
// `speciesLabel` is the plain species name with no family or form
// qualifier (e.g. "Tauros", "Darmanitan", "Obstagoon") -- shared by sibling
// breed/mode entries and is the token the card-name matcher below keys off
// of, since (confirmed live) the TCG never prints a breed- or mode-specific
// card name for Paldean Tauros or Galarian Darmanitan; every card just says
// "Paldean Tauros" / "Galarian Darmanitan" regardless of which variety.
//
// `order` is National Dex order within each family (baseDex ascending),
// with a documented tiebreak for same-dex siblings: plain form before Totem
// (Raticate), standard before zen (Darmanitan), and combat/blaze/aqua in
// that order for Tauros (matching this file's own header example order and
// pokeapi's own variety listing order).
export type RegionalFamily = 'alolan' | 'galarian' | 'hisuian' | 'paldean';

export interface RegionalForm {
  slug: string;
  baseDex: number;
  /** Plain species name, no family/form qualifier (e.g. "Tauros"). */
  speciesLabel: string;
  /** Full display name (e.g. "Paldean Tauros (Aqua Breed)"). */
  displayName: string;
  family: RegionalFamily;
  order: number;
  /**
   * True when pokeapi.co exposes this form as its own suffixed variety with
   * its own numeric form id (gets a self-hosted sprite of its own). False
   * for an exclusive-evolution species whose only form already IS the
   * regional look -- it reuses the base-species sprite, no separate fetch.
   */
  hasOwnVariety: boolean;
}

// --- Row shape: [slug, baseDex, speciesLabel, formQualifier?] --------------
type RegionalRow = [string, number, string, string?];

function displayNameOf(family: RegionalFamily, speciesLabel: string, formQualifier?: string): string {
  const familyLabel = { alolan: 'Alolan', galarian: 'Galarian', hisuian: 'Hisuian', paldean: 'Paldean' }[family];
  const base = `${familyLabel} ${speciesLabel}`;
  return formQualifier ? `${base} (${formQualifier})` : base;
}

// --- Alolan (19 varieties, all hasOwnVariety: true; no exclusive evolutions
// exist for this family -- every Gen7 Kanto-species evolution introduced a
// new item/method but never a new dex-numbered species) -----------------
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

function buildForms(family: RegionalFamily, rows: RegionalRow[], hasOwnVariety: boolean, startOrder: number): RegionalForm[] {
  let order = startOrder;
  return rows.map(([slug, baseDex, speciesLabel, formQualifier]) => ({
    slug,
    baseDex,
    speciesLabel,
    displayName: displayNameOf(family, speciesLabel, formQualifier),
    family,
    order: order++,
    hasOwnVariety,
  }));
}

export const ALOLAN_DEX: RegionalForm[] = buildForms('alolan', ALOLAN_VARIETIES, true, 1);

export const GALARIAN_DEX: RegionalForm[] = [
  ...buildForms('galarian', GALARIAN_VARIETIES, true, 1),
  ...buildForms('galarian', GALARIAN_EXCLUSIVE_EVOLUTIONS, false, GALARIAN_VARIETIES.length + 1),
];

export const HISUIAN_DEX: RegionalForm[] = [
  ...buildForms('hisuian', HISUIAN_VARIETIES, true, 1),
  ...buildForms('hisuian', HISUIAN_EXCLUSIVE_EVOLUTIONS, false, HISUIAN_VARIETIES.length + 1),
];

export const PALDEAN_DEX: RegionalForm[] = [
  ...buildForms('paldean', PALDEAN_VARIETIES, true, 1),
  ...buildForms('paldean', PALDEAN_EXCLUSIVE_EVOLUTIONS, false, PALDEAN_VARIETIES.length + 1),
];

export const REGIONAL_DEX_BY_FAMILY: Record<RegionalFamily, RegionalForm[]> = {
  alolan: ALOLAN_DEX,
  galarian: GALARIAN_DEX,
  hisuian: HISUIAN_DEX,
  paldean: PALDEAN_DEX,
};

export const REGIONAL_DEX: RegionalForm[] = [...ALOLAN_DEX, ...GALARIAN_DEX, ...HISUIAN_DEX, ...PALDEAN_DEX];

export function regionalFormBySlug(slug: string): RegionalForm | undefined {
  return REGIONAL_DEX.find((f) => f.slug === slug);
}

export function regionalFormsForDex(baseDex: number): RegionalForm[] {
  return REGIONAL_DEX.filter((f) => f.baseDex === baseDex);
}

// --- Family metadata -------------------------------------------------------

export interface RegionalFamilyMeta {
  family: RegionalFamily;
  label: string;
  /** Introducing game wave, for display/reference only. */
  introducedIn: string;
  formCount: number;
}

export const REGIONAL_FAMILIES: RegionalFamilyMeta[] = [
  { family: 'alolan', label: 'Alolan', introducedIn: 'Sun & Moon', formCount: ALOLAN_DEX.length },
  { family: 'galarian', label: 'Galarian', introducedIn: 'Sword & Shield', formCount: GALARIAN_DEX.length },
  { family: 'hisuian', label: 'Hisuian', introducedIn: 'Legends: Arceus', formCount: HISUIAN_DEX.length },
  { family: 'paldean', label: 'Paldean', introducedIn: 'Scarlet & Violet', formCount: PALDEAN_DEX.length },
];

// --- Card-name matcher -------------------------------------------------
//
// Unlike MEGA_NAME_PATTERNS/VMAX_NAME_PATTERNS (which need no species
// information -- "Mega"/"VMAX" alone is an unambiguous marker), a regional
// tag alone is NOT enough: "Galarian Ponyta" and a hypothetical "Galarian
// Slowpoke" both start with the same marker word, so telling them apart
// requires knowing which species is being asked about. isRegionalCardName
// therefore takes the species token (in whatever language `cardName` is
// in) as an explicit parameter and only reports a match when that EXACT
// token appears immediately adjacent to one of this family's confirmed
// real marker forms for that language -- never merely "the marker is
// present somewhere in the string."
//
// Each entry below is a real, confirmed-live pattern shape, evidenced
// against every language's full card-name set in public/data/cards/**
// (see data/regional-audit.md for exact match counts). Separator/position
// varies by language and even by family within the same language:
//
//   en: prefix, space-separated -- "Alolan Vulpix", "Galarian Ponyta".
//       Fusion "tag team" cards put the marker on the SECOND species,
//       mid-string, not at position 0 -- "Raichu & Alolan Raichu GX",
//       "Rowlet & Alolan Exeggutor GX" (Alolan family only; no Galarian/
//       Hisuian/Paldean fusion card exists in any language's database).
//   de: prefix, hyphen OR space -- "Alola-Rattfratz" and "Alola Vulpix"
//       are BOTH real for the same family; Galar/Paldea confirmed
//       hyphen-only in every real example ("Galar-Mauzi", "Paldea-Tauros"),
//       Hisui confirmed both ("Hisui-Fukano", "Hisui Voltobal").
//   es/pt: suffix -- "<Species> de Alola", "<Species> de Galar", etc.
//   it: suffix -- "<Species> di Alola", "<Species> di Galar", etc.
//   fr: suffix -- "<Species> d'Alola"/"<Species> d'Alola" (elided "de" +
//       vowel; BOTH straight U+0027 and curly U+2019 apostrophes are real,
//       confirmed live), "<Species> de Galar"/"de Hisui"/"de Paldea"
//       (un-elided "de" + consonant).
//   ja: prefix, space-separated, katakana marker fused via a plain ASCII
//       space (U+0020, confirmed via codepoint dump, not an ideographic
//       space) -- "アローラ コラッタ", "ガラル ポニータ".
//   zh-tw: prefix, space-separated -- "阿羅拉 小拉達", "伽勒爾 喵喵",
//       "洗翠 卡蒂狗", "帕底亞 肯泰羅". One real card doubles the space
//       ("阿羅拉  小拳石"), so the separator is \s+, not a single \s.
//   zh-cn: confirmed ONLY for Alolan ("阿羅拉 地鼠") and Paldean
//       ("帕底亞 肯泰羅") -- both reuse the same (Traditional-character)
//       tokens as zh-tw, an artifact of the supplemental-database backfill
//       this language's data leans on. Zero Galarian or Hisuian card in
//       the zh-cn database carries ANY discoverable region marker (e.g.
//       Galarian Yamask's zh-cn name is bare "哭哭面具", no tag at all) --
//       deliberately NOT guessed at; see data/regional-audit.md.
//   th: confirmed for Galarian ("กาลาร์ เนียส"), Hisuian ("ฮิซุย การ์ดี"),
//       and Paldean ("พัลเดีย เคนเทารอส"), prefix + space. Zero Alolan
//       marker exists ANYWHERE in the th database (830 unique names
//       searched for every plausible transliteration) -- every Alolan-form
//       card in Thai just uses the bare species name. Not guessed at.
//   id: confirmed for Paldean only, reusing the English word verbatim --
//       "Paldean Tauros", "Paldean Wooper". "Alolan" appears in the id
//       database exactly twice, both inside English-language fusion card
//       names ("Raichu & Alolan Raichu", "Muk & Alolan Muk"), so that
//       shape is included too. Zero Galarian or Hisuian marker of any kind
//       exists in id -- not guessed at.
//   ko: zero discoverable marker for any of the four families anywhere in
//       the (very sparse -- 124 dex entries total) ko database. Not
//       guessed at; ko support is simply absent from this matcher.
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
    // th: no marker exists anywhere in the database -- deliberately absent.
    // ko: no marker discoverable for any family -- deliberately absent.
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
    // zh-cn: no Galarian marker discoverable anywhere -- deliberately absent.
    // id, ko: no marker discoverable -- deliberately absent.
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
    // zh-cn: no Hisuian marker discoverable anywhere -- deliberately absent.
    // id, ko: no marker discoverable -- deliberately absent.
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
    // ko: no marker discoverable -- deliberately absent.
  ],
};

export function isRegionalCardName(family: RegionalFamily, speciesToken: string, cardName: string): boolean {
  const token = escapeRegExp(speciesToken);
  return REGIONAL_LOCALE_MARKERS[family].some((marker) => marker.build(token).test(cardName));
}
