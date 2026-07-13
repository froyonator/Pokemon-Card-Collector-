// scripts/carddata/src/normalizeRarities.ts
//
// Canonicalizes CardRecord.rarity across every static database file under
// public/data/cards/ (both the Gen1 flat <lang>.json files and the
// Gen2-9 <lang>/gen<N>.json files).
//
// Several harvested languages (zh-cn, zh-tw, th, id, ja) carry `rarity` as a
// short site-style code inherited straight from the wiki setlist template's
// rarity column ("C", "U", "R", "SR", "AR", ...) rather than one of the
// canonical English-style strings this app's rarity groups
// (src/data/defaultRarityGroups.ts) actually match against, and a card
// whose rarity matches NO group is invisible everywhere. Confirmed live:
// zh-cn (2,511 Gen1 cards) showed nothing at all in the Picker, not even a
// Chinese-exclusive Ponyta full art, because its harvested rarity ("AR")
// matched no group's rarity list -- not even the inactive-by-default
// 'standard-prints' catch-all, since that group only lists the fully
// spelled-out "Common"/"Uncommon"/"Rare"/"Unknown"/"None".
//
// CANONICAL_RARITIES below is the target vocabulary: every literal `rarity`
// value this app's own English (en) database already uses, gathered by
// enumerating public/data/cards/en.json + en/gen2..9.json, plus the handful
// of rarity-group member strings (src/data/defaultRarityGroups.ts) that
// don't yet appear on any currently-held en card ('Full Art Trainer'). This
// module never invents a NEW canonical spelling -- it only maps observed
// non-canonical values onto that existing set.
//
// RARITY_ALIASES maps every OTHER observed raw value onto the closest
// canonical spelling. Two flavors:
//   - Case/spacing/word-order variants of an already-canonical spelling
//     (e.g. "Illustration Rare" -> "Illustration rare", "Rare Radiant" ->
//     "Radiant Rare"): unambiguous, purely cosmetic.
//   - Site-style rarity CODES (C/U/R/RR/AR/SR/SAR/UR/HR/CHR/CSR/TGH/TGV/
//     TGS/SSR/PR/S, plus the small "Gem <code>" family) inherited from the
//     wiki setlist template's rarity column. These map onto the closest
//     EXISTING special-art tier this app already groups by, per each
//     entry's own comment -- the print-era ladder these codes describe
//     (Sun & Moon / Sword & Shield / Scarlet & Violet) shifted which code
//     means what release over release, so treat these as best-available
//     approximations, not certainties.
//
// Any raw value with no canonical match and no alias entry becomes
// "Unknown" (itself canonical, matched by the 'standard-prints' group) and
// is reported by the CLI below so a human can extend the mapping.
//
// A SECOND, separate bug of the same shape affects the five European
// languages: fr/de/es/it/pt store `rarity` as the primary source's own
// LOCALIZED word for it ("Häufig", "Comune", "Peu Commune", ...) on 53-93%
// of records in each language, none of which match any canonical spelling
// or rarity-group member either. EUROPEAN_RARITY_DICTIONARIES /
// deriveLocalizedRarityAliases() below fix this the same way, but sourced
// from the primary source's OWN translation dictionaries
// (data/bulk-export/meta/translations/<lang>.json's `rarity` object --
// gitignored scratch data, not committed, see this package's .gitignore)
// rather than hand-translated, so the mapping is authoritative instead of
// guessed. See that section's own comment for the derivation and for a few
// upstream-dictionary inconsistencies it has to route around.
//
// DESIGN CHOICE -- canonical STORAGE, not localized display: `rarity` is
// shown to users verbatim in two places (Picker.tsx's card-row caption,
// CardZoomOverlay.tsx's zoom caption), so converting fr/de/es/it/pt records
// to the English canonical spelling does change what a French/German/etc.
// user reads there -- "Häufig" becomes "Common". The alternative, leaving
// the localized word in `rarity`, keeps that label correct but leaves the
// SAME cards invisible to every rarity-group view, exactly like the
// Asian-language bug above (a card whose rarity matches no group is
// invisible everywhere, not just mislabeled). Invisible is strictly worse
// than a foreign-language label reading in English, so canonical storage
// wins for now. The right long-term end state is canonical storage PLUS a
// separate localized-DISPLAY lookup (rarity key -> localized word, rendered
// instead of the raw stored string) so both correctness and localization
// hold at once -- that display layer doesn't exist yet and is out of scope
// here; this pass only fixes storage, same as the Asian-language pass did.
//
// Run via: npm run normalize-rarities -- [--write] [--lang <code>]
// Dry-run by default (reports only); pass --write to persist changes.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirrors the app's CardRecord shape (see src/types/index.ts) -- duplicated
// on purpose, same as augmentFromSupplemental.ts/purgeDigitalSets.ts, since
// this package has no build-time link to the app's src tree.
export interface CardRecord {
  id: string;
  name: string;
  dexNumber: number;
  setId: string;
  setName: string;
  localId: string;
  rarity: string;
  imageBase: string;
  language: string;
  hostedThumbUrl?: string;
  hostedFullUrl?: string;
  [key: string]: unknown;
}

