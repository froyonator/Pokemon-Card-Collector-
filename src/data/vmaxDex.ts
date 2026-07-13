// src/data/vmaxDex.ts
//
// App-side mirror of scripts/carddata/src/data/vmaxDex.ts (the data
// pipeline's canonical VMAX/Gigantamax list). App code can't import across
// the scripts/carddata package boundary, so this is a hand-kept copy of the
// same 81-form roster, ordering, and card-name matcher patterns -- if the
// pipeline module's VMAX_DEX or VMAX_NAME_PATTERNS ever change, mirror the
// change here too. Structured exactly like megaDex.ts, one rung down: no
// X/Y/Z-style variant split table is needed here (see cardsForVmaxEntry's own
// comment), just two baseDex numbers (Urshifu, Calyrex) that need a plain
// substring split between their two named forms.
//
// Every VMAX form gets a SYNTHETIC dex number (VMAX_DEX_BASE + release
// order) so it flows through every existing dexEntries/tile/ownership code
// path (owned map, wishlist, binders) completely unchanged -- see
// generations.ts's 'vmax' Generation entry, which is what actually wires
// these into the app's generation selector.

export const VMAX_DEX_BASE = 21000;

export interface VmaxDexEntry {
  /** Synthetic dex number: VMAX_DEX_BASE + release order (21001-21081). */
  number: number;
  /** The real national dex number of the base species (e.g. 6 for Charizard). */
  baseDexNumber: number;
  /** Display name, e.g. "Gigantamax Charizard" / "Dynamax Vaporeon". */
  name: string;
  /** Species name as used on the card, no "VMAX" suffix. */
  speciesLabel: string;
  /** Sprite-archive/name-matching slug, e.g. "charizard-gmax". */
  slug: string;
  /** Sprite file stem under public/sprites/gmax/{static,animated}/. Same
   * value as `slug` today -- kept as its own field for the same reason
   * megaDex.ts's spriteSlug is: in case the sprite archive's filename
   * convention and the name-matching slug ever diverge. A plain-Dynamax
   * entry's slug is never looked up against the gmax sprite host at all --
   * see sprites.ts's vmaxSpriteUrls, which falls back to the base species'
   * own sprite for those. */
  spriteSlug: string;
  hasGigantamax: boolean;
  order: number;
}

// Each row: [slug, baseDex, speciesLabel, hasGigantamax]. Grouped by the
// English TCG set that first printed a VMAX card for that species -- see
// the pipeline module's own header comment for the full derivation.
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
  ['toxtricity-amped-gmax', 849, 'Toxtricity', true],
  ['copperajah-gmax', 879, 'Copperajah', true],
  // Inteleon: hardcoded to the real dex number (818), not the buggy 888
  // some card records carry -- see the pipeline module's own comment.
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
  // Appletun: a real Gigantamax form with no VMAX card of its own in any
  // language's database -- see the pipeline module's own comment.
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

function buildEntries(): VmaxDexEntry[] {
  const entries: VmaxDexEntry[] = [];
  let order = 1;
  for (const wave of ALL_WAVES) {
    for (const [slug, baseDexNumber, speciesLabel, hasGigantamax] of wave) {
      entries.push({
        number: VMAX_DEX_BASE + order,
        baseDexNumber,
        name: `${hasGigantamax ? 'Gigantamax' : 'Dynamax'} ${speciesLabel}`,
        speciesLabel,
        slug,
        spriteSlug: slug,
        hasGigantamax,
        order,
      });
      order += 1;
    }
  }
  return entries;
}

export const VMAX_DEX_ENTRIES: VmaxDexEntry[] = buildEntries();

const VMAX_DEX_ENTRY_BY_NUMBER = new Map<number, VmaxDexEntry>(
  VMAX_DEX_ENTRIES.map((entry) => [entry.number, entry])
);

export function isVmaxDexNumber(dexNumber: number): boolean {
  return VMAX_DEX_ENTRY_BY_NUMBER.has(dexNumber);
}

export function vmaxDexEntryByNumber(dexNumber: number): VmaxDexEntry | undefined {
  return VMAX_DEX_ENTRY_BY_NUMBER.get(dexNumber);
}

export function vmaxDexEntriesForBaseDex(baseDexNumber: number): VmaxDexEntry[] {
  return VMAX_DEX_ENTRIES.filter((entry) => entry.baseDexNumber === baseDexNumber);
}

// --- Card-name matcher patterns (mirrors the pipeline's vmax-audit.md) ----
export interface VmaxNamePattern {
  id: string;
  re: RegExp;
  description: string;
}

export const VMAX_NAME_PATTERNS: VmaxNamePattern[] = [
  {
    id: 'latin-vmax',
    re: /[ -]VMAX$/,
    description: 'Western "<Species> VMAX" cards (English/European languages), space or hyphen separated.',
  },
  {
    id: 'cjk-fused-vmax',
    re: /[㐀-鿿぀-ヿ]VMAX/,
    description: 'CJK "<Species>VMAX" cards (Chinese), species fused directly to VMAX with no separator.',
  },
];

export function isVmaxCardName(name: string): boolean {
  return VMAX_NAME_PATTERNS.some((p) => p.re.test(name));
}

// --- Per-entry filtering (Urshifu Style / Calyrex Rider splitting) -------
//
// Unlike Mega, species scoping alone resolves every VMAX entry except two:
// Urshifu (dex 892, Single Strike / Rapid Strike) and Calyrex (dex 898, Ice
// Rider / Shadow Rider) each print TWO separate VMAX cards sharing one base
// dex, and -- confirmed live against every real name in
// public/data/cards/en/gen8.json's dex-892 and dex-898 buckets ("Single
// Strike Urshifu VMAX", "Rapid Strike Urshifu VMAX", "Ice Rider Calyrex
// VMAX", "Shadow Rider Calyrex VMAX") -- the distinguishing word (the style/
// rider name) always appears verbatim in the card's own name, just in the
// opposite word order from this roster's speciesLabel ("Urshifu (Single
// Strike Style)" vs. card name "Single Strike Urshifu VMAX"). No lookup
// table of curated per-print overrides is needed the way Mega's
// VARIANT_OVERRIDES is: every observed card for both species already
// carries an explicit, unambiguous token.
function siblingVariantToken(entry: VmaxDexEntry): string | null {
  const match = entry.speciesLabel.match(/\(([^)]+)\)$/);
  if (!match) return null;
  return match[1].replace(/\s+Style$/, '').trim();
}

export function cardMatchesVmaxEntry(cardName: string, entry: VmaxDexEntry): boolean {
  if (!isVmaxCardName(cardName)) return false;
  const siblings = vmaxDexEntriesForBaseDex(entry.baseDexNumber);
  if (siblings.length <= 1) return true;
  const token = siblingVariantToken(entry);
  // No extractable token: fall back to showing on every sibling tile rather
  // than silently hiding the card everywhere, mirroring Mega's own
  // ambiguous-token fallback (see AMBIGUOUS_SHOWS_ON_EVERY_VARIANT_BASE_DEX
  // in megaDex.ts). Not reachable for Urshifu/Calyrex today -- both
  // speciesLabels always carry a parenthetical -- but a future multi-form
  // VMAX species added without one degrades safely instead of throwing.
  if (token === null) return true;
  return cardName.toLowerCase().includes(token.toLowerCase());
}

export function cardsForVmaxEntry<T extends { name: string }>(cards: T[], entry: VmaxDexEntry): T[] {
  return cards.filter((card) => cardMatchesVmaxEntry(card.name, entry));
}
