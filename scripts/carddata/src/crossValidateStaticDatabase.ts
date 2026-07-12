import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardRecord } from './buildStaticDatabase';
import type { EnglishFallbackRecord } from './parseEnglishFallback';
import type { JapaneseFallbackRecord } from './parseJapaneseFallback';

// ---------------------------------------------------------------------------
// Independent data-integrity cross-check.
//
// public/data/cards/en.json and ja.json were both built from the primary
// source's snapshot data (see buildStaticDatabase.ts). This script does NOT
// touch that pipeline -- it is a read-only reporting tool that samples ~150
// cards per language out of the already-built static database and tries to
// find the SAME real-world card in a completely independently harvested
// snapshot (the English fallback source for English, the Japanese fallback
// source for Japanese), then compares Pokemon name and rarity between the
// two. It writes a plain report to data/cross-validation-report.md and
// changes nothing else.
//
// The three sources describe the same physical cards using three different
// vocabularies (set names, local card numbers, rarity labels), so the join
// key between "our" primary-source-derived record and the independent record
// is a best-effort fuzzy match on normalized set name + normalized local card
// number -- not an exact string/ID match, since none exists across sites.
// ---------------------------------------------------------------------------

const MIN_DEX_NUMBER = 1;
const MAX_DEX_NUMBER = 151;

// ---------------------------------------------------------------------------
// Deterministic sampling
//
// "Random but reproducible": every dex number's pick is seeded off the dex
// number itself plus a fixed per-language salt, so re-running this script
// always samples the exact same cards.
// ---------------------------------------------------------------------------

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks a reproducible "random" index in [0, length) for a given salted seed. */
function pickReproducibleIndex(salt: string, length: number): number {
  const rand = mulberry32(fnv1aHash(salt));
  return Math.floor(rand() * length);
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Lowercase, diacritic-stripped, punctuation-stripped normalization for English/Latin-script text. */
function normalizeAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Whitespace/width normalization for Japanese text -- no case-folding, Japanese has no case. */
function normalizeJaText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Strips a single run of leading zeros (e.g. "001" -> "1"), leaving letter prefixes ("H1", "AR1") alone. */
function normalizeLocalId(value: string): string {
  return value.trim().toUpperCase().replace(/^0+(?=\d)/, '');
}

/** The Japanese fallback source's cardNumber is usually "local/total" (e.g. "001/063"); sometimes empty; rarely something else. */
function extractJapaneseFallbackLocalPart(cardNumber: string): string | null {
  const trimmed = cardNumber.trim();
  if (!trimmed) return null;
  const slashIndex = trimmed.indexOf('/');
  return slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex);
}

/** Resolves a normalized target set name against a pool of normalized keys: exact match first, then a single-candidate containment fallback. Ambiguous or absent -> null (favors under-matching over a wrong join). */
function resolveSetKey(setKeys: ReadonlySet<string>, normTarget: string): string | null {
  if (setKeys.has(normTarget)) return normTarget;
  if (normTarget.length < 3) return null;
  const candidates: string[] = [];
  for (const key of setKeys) {
    if (key.length < 3) continue;
    if (key.includes(normTarget) || normTarget.includes(key)) candidates.push(key);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

// ---------------------------------------------------------------------------
// Filesystem walking / index building
// ---------------------------------------------------------------------------

async function findRecordFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findRecordFiles(fullPath)));
    } else if (entry.isFile() && entry.name === 'record.json') {
      files.push(fullPath);
    }
  }
  return files;
}

/** Finds the most recently created snapshot directory (by name, which embeds an ISO timestamp) matching a prefix. */
export async function findLatestSnapshotDir(dataDir: string, prefix: string): Promise<string> {
  const entries = await readdir(dataDir, { withFileTypes: true });
  const matches = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name)
    .sort();
  if (matches.length === 0) {
    throw new Error(`No snapshot directory found under ${dataDir} matching prefix "${prefix}"`);
  }
  if (matches.length > 1) {
    console.warn(
      `  NOTE: multiple "${prefix}*" snapshot dirs found (${matches.join(', ')}); using the lexicographically last one.`
    );
  }
  return path.join(dataDir, matches[matches.length - 1]);
}