export type CardDatabase = Record<string, CardRecord[]>;

// --- Canonical vocabulary ----------------------------------------------------

export const CANONICAL_RARITIES: readonly string[] = [
  // Universal placeholders.
  'Unknown',
  'None',
  // Ordinary base-print tiers (defaultRarityGroups.ts's 'standard-prints').
  'Common',
  'Uncommon',
  'Rare',
  // Full-art tier ('full-art' group).
  'Ultra Rare',
  // Alt-art / illustration tiers ('alt-art' group).
  'Illustration rare',
  'Special illustration rare',
  'Full Art Trainer',
  // Rainbow / gold secret tiers ('rainbow-gold' group).
  'Secret Rare',
  'Hyper rare',
  'Mega Hyper Rare',
  'Amazing Rare',
  'Black White Rare',
  // Every other literal en's own harvested/primary-source records use --
  // not yet claimed by any rarity group above, but still this app's real,
  // already-established spelling for that print.
  'Promo',
  'Rare Holo',
  'Classic Collection',
  'Double rare',
  'Double Rare',
  'Holo Rare',
  'Radiant Rare',
  'Holo Rare V',
  'Shiny rare',
  'Rare Holo LV.X',
  'Holo Rare VSTAR',
  'Holo Rare VMAX',
  'Shiny rare VMAX',
  'Ultra-Rare Rare',
  'Rare VMAX',
  'Shiny Ultra Rare',
  'Common Holo',
  'Rare PRIME',
  'Uncommon Holo',
  'Shiny rare V',
  'Rare VSTAR',
  'LEGEND',
];

const CANONICAL_SET = new Set(CANONICAL_RARITIES);

// --- Alias table --------------------------------------------------------------

export const RARITY_ALIASES: Record<string, string> = {
  // --- Base tiers (single/doubled-letter codes) ---
  C: 'Common',
  U: 'Uncommon',
  R: 'Rare',
  RR: 'Double rare',
  // Pre-Scarlet & Violet ladder's top rare slot, before AR/SR existed;
  // closest existing full-art tier.
  RRR: 'Ultra Rare',

  // --- Illustration-rare family ('alt-art' group) ---
  AR: 'Illustration rare', // "Art Rare" -- S&V-era non-holo big-illustration rare.
  CHR: 'Illustration rare', // "Character Rare" -- Sword & Shield-era alt-art-of-character insert.
  TGH: 'Illustration rare', // "Trainer Gallery Holo Rare" -- alt-art insert subset.
  SAR: 'Special illustration rare', // "Special Art Rare" -- S&V-era gold-textured full-bleed illustration.
  CSR: 'Special illustration rare', // "Character Super Rare" -- Sword & Shield-era top character alt art.
  SSR: 'Special illustration rare', // "Super Special Rare" -- top illustration tier; closest existing bucket.

  // --- Full-art tier ('full-art' group) ---
  SR: 'Ultra Rare', // "Super Rare" -- S&V-era full-art character rare; EN equivalent is "Ultra Rare".
  TGV: 'Ultra Rare', // "Trainer Gallery Ultra Rare".
  'Rare Ultra': 'Ultra Rare',

  // --- Rainbow / gold secret tier ('rainbow-gold' group) ---
  // NOTE: JP/CN "UR" ("Ultra Rare", gold Trainer/Energy secret) is a
  // DIFFERENT tier than the EN literal "Ultra Rare" (full-art, above) --
  // maps to the EN rainbow/gold bucket instead to avoid conflating them.
  UR: 'Secret Rare',
  HR: 'Hyper rare', // "Hyper Rare" -- Sword & Shield-era rainbow/gold secret.
  TGS: 'Secret Rare', // "Trainer Gallery Secret Rare".
  'Rare Secret': 'Secret Rare',
  'Rare Rainbow': 'Secret Rare',

  // --- Word-order variant of an already-canonical spelling ---
  'Rare Radiant': 'Radiant Rare',

  // --- Case-only variants of an already-canonical spelling ---
  'Illustration Rare': 'Illustration rare',
  'Special Illustration Rare': 'Special illustration rare',
  'Shiny Rare': 'Shiny rare',
  'Hyper Rare': 'Hyper rare',

  // --- Promo / shiny / no-rarity placeholders ---
  PR: 'Promo',
  S: 'Shiny rare',
  '-': 'None',

  // --- "Gem <code>" prefixed base tiers (small handful of legacy cards) ---
  'Gem C': 'Common',
  'Gem U': 'Uncommon',
  'Gem R': 'Rare',
  'Gem RR': 'Double rare',
  'Gem RRR': 'Ultra Rare',

  // GGH / GGU / K deliberately left unmapped: genuinely ambiguous, low
  // count (<=5 occurrences each, id/ja only) -- fall through to "Unknown"
  // and get reported so a human can investigate and extend this table.
};

// --- European localized-rarity dictionaries (fr/de/es/it/pt) ---------------
//
// Verbatim excerpts of the primary source's own per-language translation
// dictionaries (data/bulk-export/meta/translations/<lang>.json's `rarity`
// object -- confirmed to exist at that path for exactly these five
// languages; gitignored scratch data, not committed, per this package's own
// .gitignore). Each language's object is keyed canonical-English rarity ->
// that language's word for it, the SAME direction the upstream dictionary
// itself uses. Copied by hand from those files at the time this table was
// added; if the primary source's translations change, re-copy from that
// same path rather than hand-translating a fix here.
//
// A handful of keys the upstream dictionary carries are Pokemon TCG
// POCKET-only vocabulary this app has no canonical rarity for at all ("One
// Star", "Two Diamond", "Crown", ...) -- omitted here entirely. (They also
// look like a translation bug in the upstream dictionary itself: fr/de/it/pt
// all give literal French text for these keys, e.g. "Une Étoile" -- another
// reason to leave them out rather than trust them.)
export const EUROPEAN_RARITY_DICTIONARIES: Record<string, Record<string, string>> = {
  fr: {
    'ACE SPEC Rare': 'HIGH-TECG rare',
    'Amazing Rare': 'Magnifique',
    'Classic Collection': 'Collection Classique',
    Common: 'Commune',
    'Double rare': 'Double rare',
    'Full Art Trainer': 'Dresseur Full Art',
    'Holo Rare': 'Holo Rare',
    'Holo Rare V': 'Holo Rare V',
    'Holo Rare VMAX': 'Holo Rare VMAX',
    'Holo Rare VSTAR': 'Holo Rare VSTAR',
    'Hyper rare': 'Hyper rare',
    'Illustration rare': 'Illustration rare',
    LEGEND: 'LÉGENDE',
    None: 'Sans Rareté',
    'Radiant Rare': 'Radieux Rare',
    Rare: 'Rare',
    'Rare Holo': 'Rare Holo',
    'Rare Holo LV.X': 'Rare Holo LV.X',
    'Rare PRIME': 'Rare Prime',
    'Secret Rare': 'Magnifique rare',
    'Shiny rare': 'Shiny rare',
    'Shiny rare V': 'Shiny rare V',
    'Shiny rare VMAX': 'Shiny rare VMAX',
    'Shiny Ultra Rare': 'Chromatique ultra rare',
    'Special illustration rare': 'Illustration spéciale rare',
    'Ultra Rare': 'Ultra Rare',
    Uncommon: 'Peu Commune',
    'Black White Rare': 'Rare Noir Blanc',
    'Mega Hyper Rare': 'Méga Hyper Rare',
    Promo: 'Promo',
  },
  de: {
    'ACE SPEC Rare': 'ASS-KLASSE',
    'Amazing Rare': 'Atemberaubend',
    'Classic Collection': 'Klassische Kollektion',
    Common: 'Häufig',
    'Double rare': 'Doppelselten',
    'Full Art Trainer': 'Vollkunsttrainer',
    'Holo Rare': 'Holografisch Selten',
    'Holo Rare V': 'Holografisch Selten V',
    'Holo Rare VMAX': 'Holografisch Selten VMAX',
    'Holo Rare VSTAR': 'Holografisch Selten VSTAR',
    'Hyper rare': 'Hyperselten',
    'Illustration rare': 'Selten, Illustration',
    LEGEND: 'LEGENDE',
    None: 'Keine',
    'Radiant Rare': 'Selten, Strahlend',
    Rare: 'Selten',
    'Rare Holo': 'Selten, Holografisch',
    'Rare Holo LV.X': 'Selten, Holografisch LV.X',
    'Rare PRIME': 'selten, Primus',
    'Secret Rare': 'Versteckt Selten',
    'Shiny rare': 'Shiny rare',
    'Shiny rare V': 'Shiny rare V',
    'Shiny rare VMAX': 'Shiny rare VMAX',
    'Shiny Ultra Rare': 'ultraselten, Schillernd',
    'Special illustration rare': 'Selten, besondere Illustration',
    'Ultra Rare': 'Ultra Selten',
    Uncommon: 'Ungewöhnlich',
    'Black White Rare': 'Schwarz-Weiß Selten',
    'Mega Hyper Rare': 'Mega Hyper Selten',
    Promo: 'Promo',
  },
  es: {
    'ACE SPEC Rare': 'Rara AS TÁCTICO',
    'Amazing Rare': 'Increíbles',
    'Classic Collection': 'Colección Clásica',
    Common: 'Común',
    'Double rare': 'Rara Doble',
    'Full Art Trainer': 'Entrenador de arte completo',
    'Holo Rare': 'Holo Rara',
    'Holo Rare V': 'Holo Rara V',
    'Holo Rare VMAX': 'Holo Rara VMAX',
    'Holo Rare VSTAR': 'Holo Rara VSTAR',
    'Hyper rare': 'Rara Híper',
    'Illustration rare': 'Rara Ilustración',
    LEGEND: 'LEYENDA',
    None: 'Ninguno',
    'Radiant Rare': 'Rara Radiante',
    Rare: 'Rara',
    'Rare Holo': 'Rara Holo',
    'Rare Holo LV.X': 'Rara Holo LV.X',
    'Rare PRIME': 'Rara Primigenia',
    'Secret Rare': 'Rara Secreta',
    'Shiny rare': 'Shiny rare',
    'Shiny rare V': 'Shiny rare V',
    'Shiny rare VMAX': 'Shiny rare VMAX',
    'Shiny Ultra Rare': 'Rara Ultra Variocolor',
    'Special illustration rare': 'Rara Ilustración Especial',
    'Ultra Rare': 'Ultra Rara',
    Uncommon: 'Uncommon',
    'Black White Rare': 'Rara Blanca y Negra',
    'Mega Hyper Rare': 'Mega Hiper Rara',
    Promo: 'Promo',
  },
  it: {
    'ACE SPEC Rare': 'rara ASSO TATTICO',
    'Amazing Rare': 'Policrome',
    'Classic Collection': 'Collezione Classica',
    Common: 'Comune',
    'Double rare': 'Rara doppia',
    'Full Art Trainer': "Allenatore d'arte completa",
    'Holo Rare': 'Olografica Rara',
    'Holo Rare V': 'Olografica Rara V',
    'Holo Rare VMAX': 'Olografica Rara VMAX',
    'Holo Rare VSTAR': 'Olografica Rara VSTAR',
    'Hyper rare': 'Rara iper',
    'Illustration rare': 'Rara illustrazione',
    LEGEND: 'LEGGENDA',
    None: 'Nessuna',
    'Radiant Rare': 'Rara Lucente',
    Rare: 'Rara',
    'Rare Holo': 'Rara Olografica',
    'Rare Holo LV.X': 'Rara Olografica LV.X',
    'Rare PRIME': 'Super rara',
    'Secret Rare': 'Segreto rara',
    'Shiny rare': 'Shiny rare',
    'Shiny rare V': 'Shiny rare V',
    'Shiny rare VMAX': 'Shiny rare VMAX',
    'Shiny Ultra Rare': 'ultrarara cromatica',
    'Special illustration rare': 'Rara illustrazione speciale',
    'Ultra Rare': 'Ultrarara',
    Uncommon: 'Non comune',
    'Black White Rare': 'Rara Bianco e Nero',
    'Mega Hyper Rare': 'Mega Iper Raro',
    Promo: 'Promo',
  },
  pt: {
    'ACE SPEC Rare': 'ACE SPEC Raro',
    'Amazing Rare': 'Raras Incríveis',
    'Classic Collection': 'Coleção Clásica',
    Common: 'Comum',
    'Double rare': 'Rara Dupla',
    'Full Art Trainer': 'Arte Completa de Treinador',
    'Holo Rare': 'Rara Holo',
    'Holo Rare V': 'Rara Holo V',
    'Holo Rare VMAX': 'Rara Holo VMAX',
    'Holo Rare VSTAR': 'Rara Holo VSTAR',
    'Hyper rare': 'Hiper rara',
    'Illustration rare': 'Ilustração Rara',
    LEGEND: 'LEGEND',
    None: 'None',
    'Radiant Rare': 'Rara Radiante',
    Rare: 'Rara',
    'Rare Holo': 'Rara Holo',
    'Rare Holo LV.X': 'Rara Holo LV.X',
    'Rare PRIME': 'Rara Prime',
    'Secret Rare': 'Rare Secreta',
    'Shiny rare': 'Shiny rara',
    'Shiny rare V': 'Shiny rara V',
    'Shiny rare VMAX': 'Shiny rara VMAX',
    'Shiny Ultra Rare': 'Brilhante Ultra Rara',
    'Special illustration rare': 'Ilustração Rara Especial',
    'Ultra Rare': 'Ultra Rara',
    Uncommon: 'Incomum',
    'Black White Rare': 'Rara Preto e Branco',
    'Mega Hyper Rare': 'Mega Hiper Raro',
    Promo: 'Promo',
  },
};