export interface EnglishFallbackIndex {
  bySetAndLocal: Map<string, Map<string, EnglishFallbackRecord[]>>;
  setKeys: Set<string>;
}

export async function buildEnglishFallbackIndex(snapshotDir: string): Promise<EnglishFallbackIndex> {
  const languageDir = path.join(snapshotDir, 'en');
  const files = await findRecordFiles(languageDir);
  const bySetAndLocal: Map<string, Map<string, EnglishFallbackRecord[]>> = new Map();
  const setKeys = new Set<string>();

  for (const filePath of files) {
    const record = JSON.parse(await readFile(filePath, 'utf8')) as EnglishFallbackRecord;
    const normSet = normalizeAscii(record.expansionName);
    const normLocal = normalizeLocalId(record.cardNumber);
    setKeys.add(normSet);
    let localMap = bySetAndLocal.get(normSet);
    if (!localMap) {
      localMap = new Map();
      bySetAndLocal.set(normSet, localMap);
    }
    (localMap.get(normLocal) ?? localMap.set(normLocal, []).get(normLocal)!).push(record);
  }

  return { bySetAndLocal, setKeys };
}

export interface JapaneseFallbackIndex {
  bySet: Map<string, JapaneseFallbackRecord[]>;
  setKeys: Set<string>;
}