export interface LocalizedAliasConflict {
  /** The raw localized word two languages disagree about. */
  raw: string;
  /** The canonical value it was actually mapped to (first language wins). */
  keptCanonical: string;
  keptLanguage: string;
  /** The canonical value a LATER language wanted instead; dropped, not applied. */
  droppedCanonical: string;
  droppedLanguage: string;
}

export interface LocalizedAliasDerivation {
  aliases: Record<string, string>;
  conflicts: LocalizedAliasConflict[];
}

/**
 * Inverts EUROPEAN_RARITY_DICTIONARIES (canonical -> localized, per
 * language) into raw -> canonical, the direction normalizeRarity() needs.
 * A dictionary entry is skipped when its canonical key isn't one this app
 * actually tracks (CANONICAL_RARITIES -- e.g. the Pocket-only vocabulary
 * already excluded from the tables above, plus any future dictionary key
 * this app has no rarity for yet), or when its localized word is empty or
 * already equal to a canonical spelling (self-consistent, needs no alias).
 *
 * Exactly one real collision exists across the five current dictionaries:
 * pt's own dictionary maps BOTH "Rare Holo" and "Holo Rare" to the literal
 * string "Rara Holo" (an upstream inconsistency, not introduced here) --
 * es's unambiguous "Rare Holo" -> "Rara Holo" entry is processed first (see
 * EUROPEAN_RARITY_DICTIONARIES's fr/de/es/it/pt key order) and wins;
 * whichever entry loses a collision is reported in `conflicts` instead of
 * silently overwriting the winner, so a human can revisit it if it matters.
 */
export function deriveLocalizedRarityAliases(
  dictionaries: Record<string, Record<string, string>>
): LocalizedAliasDerivation {
  const aliases: Record<string, string> = {};
  const wonBy: Record<string, string> = {};
  const conflicts: LocalizedAliasConflict[] = [];

  for (const [language, dict] of Object.entries(dictionaries)) {
    for (const [canonical, localized] of Object.entries(dict)) {
      if (!CANONICAL_SET.has(canonical)) continue;
      const raw = (localized ?? '').trim();
      if (raw === '' || CANONICAL_SET.has(raw)) continue;

      const existing = aliases[raw];
      if (existing === undefined) {
        aliases[raw] = canonical;
        wonBy[raw] = language;
      } else if (existing !== canonical) {
        conflicts.push({
          raw,
          keptCanonical: existing,
          keptLanguage: wonBy[raw],
          droppedCanonical: canonical,
          droppedLanguage: language,
        });
      }
    }
  }

  return { aliases, conflicts };
}

export const { aliases: LOCALIZED_RARITY_ALIASES, conflicts: LOCALIZED_RARITY_ALIAS_CONFLICTS } =
  deriveLocalizedRarityAliases(EUROPEAN_RARITY_DICTIONARIES);

// Single lookup table normalizeRarity() actually consults: the hand-curated
// site-code table plus the dictionary-derived European table. The two are
// disjoint by construction (site codes are short all-caps tokens harvested
// from an unrelated wiki template column; European words come from a
// completely different vocabulary) -- confirmed no key overlap when this
// was added -- so merge order doesn't matter for any value that exists
// today, but RARITY_ALIASES is spread last so a future hand-added entry
// there would win over the generated table if the two ever did collide.
const ALL_ALIASES: Record<string, string> = { ...LOCALIZED_RARITY_ALIASES, ...RARITY_ALIASES };