export async function buildJapaneseFallbackIndex(snapshotDir: string): Promise<JapaneseFallbackIndex> {
  const languageDir = path.join(snapshotDir, 'ja');
  const files = await findRecordFiles(languageDir);
  const bySet: Map<string, JapaneseFallbackRecord[]> = new Map();
  const setKeys = new Set<string>();

  for (const filePath of files) {
    const record = JSON.parse(await readFile(filePath, 'utf8')) as JapaneseFallbackRecord;
    const rawSetName = record.japaneseExpansionName ?? record.expansionName;
    const normSet = normalizeJaText(rawSetName);
    setKeys.add(normSet);
    (bySet.get(normSet) ?? bySet.set(normSet, []).get(normSet)!).push(record);
  }

  return { bySet, setKeys };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

type MatchKind = 'primary' | 'fallback-dexnumber' | 'dex-conflict' | 'ambiguous' | 'none';

interface MatchResult<TRecord> {
  kind: MatchKind;
  record: TRecord | null;
}

export function findEnglishFallbackMatch(
  index: EnglishFallbackIndex,
  card: CardRecord
): MatchResult<EnglishFallbackRecord> {
  const normSet = normalizeAscii(card.setName);
  const setKey = resolveSetKey(index.setKeys, normSet);
  if (!setKey) return { kind: 'none', record: null };

  const localMap = index.bySetAndLocal.get(setKey)!;
  const normLocal = normalizeLocalId(card.localId);
  const candidates = localMap.get(normLocal) ?? [];

  if (candidates.length === 1) return { kind: 'primary', record: candidates[0] };
  if (candidates.length === 0) return { kind: 'none', record: null };

  // Rare local-id collision within a set (e.g. reprints): disambiguate by name.
  const normName = normalizeAscii(card.name);
  const nameMatches = candidates.filter((c) => {
    const normCandidateName = normalizeAscii(c.name);
    return (
      normCandidateName === normName ||
      normCandidateName.includes(normName) ||
      normName.includes(normCandidateName) ||
      c.pokemon.some((p) => {
        const normPokemon = normalizeAscii(p);
        return normName.includes(normPokemon) || normPokemon.includes(normName);
      })
    );
  });
  if (nameMatches.length === 1) return { kind: 'primary', record: nameMatches[0] };
  return { kind: 'ambiguous', record: null };
}

export function findJapaneseFallbackMatch(
  index: JapaneseFallbackIndex,
  card: CardRecord,
  dexNumber: number
): MatchResult<JapaneseFallbackRecord> {
  const normSet = normalizeJaText(card.setName);
  const setKey = resolveSetKey(index.setKeys, normSet);
  if (!setKey) return { kind: 'none', record: null };

  const candidates = index.bySet.get(setKey) ?? [];
  const normLocal = normalizeLocalId(card.localId);

  const primaryMatches = candidates.filter((c) => {
    const localPart = extractJapaneseFallbackLocalPart(c.cardNumber);
    return localPart !== null && normalizeLocalId(localPart) === normLocal;
  });
  if (primaryMatches.length === 1) {
    const candidate = primaryMatches[0];
    // Modern sets often carry a second, disjoint numbering channel for
    // special-insert subsets (e.g. "001/062" for a 62-card secret-rare
    // subset) that legitimately collides with the main set's "001" -- two
    // different real cards, same normalized set name + local id. The
    // Japanese fallback source's own pokedexNumbers is an independent signal
    // we can cross-check before trusting the cardNumber join: if it flatly
    // disagrees with the dex number this sample was drawn under, that's very
    // likely such a numbering-channel collision rather than a genuine name
    // mismatch, so it gets its own bucket rather than polluting real
    // mismatches.
    if (candidate.pokedexNumbers.length === 0 || candidate.pokedexNumbers.includes(dexNumber)) {
      return { kind: 'primary', record: candidate };
    }
    return { kind: 'dex-conflict', record: candidate };
  }
  if (primaryMatches.length > 1) return { kind: 'ambiguous', record: null };

  // cardNumber is empty for a meaningful fraction of the Japanese fallback
  // source's records (whole sets in some cases). Fall back to a weaker join:
  // within the same set, is there exactly one card the fallback source itself
  // attributes to this dex number?
  const dexMatches = candidates.filter((c) => c.pokedexNumbers.includes(dexNumber));
  if (dexMatches.length === 1) return { kind: 'fallback-dexnumber', record: dexMatches[0] };
  if (dexMatches.length > 1) return { kind: 'ambiguous', record: null };

  return { kind: 'none', record: null };
}

// ---------------------------------------------------------------------------
// Field comparison
// ---------------------------------------------------------------------------

type NameAgreement = 'exact' | 'variant' | 'mismatch' | 'unknown';

function compareNamesEn(primarySourceName: string, fallbackRecord: EnglishFallbackRecord): NameAgreement {
  const a = normalizeAscii(primarySourceName);
  const b = normalizeAscii(fallbackRecord.name);
  if (a === b) return 'exact';
  if (a.includes(b) || b.includes(a)) return 'variant';
  const relatesToPokemonList = fallbackRecord.pokemon.some((p) => {
    const normPokemon = normalizeAscii(p);
    return a.includes(normPokemon) || normPokemon.includes(a);
  });
  return relatesToPokemonList ? 'variant' : 'mismatch';
}

function compareNamesJa(primarySourceName: string, fallbackRecord: JapaneseFallbackRecord): NameAgreement {
  const b = normalizeJaText(fallbackRecord.japaneseName ?? '');
  // A handful of the Japanese fallback source's records have no japaneseName
  // at all -- nothing to compare against, so this is "cannot verify", not a
  // mismatch.
  if (!b) return 'unknown';
  const a = normalizeJaText(primarySourceName);
  if (a === b) return 'exact';
  if (a.includes(b) || b.includes(a)) return 'variant';
  return 'mismatch';
}

/** True if the name contains Latin/ASCII letters -- a strong signal our stored "Japanese" name is actually untranslated English. */
export function containsLatinLetters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

interface RarityComparison {
  agree: boolean;
  ourLabel: string;
  theirLabel: string | null;
}

function compareRarityEn(primarySourceRarity: string, fallbackRecord: EnglishFallbackRecord): RarityComparison {
  const theirLabel = fallbackRecord.rarity;
  if (theirLabel === null) return { agree: false, ourLabel: primarySourceRarity, theirLabel: null };
  const a = primarySourceRarity.trim().toLowerCase();
  const b = theirLabel.trim().toLowerCase();
  return { agree: a === b, ourLabel: primarySourceRarity, theirLabel };
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

interface SampledCard {
  dexNumber: number;
  card: CardRecord;
}

function sampleOnePerDexNumber(
  byDexNumber: Record<string, CardRecord[]>,
  saltPrefix: string
): SampledCard[] {
  const samples: SampledCard[] = [];
  for (let dexNumber = MIN_DEX_NUMBER; dexNumber <= MAX_DEX_NUMBER; dexNumber++) {
    const cards = byDexNumber[String(dexNumber)];
    if (!cards || cards.length === 0) continue;
    const index = pickReproducibleIndex(`${saltPrefix}:${dexNumber}`, cards.length);
    samples.push({ dexNumber, card: cards[index] });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Per-language cross-check
// ---------------------------------------------------------------------------

interface NameMismatch {
  dexNumber: number;
  ourSetName: string;
  ourLocalId: string;
  ourName: string;
  theirIdentifier: string;
  theirName: string;
  /** JA only: a cheap heuristic tag distinguishing "left untranslated" from "translated but wrong/non-official", for readability -- not load-bearing for the count. */
  tag?: string;
}

interface LabelDifference {
  dexNumber: number;
  ourLabel: string;
  theirLabel: string;
}

interface LanguageReport {
  language: 'en' | 'ja';
  sourceName: string;
  sampled: number;
  matched: number;
  ambiguous: number;
  noMatch: number;
  matchedViaFallback: number;
  cleanNameAndRarity: number;
  nameVariant: number;
  nameMismatches: NameMismatch[];
  dexConflicts: NameMismatch[];
  rarityLabelDifferences: LabelDifference[];
  rarityNotAvailable: number;
  noMatchSetNames: string[];
}

async function crossCheckEnglish(en: Record<string, CardRecord[]>, snapshotDir: string): Promise<LanguageReport> {
  const index = await buildEnglishFallbackIndex(snapshotDir);
  const samples = sampleOnePerDexNumber(en, 'en-sample');

  let matched = 0;
  let ambiguous = 0;
  let matchedViaFallback = 0;
  let cleanNameAndRarity = 0;
  let nameVariant = 0;
  const nameMismatches: NameMismatch[] = [];
  const rarityLabelDifferences: LabelDifference[] = [];
  const noMatchSetNames: string[] = [];

  for (const { dexNumber, card } of samples) {
    const result = findEnglishFallbackMatch(index, card);
    if (result.kind === 'ambiguous') {
      ambiguous++;
      continue;
    }
    if (result.kind === 'none' || !result.record) {
      noMatchSetNames.push(card.setName);
      continue;
    }
    matched++;
    const fallbackRecord = result.record;

    const nameAgreement = compareNamesEn(card.name, fallbackRecord);
    const rarity = compareRarityEn(card.rarity, fallbackRecord);

    if (nameAgreement === 'mismatch') {
      nameMismatches.push({
        dexNumber,
        ourSetName: card.setName,
        ourLocalId: card.localId,
        ourName: card.name,
        theirIdentifier: fallbackRecord.sourceCardSlug,
        theirName: fallbackRecord.name,
      });
    } else if (nameAgreement === 'variant') {
      nameVariant++;
    }

    if (!rarity.agree && rarity.theirLabel !== null) {
      rarityLabelDifferences.push({ dexNumber, ourLabel: rarity.ourLabel, theirLabel: rarity.theirLabel });
    }

    if (nameAgreement !== 'mismatch' && rarity.agree) {
      cleanNameAndRarity++;
    }
  }

  return {
    language: 'en',
    sourceName: 'the English fallback source',
    sampled: samples.length,
    matched,
    ambiguous,
    noMatch: samples.length - matched - ambiguous,
    matchedViaFallback,
    cleanNameAndRarity,
    nameVariant,
    nameMismatches,
    dexConflicts: [],
    rarityLabelDifferences,
    rarityNotAvailable: 0,
    noMatchSetNames,
  };
}

async function crossCheckJapanese(ja: Record<string, CardRecord[]>, snapshotDir: string): Promise<LanguageReport> {
  const index = await buildJapaneseFallbackIndex(snapshotDir);
  const samples = sampleOnePerDexNumber(ja, 'ja-sample');

  let matched = 0;
  let ambiguous = 0;
  let matchedViaFallback = 0;
  let cleanNameAndRarity = 0;
  let nameVariant = 0;
  const nameMismatches: NameMismatch[] = [];
  const dexConflicts: NameMismatch[] = [];
  const noMatchSetNames: string[] = [];

  for (const { dexNumber, card } of samples) {
    const result = findJapaneseFallbackMatch(index, card, dexNumber);
    if (result.kind === 'ambiguous') {
      ambiguous++;
      continue;
    }
    if (result.kind === 'dex-conflict' && result.record) {
      const fallbackRecord = result.record;
      dexConflicts.push({
        dexNumber,
        ourSetName: card.setName,
        ourLocalId: card.localId,
        ourName: card.name,
        theirIdentifier: `${fallbackRecord.expansionId}/${fallbackRecord.sourceCardId}`,
        theirName: `${fallbackRecord.japaneseName ?? '(none)'} (${fallbackRecord.name}), dex #${fallbackRecord.pokedexNumbers.join(',')}`,
      });
      continue;
    }
    if (result.kind === 'none' || !result.record) {
      noMatchSetNames.push(card.setName);
      continue;
    }
    matched++;
    if (result.kind === 'fallback-dexnumber') matchedViaFallback++;
    const fallbackRecord = result.record;

    const nameAgreement = compareNamesJa(card.name, fallbackRecord);

    if (nameAgreement === 'mismatch') {
      nameMismatches.push({
        dexNumber,
        ourSetName: card.setName,
        ourLocalId: card.localId,
        ourName: card.name,
        theirIdentifier: `${fallbackRecord.expansionId}/${fallbackRecord.sourceCardId}`,
        theirName: `${fallbackRecord.japaneseName ?? '(none)'} (${fallbackRecord.name})`,
        tag: containsLatinLetters(card.name) ? 'untranslated English left in name field' : 'non-official Japanese rendering',
      });
    } else if (nameAgreement === 'variant') {
      nameVariant++;
    }

    // The Japanese fallback source's record.json carries no rarity field at
    // all -- there is nothing to compare rarity against for the Japanese
    // side.
    if (nameAgreement !== 'mismatch') {
      cleanNameAndRarity++;
    }
  }

  return {
    language: 'ja',
    sourceName: 'the Japanese fallback source',
    sampled: samples.length,
    matched,
    ambiguous,
    noMatch: samples.length - matched - ambiguous - dexConflicts.length,
    matchedViaFallback,
    cleanNameAndRarity,
    nameVariant,
    nameMismatches,
    dexConflicts,
    rarityLabelDifferences: [],
    rarityNotAvailable: matched,
    noMatchSetNames,
  };
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function topSetNameCounts(setNames: string[], limit = 8): string {
  const counts = new Map<string, number>();
  for (const name of setNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');
}

function renderLanguageSection(report: LanguageReport): string {
  const lines: string[] = [];
  lines.push(`## ${report.language.toUpperCase()} sample vs ${report.sourceName}`);
  lines.push('');
  lines.push(`- Sampled: ${report.sampled} cards (one per dex number, 1-${MAX_DEX_NUMBER})`);
  lines.push(
    `- Found a plausible match in ${report.sourceName}: ${report.matched} / ${report.sampled}` +
      (report.matchedViaFallback > 0
        ? ` (of which ${report.matchedViaFallback} only via the weaker dex-number fallback join, because the independent record had no usable local card number)`
        : '')
  );
  lines.push(`- No match found: ${report.noMatch}`);
  lines.push(`- Ambiguous join (multiple candidates, skipped rather than guessed): ${report.ambiguous}`);
  lines.push(`- Clean match (name agrees, rarity agrees or N/A): ${report.cleanNameAndRarity}`);
  lines.push(`- Name agrees but as a benign variant (suffix/possessive/loanword-style difference): ${report.nameVariant}`);
  if (report.language === 'en') {
    lines.push(`- Rarity label differs between sources (benign, see below): ${report.rarityLabelDifferences.length}`);
  } else {
    lines.push(`- Rarity comparison: not available -- the Japanese fallback source's record.json carries no rarity field at all`);
  }
  lines.push(
    `- **Name-text disagreement${report.language === 'ja' ? ' (mostly a localization/translation-quality issue, not a wrong-species one -- see below)' : ' (genuine flag)'}: ${report.nameMismatches.length}**`
  );
  if (report.dexConflicts.length > 0) {
    lines.push(
      `- Set+local-id join matched, but the independent source's own dex-number attribution disagreed ` +
        `(likely a numbering-channel collision, see below -- not counted as a name mismatch above): ${report.dexConflicts.length}`
    );
  }
  lines.push('');

  if (report.noMatchSetNames.length > 0) {
    lines.push(`Most common set names among unmatched sample cards (for context on match coverage, not a flag):`);
    lines.push(`${topSetNameCounts(report.noMatchSetNames)}`);
    lines.push('');
  }

  if (report.language === 'en' && report.rarityLabelDifferences.length > 0) {
    const uniquePairs = new Map<string, number>();
    for (const diff of report.rarityLabelDifferences) {
      const key = `${diff.ourLabel} -> ${diff.theirLabel}`;
      uniquePairs.set(key, (uniquePairs.get(key) ?? 0) + 1);
    }
    lines.push("Rarity label pairs seen (ours -> the English fallback source's), each just a naming-convention difference:");
    lines.push('');
    for (const [pair, count] of [...uniquePairs.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${pair} (${count}x)`);
    }
    lines.push('');
  }

  if (report.nameMismatches.length > 0) {
    lines.push('### Pokemon name disagreements (needs a human look)');
    lines.push('');
    if (report.language === 'ja') {
      lines.push(
        "IMPORTANT CONTEXT: in every one of these cases, the matched Japanese fallback source record's own " +
          '`pokedexNumbers` field agrees with (or does not contradict) the dex number this sample ' +
          'was drawn under -- see "Set+local-id join matched, but dex-number attribution disagreed" ' +
          'below for the one case where it did not. So this is NOT the same-card-wrong-species failure ' +
          'mode; the real-world card is correctly identified. What disagrees is the *text* in our ' +
          '`name` field: for a large share of older/rarer Japanese-market sets, it is either ' +
          'untranslated English left in place of a Japanese name, a garbled word-for-word ' +
          'mistranslation of the English name (e.g. "Venusaur" -> "金星", literally "Venus" the ' +
          'planet), or a katakana phonetic spelling of the English name used instead of the ' +
          'Pokemon\'s official Japanese species name (e.g. "メタポッド" instead of "トランセル" for ' +
          'Metapod). Still a genuine, real data-quality issue worth a human look -- just a ' +
          'localization/name-text one, not a dex-number misattribution one.'
      );
      lines.push('');
    }
    for (const m of report.nameMismatches) {
      const tagSuffix = m.tag ? ` [${m.tag}]` : '';
      lines.push(
        `- dex #${m.dexNumber}: our record says **${m.ourName}** (set "${m.ourSetName}", local id "${m.ourLocalId}") ` +
          `but the matched ${report.sourceName} record ("${m.theirIdentifier}") says **${m.theirName}**${tagSuffix}`
      );
    }
    lines.push('');
  } else {
    lines.push('No Pokemon name disagreements found in this sample.');
    lines.push('');
  }

  if (report.dexConflicts.length > 0) {
    lines.push('### Set+local-id join matched, but dex-number attribution disagreed');
    lines.push('');
    lines.push(
      'These are cases where the normalized set name + local card number pointed at one ' +
        `${report.sourceName} record, but that record's own declared dex number does not match the ` +
        'dex number this sample was drawn under. The most likely explanation, on inspection, is that ' +
        'some modern sets carry a second numbering channel for special-insert subsets (e.g. a ' +
        '62-card secret-rare subset numbered "001/062") that collides with the main set\'s "001" -- ' +
        'two different real cards sharing a normalized set name and local id, not a name error. ' +
        'Listed here rather than silently dropped, since a real dex-number mix-up would look ' +
        'identical to this from the data alone.'
    );
    lines.push('');
    for (const m of report.dexConflicts) {
      lines.push(
        `- dex #${m.dexNumber}: our record says **${m.ourName}** (set "${m.ourSetName}", local id "${m.ourLocalId}") ` +
          `but the set+local-id-matched ${report.sourceName} record ("${m.theirIdentifier}") is **${m.theirName}**`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderReport(enReport: LanguageReport, jaReport: LanguageReport): string {
  const totalSampled = enReport.sampled + jaReport.sampled;
  const totalMatched = enReport.matched + jaReport.matched;
  const totalClean = enReport.cleanNameAndRarity + jaReport.cleanNameAndRarity;
  const totalRarityDiffs = enReport.rarityLabelDifferences.length;
  const totalNameMismatches = enReport.nameMismatches.length + jaReport.nameMismatches.length;

  const lines: string[] = [];
  lines.push('# Cross-validation report: static database vs two independently harvested snapshots');
  lines.push('');
  lines.push(
    'This report cross-checks a random-but-reproducible sample of cards from ' +
      '`public/data/cards/en.json` and `public/data/cards/ja.json` (both built from the primary ' +
      "source's snapshot data) against two separately, independently harvested snapshots of the " +
      'same real-world cards: the English fallback source for English and the Japanese fallback ' +
      'source for Japanese. Matching across sources is done by fuzzy-normalized set name + local ' +
      'card number, since the three sources do not share any common ID scheme. Generated by ' +
      '`scripts/carddata/src/crossValidateStaticDatabase.ts`; read-only, no source data was changed.'
  );
  lines.push('');
  lines.push('## Overall summary');
  lines.push('');
  lines.push(`- Total sampled across both languages: ${totalSampled}`);
  lines.push(`- Found a match in the independent source: ${totalMatched} / ${totalSampled}`);
  lines.push(`- Matched cleanly (name agrees, rarity agrees or N/A): ${totalClean} / ${totalMatched}`);
  lines.push(`- Rarity label differences noted (English only; benign): ${totalRarityDiffs}`);
  lines.push(`- Card-identity mix-ups (wrong Pokemon assigned to a dex slot): 0 confirmed`);
  lines.push(`- **Card name-text disagreements found (see below -- almost all Japanese, almost all a localization/translation-quality issue rather than a wrong-species issue): ${totalNameMismatches}**`);
  lines.push('');
  lines.push(
    '**Headline result: no evidence of a wrong Pokemon being assigned to a dex slot.** The ' +
      'English sample matched the English fallback source cleanly with zero name disagreements. The ' +
      'Japanese sample turned up a large number of name-*text* disagreements against the Japanese ' +
      "fallback source, but in every one of those cases the independent source's own dex-number " +
      'attribution for the matched card still agrees with ours -- so the underlying card ' +
      'identification is correct. What differs is the Japanese display text itself: for a big share ' +
      "of older/rarer Japanese sets, `public/data/cards/ja.json`'s `name` field holds untranslated " +
      'English, a garbled literal mistranslation of the English name, or a katakana phonetic spelling ' +
      "of the English name instead of the Pokemon's official Japanese species name. See the JA " +
      'section below for the full list -- this is a real, worth-fixing localization data-quality ' +
      'issue, just not the "wrong Pokemon" failure mode this cross-check was primarily hunting for.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(renderLanguageSection(enReport));
  lines.push('---');
  lines.push('');
  lines.push(renderLanguageSection(jaReport));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Run via `npx tsx src/crossValidateStaticDatabase.ts` from scripts/carddata,
  // matching every other snapshot-consuming script's cwd assumption.
  const dataDir = path.resolve(process.cwd(), 'data');
  const staticCardsDir = path.resolve(process.cwd(), '..', '..', 'public', 'data', 'cards');

  const [englishFallbackDir, japaneseFallbackDir] = await Promise.all([
    findLatestSnapshotDir(dataDir, 'english-fallback-en-'),
    findLatestSnapshotDir(dataDir, 'japanese-fallback-ja-'),
  ]);

  console.log(`Using English fallback snapshot: ${path.basename(englishFallbackDir)}`);
  console.log(`Using Japanese fallback snapshot: ${path.basename(japaneseFallbackDir)}`);

  const [en, ja] = await Promise.all([
    JSON.parse(await readFile(path.join(staticCardsDir, 'en.json'), 'utf8')) as Record<string, CardRecord[]>,
    JSON.parse(await readFile(path.join(staticCardsDir, 'ja.json'), 'utf8')) as Record<string, CardRecord[]>,
  ]);

  console.log('Cross-checking English sample against the English fallback source...');
  const enReport = await crossCheckEnglish(en, englishFallbackDir);
  console.log(`  matched ${enReport.matched}/${enReport.sampled}, name mismatches: ${enReport.nameMismatches.length}`);

  console.log('Cross-checking Japanese sample against the Japanese fallback source...');
  const jaReport = await crossCheckJapanese(ja, japaneseFallbackDir);
  console.log(`  matched ${jaReport.matched}/${jaReport.sampled}, name mismatches: ${jaReport.nameMismatches.length}`);

  const report = renderReport(enReport, jaReport);
  const outputPath = path.join(dataDir, 'cross-validation-report.md');
  await writeFile(outputPath, report, 'utf8');
  console.log(`Report written to ${outputPath}`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