/**
 * Maps one raw `rarity` value onto this app's canonical vocabulary.
 * Already-canonical values (including "" -> effectively absent) pass
 * through unchanged; anything else is looked up in RARITY_ALIASES; anything
 * with neither becomes "Unknown".
 */
export function normalizeRarity(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return 'Unknown';
  if (CANONICAL_SET.has(trimmed)) return trimmed;
  return ALL_ALIASES[trimmed] ?? 'Unknown';
}

// --- Batch application over one database file ------------------------------

export interface RarityChangeBucket {
  rawRarity: string;
  mappedTo: string;
  count: number;
  /** True when rawRarity had no canonical match and no alias entry, so it fell back to "Unknown". */
  wasUnmapped: boolean;
}

export interface RarityNormalizationOutcome {
  total: number;
  changed: number;
  /** Only rarities that actually changed, sorted by count descending. */
  buckets: RarityChangeBucket[];
}

/**
 * Normalizes every card's `rarity` in `database`, MUTATING IT IN PLACE
 * (matching every other in-place transform in this pipeline -- see
 * mergeHarvest.ts / purgeDigitalSets.ts). Returns per-raw-value change
 * counts for reporting; a card whose rarity is already canonical is left
 * untouched and does not appear in `buckets`.
 */
export function normalizeDatabaseRarities(database: CardDatabase): RarityNormalizationOutcome {
  let total = 0;
  let changed = 0;
  const changesByRaw = new Map<string, { mappedTo: string; count: number }>();

  for (const bucket of Object.values(database)) {
    if (!Array.isArray(bucket)) continue;
    for (const card of bucket) {
      if (!card) continue;
      total++;
      const raw = card.rarity ?? '';
      const canonical = normalizeRarity(raw);
      if (canonical !== raw) {
        changed++;
        const key = raw === '' ? '(empty)' : raw;
        const entry = changesByRaw.get(key) ?? { mappedTo: canonical, count: 0 };
        entry.count++;
        changesByRaw.set(key, entry);
        card.rarity = canonical;
      }
    }
  }

  const buckets: RarityChangeBucket[] = Array.from(changesByRaw.entries())
    .map(([rawRarity, { mappedTo, count }]) => ({
      rawRarity,
      mappedTo,
      count,
      wasUnmapped: mappedTo === 'Unknown',
    }))
    .sort((a, b) => b.count - a.count);

  return { total, changed, buckets };
}

// --- File discovery (mirrors purgeDigitalSets.ts's own copy) ---------------

/** Recursively collects every `.json` file under `dir` (public/data/cards/ -- both <lang>.json and <lang>/gen<N>.json share this one shape). */
async function findDatabaseFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findDatabaseFiles(fullPath)));
    } else if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Derives the language code from a database file path: "zh-cn.json" -> "zh-cn", "zh-cn/gen2.json" -> "zh-cn". */
export function languageForFile(cardsDir: string, filePath: string): string {
  const rel = path.relative(cardsDir, filePath);
  const first = rel.split(path.sep)[0];
  return first.endsWith('.json') ? first.slice(0, -'.json'.length) : first;
}

export interface FileNormalizationResult {
  file: string;
  language: string;
  outcome: RarityNormalizationOutcome;
}

/** Normalizes one static database file's rarities in memory; only writes back to disk when `write` is true AND something actually changed. */
export async function normalizeDatabaseFile(
  cardsDir: string,
  filePath: string,
  write: boolean
): Promise<FileNormalizationResult> {
  const database = JSON.parse(await readFile(filePath, 'utf8')) as CardDatabase;
  const outcome = normalizeDatabaseRarities(database);
  if (write && outcome.changed > 0) {
    await writeFile(filePath, JSON.stringify(database), 'utf8');
  }
  return { file: filePath, language: languageForFile(cardsDir, filePath), outcome };
}

/** Normalizes every static database file under `cardsDir`, optionally restricted to `languages`. */
export async function normalizeAllDatabaseFiles(
  cardsDir: string,
  options: { write: boolean; languages?: string[] } = { write: false }
): Promise<FileNormalizationResult[]> {
  const files = (await findDatabaseFiles(cardsDir)).sort();
  const languageFilter = options.languages && options.languages.length > 0 ? new Set(options.languages) : null;
  const results: FileNormalizationResult[] = [];
  for (const file of files) {
    const language = languageForFile(cardsDir, file);
    if (languageFilter && !languageFilter.has(language)) continue;
    results.push(await normalizeDatabaseFile(cardsDir, file, options.write));
  }
  return results;
}

// --- CLI -------------------------------------------------------------------

interface CliArgs {
  write: boolean;
  languages: string[];
}

function parseArgs(argv: string[]): CliArgs {
  let write = false;
  const languages: string[] = [];
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--write') {
      write = true;
      continue;
    }
    if (flag === '--lang') {
      const value = args.shift();
      if (!value) throw new Error('--lang requires a value');
      languages.push(value);
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  return { write, languages };
}

async function main(): Promise<void> {
  const { write, languages } = parseArgs(process.argv.slice(2));
  const cardsDir = path.resolve(process.cwd(), '..', '..', 'public', 'data', 'cards');

  console.log(
    `Normalizing rarities under ${cardsDir}${languages.length > 0 ? ` (languages: ${languages.join(', ')})` : ''}${write ? ' [WRITE]' : ' [dry-run]'}...`
  );

  const results = await normalizeAllDatabaseFiles(cardsDir, { write, languages });

  // Aggregate per language across its gen1 flat file + gen2-9 files.
  const perLanguage = new Map<string, { total: number; changed: number; buckets: Map<string, RarityChangeBucket> }>();
  for (const { file, language, outcome } of results) {
    const rel = path.relative(cardsDir, file);
    if (outcome.changed > 0) {
      console.log(`  ${rel}: ${outcome.changed} of ${outcome.total} record(s) changed`);
    }

    const agg = perLanguage.get(language) ?? { total: 0, changed: 0, buckets: new Map() };
    agg.total += outcome.total;
    agg.changed += outcome.changed;
    for (const bucket of outcome.buckets) {
      const existing = agg.buckets.get(bucket.rawRarity);
      if (existing) {
        existing.count += bucket.count;
      } else {
        agg.buckets.set(bucket.rawRarity, { ...bucket });
      }
    }
    perLanguage.set(language, agg);
  }

  console.log('\nPer-language summary:');
  for (const language of Array.from(perLanguage.keys()).sort()) {
    const agg = perLanguage.get(language)!;
    console.log(`  ${language}: ${agg.changed} of ${agg.total} record(s) changed`);
    const buckets = Array.from(agg.buckets.values()).sort((a, b) => b.count - a.count);
    for (const bucket of buckets) {
      const flag = bucket.wasUnmapped ? '  [UNMAPPED -> Unknown, please review]' : '';
      console.log(`    "${bucket.rawRarity}" -> "${bucket.mappedTo}": ${bucket.count}${flag}`);
    }
  }

  const grandTotal = Array.from(perLanguage.values()).reduce((n, a) => n + a.changed, 0);
  console.log(`\n${grandTotal} record(s) changed across ${results.length} file(s).${write ? '' : ' (dry-run -- nothing written; pass --write to persist)'}`);

  if (LOCALIZED_RARITY_ALIAS_CONFLICTS.length > 0) {
    console.log('\nEuropean dictionary conflicts (raw value ambiguous between languages; first-seen language kept, see deriveLocalizedRarityAliases):');
    for (const conflict of LOCALIZED_RARITY_ALIAS_CONFLICTS) {
      console.log(
        `  "${conflict.raw}": kept "${conflict.keptCanonical}" (${conflict.keptLanguage}), dropped "${conflict.droppedCanonical}" (${conflict.droppedLanguage})`
      );
    }
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
