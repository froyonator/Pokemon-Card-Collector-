// scripts/carddata/src/bulkExportIngest.ts
//
// Converts the primary source's own public bulk data export (a git clone of
// its card database, expected at data/bulk-export/ -- see the README note in
// this task's handoff for how to obtain it) into the exact same per-card
// record.json layout snapshotAllGens.ts writes:
//
//   data/snapshot-all-gens/<language>/<setId>/<cardId>/record.json
//
// so the existing `npm run build-database -- --gen N` step works on the
// result completely unchanged -- it doesn't know or care whether a given
// language directory under data/snapshot-all-gens/ came from a live API walk
// or from this offline conversion.
//
// Why this exists: snapshotAllGens.ts has to make one HTTP request per card
// per language (tens of thousands of requests to cover Gen2-9 across every
// language). The bulk export is the same underlying data, published as
// typed source files, one file per card -- a single local clone plus a
// filesystem walk gets every language and every generation at once with
// zero HTTP requests for card data.
//
// Bulk export layout (verified directly against the clone and cross-checked
// against the live API -- see this task's handoff notes for the exact
// spot-checks):
//   - Card/Set/Serie objects are plain TypeScript modules with a default
//     export. A card file sits three path segments below the data root:
//     <root>/<serieDir>/<setDir>/<localId>.ts -- the filename (minus
//     extension) *is* the card's localId, and `${set.id}-${localId}` is its
//     global id, matching the live API's own id scheme exactly (confirmed:
//     data/Neo/Neo Destiny/1.ts -> neo4-1; data-asia/neo/neo1/002.ts ->
//     neo1-002, both round-tripped against the live API).
//   - `getDataFolder`-equivalent split: western languages (en, fr, de, es,
//     it, pt, nl, pl, ru) live under <root>/data/; the Asian languages (ja,
//     ko, zh-tw, id, th, zh-cn) live under <root>/data-asia/ as a
//     *completely separate* file tree with its own Set/Serie objects that
//     merely share the same `id` string -- confirmed by inspecting
//     data/Neo.ts vs data-asia/neo.ts, both `id: "neo"` but different files,
//     different `name` maps, and (for sets) potentially different card
//     membership/local numbering entirely. A language is only ever read
//     from its own root; the two roots are never cross-checked against each
//     other for the same language.
//   - A card's `name` field is a per-language map (`Languages<string>`,
//     i.e. `Partial<Record<lang, string>>`). A language key's absence is
//     the source's own way of recording "not released in this language" --
//     confirmed two ways against the live API: (1) data/Neo/Neo
//     Destiny/1.ts's `name` has only en/fr/de; GET /v2/es/cards/neo4-1
//     404s, GET /v2/de/cards/neo4-1 returns "Dunkles Ampharos" verbatim.
//     (2) data-asia/neo/neo1/002.ts's `name` has only `ja`; GET
//     /v2/ja/cards/neo1-002 returns "チコリータ" verbatim. This is also
//     exactly what the bulk export's own compiler does (see
//     server/compiler/utils/cardUtil.ts's `getCards`/`cardToCardSingle`:
//     both gate strictly on `card.name[lang]` being truthy).
//   - Per-language translation of enum-ish fields (rarity, category, etc.)
//     is data-driven: meta/translations/<lang>.json exists only for fr, de,
//     es, it, pt. Every other language (crucially including every Asian
//     language this task cares about) has no dictionary at all, so the
//     bulk export's own compiler passes the raw English value straight
//     through untranslated (server/compiler/utils/translationUtil.ts:
//     `if (lang === 'en' || !Object.keys(translations).includes(lang))
//     return key`). Confirmed live: GET /v2/de/cards/base1-1 rarity ==
//     "Selten" (translated); GET /v2/fr and /v2/ja for the same field stay
//     in English wherever no dictionary entry differs. This module mirrors
//     that exactly by *trying* to load meta/translations/<lang>.json and
//     falling back to the raw value whenever no dictionary (or no matching
//     key) exists for that language -- no hardcoded language list needed.
//   - Card image URLs are not stored in the bulk export at all -- the
//     source's own server derives them from a separately hosted existence
//     index (a JSON blob keyed by lang -> serieId -> setId -> cardId) and
//     only emits an `image` field when that index confirms the image
//     really exists for that exact language. This module accepts an
//     optional local cache of that same index (see loadImageAvailabilityIndex)
//     and applies the identical existence check; when the cache isn't
//     available it simply omits `image` for every card (never guesses).
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isSafePrimarySourceId, SUPPORTED_LANGUAGES } from './primarySource';
import { inRangeDexIds, parseGenerationsArg, rangesForGenerations } from './snapshotAllGens';
import type { GenRange } from './data/genRanges';

// --- minimal local types -----------------------------------------------
//
// Deliberately NOT imported from the clone's own interfaces.d.ts: that file
// only exists once data/bulk-export/ has actually been cloned (data/ is
// gitignored), and a static type-only import from inside it would make
// `npm run typecheck` fail for anyone -- including CI -- who hasn't cloned
// it. This is the small subset of the real `Card`/`Set`/`Serie` shape this
// module actually reads.
export type LanguageMap = Partial<Record<string, string>>;

export interface BulkExportSerie {
  id: string;
  name: LanguageMap;
}

export interface BulkExportSet {
  id: string;
  name: LanguageMap;
  serie: BulkExportSerie;
  cardCount?: { official?: number };
}

export interface BulkExportCard {
  name: LanguageMap;
  illustrator?: string;
  rarity?: string;
  category?: string;
  set: BulkExportSet;
  dexId?: number[];
  hp?: number;
  types?: string[];
  stage?: string;
  retreat?: number;
  [key: string]: unknown;
}

// --- pure helpers (unit tested) -----------------------------------------

/** Which physical data root (relative to the bulk export clone's own root) a language's cards live under. Mirrors the bulk export's own getDataFolder() exactly. */
const ASIAN_LANGUAGES = new Set(['ja', 'ko', 'zh-tw', 'id', 'th', 'zh-cn']);

export function dataFolderForLanguage(language: string): 'data' | 'data-asia' {
  return ASIAN_LANGUAGES.has(language) ? 'data-asia' : 'data';
}

/** True when this exact card module carries a name for this exact language -- the source's own signal that the card was released in that language. */
export function isCardAvailableInLanguage(card: BulkExportCard, language: string): boolean {
  return Boolean(card.name && card.name[language]);
}

/** A card file's localId is its filename with the extension stripped -- e.g. "002.ts" -> "002", "SV018.ts" -> "SV018". */
export function localIdFromFileName(fileName: string): string {
  const ext = path.extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
}

/**
 * Resolves a Languages<string> map to one language, with the same
 * dash-free-prefix fallback the bulk export's own resolveText() uses (e.g.
 * "pt" falling back to a "pt-br" entry when "pt" itself is absent), plus a
 * final fallback to English and then to whatever's first, so this never
 * returns undefined given a non-empty map. Used for the set's display name
 * only -- card-level language availability never uses this fallback (see
 * isCardAvailableInLanguage above, which is intentionally strict).
 */
export function resolveLanguageText(map: LanguageMap | undefined, language: string): string | undefined {
  if (!map) return undefined;
  const direct = map[language];
  if (direct) return direct;
  if (!language.includes('-')) {
    const prefixKey = Object.keys(map).find((key) => key.startsWith(language));
    if (prefixKey) return map[prefixKey];
  }
  if (map.en) return map.en;
  const firstValue = Object.values(map).find((value) => Boolean(value));
  return firstValue;
}

/** One language's translation dictionary, as published under meta/translations/<lang>.json in the bulk export -- only rarity/category are consulted (the only two fields this pipeline's output shape actually carries downstream). */
export interface TranslationDict {
  rarity?: Record<string, string>;
  category?: Record<string, string>;
}

/**
 * Translates one enum-ish value for one language, exactly mirroring the
 * bulk export's own translate(): no dictionary for this language (or no
 * matching key inside it) means the raw English value passes through
 * unchanged -- this is real, confirmed behavior (see this module's header
 * comment), not a fallback-of-last-resort.
 */
export function translateField(
  dict: TranslationDict | undefined,
  field: 'rarity' | 'category',
  value: string | undefined
): string | undefined {
  if (!value) return value;
  return dict?.[field]?.[value] ?? value;
}

/**
 * The existence index published alongside the primary source's asset host --
 * lang -> serieId -> setId -> LOCAL id -> truthy. Keyed by the card's own
 * localId, NOT its global `${setId}-${localId}` id -- confirmed directly
 * against server/compiler/utils/cardUtil.ts's getCardPictures(), which is
 * always called with the local id (`cardToCardSingle(localId, card, lang)`
 * passes its own `localId` param straight through), and cross-checked live:
 * en's basep-29 (localId "29") has an image URL whose last path segment is
 * "29", not "basep-29". Optional: when the index itself is unavailable,
 * image URLs are simply never emitted (see loadImageAvailabilityIndex).
 */
export type ImageAvailabilityIndex = Record<string, Record<string, Record<string, Record<string, unknown>>>>;

export function imageUrlIfAvailable(
  index: ImageAvailabilityIndex | undefined,
  language: string,
  serieId: string,
  setId: string,
  localId: string
): string | undefined {
  if (!index) return undefined;
  const exists = Boolean(index[language]?.[serieId]?.[setId]?.[localId]);
  if (!exists) return undefined;
  return `https://assets.tcgdex.net/${language}/${serieId}/${setId}/${localId}`;
}

/** The exact record.json shape buildStaticDatabase.ts's PrimarySourceSnapshotRecord reads -- see buildStaticDatabase.ts's recordToCardRecords for which of these fields it actually consumes (id, name, localId, rarity, set.id, set.name, dexId, image, language). */
export interface BulkExportRecord {
  id: string;
  localId: string;
  name: string;
  rarity: string;
  category?: string;
  set: { id: string; name: string };
  dexId?: number[];
  image?: string;
  illustrator?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  retreat?: number;
  language: string;
  imageStatus: 'skipped';
  imageFile: null;
  source: 'bulk-export';
  convertedAt: string;
}

/** Pure transform: one loaded card module + localId + language -> the record.json payload, or undefined if the card genuinely isn't available in that language. Does not touch the filesystem. */
export function buildBulkExportRecord(
  card: BulkExportCard,
  localId: string,
  language: string,
  translations: TranslationDict | undefined,
  imageIndex: ImageAvailabilityIndex | undefined,
  nowIso: string
): BulkExportRecord | undefined {
  if (!isCardAvailableInLanguage(card, language)) return undefined;

  const cardId = `${card.set.id}-${localId}`;
  const setName = resolveLanguageText(card.set.name, language) ?? card.set.id;

  return {
    id: cardId,
    localId,
    name: card.name[language] as string,
    rarity: translateField(translations, 'rarity', card.rarity) ?? '',
    category: translateField(translations, 'category', card.category),
    set: { id: card.set.id, name: setName },
    dexId: card.dexId,
    image: imageUrlIfAvailable(imageIndex, language, card.set.serie.id, card.set.id, localId),
    illustrator: card.illustrator,
    hp: card.hp,
    types: card.types,
    stage: card.stage,
    retreat: card.retreat,
    language,
    imageStatus: 'skipped',
    imageFile: null,
    source: 'bulk-export',
    convertedAt: nowIso,
  };
}

// --- filesystem walking / dynamic import ---------------------------------

/** Recursively collects every `.ts` file sitting exactly `targetDepth` path segments below `root`, skipping anything shallower or deeper. Shared by findCardFiles (depth 2: <serieDir>/<setDir>/<file>.ts) and findSetIndexFiles (depth 1: <serieDir>/<SetName>.ts). */
async function walkTsFilesAtDepth(root: string, targetDepth: number): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (depth === targetDepth && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  await walk(root, 0);
  return files;
}

/** Recursively finds every card module: a `.ts` file exactly three path segments below `root` (<serieDir>/<setDir>/<file>.ts). Serie-level (`<root>/<Serie>.ts`) and set-level (`<root>/<Serie>/<Set>.ts`) index files sit at 1 and 2 segments respectively and are skipped by construction. */
export async function findCardFiles(root: string): Promise<string[]> {
  return walkTsFilesAtDepth(root, 2);
}

/**
 * Finds every Set index file: a `.ts` file exactly one path segment below
 * `root` (<serieDir>/<SetName>.ts), sitting alongside that set's own card
 * directory of the same name (e.g. `data/E-Card/Expedition Base Set.ts`
 * describes the cards living under `data/E-Card/Expedition Base Set/`).
 * Serie-level index files (depth 0) and card files (depth 2) are skipped.
 * Used to build a setId -> card-directory index (see buildSetIdIndex) --
 * the bulk export's own directory names are display set names, not our
 * setId scheme, so this index is the only reliable way to resolve one to
 * the other.
 */
export async function findSetIndexFiles(root: string): Promise<string[]> {
  return walkTsFilesAtDepth(root, 1);
}

// A small number of card files (confirmed: exactly 2 in the whole clone, both
// under data-asia/S/SC1a/) import their own Set with a bare `from "."`
// specifier instead of the usual `from "../SetName"`. The source repo runs
// on Bun, which resolves a bare "." specifier from inside a directory to a
// sibling file one level up sharing the directory's own name (here:
// data-asia/S/SC1a/001.ts's "." resolves to data-asia/S/SC1a.ts -- verified
// by reading that exact file, which is indeed the Set object with
// id: 'SC1a'). Plain Node ESM (what tsx runs on) has no such rule and fails
// to resolve it. Rather than special-case this in every caller, this
// rewrites just that one specifier to its real relative path before
// importing, via a same-directory temp copy (so every other relative import
// in the file, e.g. `../../../interfaces`, still resolves exactly as
// written) that's deleted again once the import completes.
const BARE_DOT_IMPORT = /from\s+(['"])\.\1/;

async function importPossiblyPatched(absolutePath: string): Promise<{ default?: unknown }> {
  const source = await readFile(absolutePath, 'utf8');
  if (!BARE_DOT_IMPORT.test(source)) {
    return (await import(pathToFileURL(absolutePath).href)) as { default?: unknown };
  }

  const dir = path.dirname(absolutePath);
  const siblingSetFile = `../${path.basename(dir)}`;
  const patchedSource = source.replace(BARE_DOT_IMPORT, `from $1${siblingSetFile}$1`);
  const patchedPath = path.join(dir, `.__bulkExportIngestPatched__${path.basename(absolutePath)}`);
  await writeFile(patchedPath, patchedSource, 'utf8');
  try {
    return (await import(pathToFileURL(patchedPath).href)) as { default?: unknown };
  } finally {
    await unlink(patchedPath).catch(() => undefined);
  }
}

/** Loads one card module via a real dynamic import -- tsx (this whole pipeline's own runtime) transpiles arbitrary .ts files on the fly, so this is a plain Node ESM import, not a bespoke parser (see importPossiblyPatched above for the one known exception this needs to work around). Returns undefined (rather than throwing) for a file that doesn't export a Pokemon card with dexId, matching this task's scope (only Pokemon cards are dex-attributable). */
export async function loadCardModule(absolutePath: string): Promise<BulkExportCard | undefined> {
  const mod = await importPossiblyPatched(absolutePath);
  const card = mod.default as BulkExportCard | undefined;
  if (!card || typeof card !== 'object' || !card.set || !card.name) return undefined;
  return card;
}

/**
 * Loads one Set index module (e.g. `data/E-Card/Expedition Base Set.ts`) --
 * the same dynamic-import mechanism as loadCardModule (see
 * importPossiblyPatched), but for a Set object rather than a Card. A Set
 * object carries its own `id`+`serie` and never a `set` field (that's the
 * Card shape pointing AT its Set), which is how this tells the two apart
 * without a second parser. Returns undefined for anything that doesn't look
 * like a Set.
 */
export async function loadSetModule(absolutePath: string): Promise<{ id: string; name: LanguageMap } | undefined> {
  const mod = await importPossiblyPatched(absolutePath);
  const set = mod.default as { id?: unknown; name?: unknown; serie?: unknown; set?: unknown } | undefined;
  if (!set || typeof set !== 'object' || typeof set.id !== 'string' || !set.serie || set.set) return undefined;
  return { id: set.id, name: (set.name as LanguageMap | undefined) ?? {} };
}

/** One resolved entry of buildSetIdIndex: where a set's card files live, plus the Set object's own (often partial) per-language name map -- e.g. "ecard1"'s carries fr/it/de names, but plenty of pre-2011 sets only carry `en`. */
export interface SetIdIndexEntry {
  cardDir: string;
  name: LanguageMap;
}

/**
 * Builds a setId -> {card-directory, name} index for one data root (western
 * `data/` or Asian `data-asia/`), by walking every Set index file and
 * reading its own `id` field. This is the "same mapping bulkExportIngest
 * uses" the Gen1 backfill and availability checker
 * (bulkExportGen1Backfill.ts) rely on to resolve our own setId scheme to
 * the bulk export's own directory naming (directory names are display set
 * names, e.g. "Expedition Base Set", not setIds like "ecard1"). A setId
 * colliding across two directories (not expected in practice) keeps the
 * first one found rather than erroring.
 */
export async function buildSetIdIndex(root: string): Promise<Map<string, SetIdIndexEntry>> {
  const index = new Map<string, SetIdIndexEntry>();
  const indexFiles = await findSetIndexFiles(root);
  for (const file of indexFiles) {
    const set = await loadSetModule(file);
    if (!set || index.has(set.id)) continue;
    const extension = path.extname(file);
    const cardDir = extension ? file.slice(0, -extension.length) : file;
    index.set(set.id, { cardDir, name: set.name });
  }
  return index;
}

/** Exported for reuse by the Gen1 backfill path (bulkExportGen1Backfill.ts), which needs the same per-language rarity/category dictionary this module's own ordinary ingest uses. */
export async function loadTranslationDict(bulkExportRoot: string, language: string): Promise<TranslationDict | undefined> {
  try {
    const raw = await readFile(path.join(bulkExportRoot, 'meta', 'translations', `${language}.json`), 'utf8');
    return JSON.parse(raw) as TranslationDict;
  } catch {
    return undefined;
  }
}

/** Loads the optional image-existence cache -- see this module's header comment. Expected at data/bulk-export-support/datas.json (a one-time, non-per-card download of the primary source's own published asset index; not fetched by this script itself, to keep conversion fully offline and deterministic). Absence is normal and not an error: every record's `image` field is simply omitted. */
export async function loadImageAvailabilityIndex(supportPath: string): Promise<ImageAvailabilityIndex | undefined> {
  try {
    const raw = await readFile(supportPath, 'utf8');
    return JSON.parse(raw) as ImageAvailabilityIndex;
  } catch {
    return undefined;
  }
}

// --- CLI -------------------------------------------------------------------

export interface IngestArgs {
  languages: string[];
  generations: number[];
  limit?: number;
}

export function parseIngestArguments(argv: string[]): IngestArgs {
  const rest = [...argv];
  let languages: string[] | undefined;
  let generations: number[] | undefined;
  let limit: number | undefined;

  while (rest.length > 0) {
    const flag = rest.shift();
    const value = rest.shift();
    if (!value) throw new Error(`${flag} requires a value.`);
    if (flag === '--langs') {
      languages = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (flag === '--gens') {
      generations = parseGenerationsArg(value);
    } else if (flag === '--limit') {
      limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer.');
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (!languages || languages.length === 0) {
    throw new Error('Usage: npm run ingest-bulk-export -- --langs <csv> --gens <csv> [--limit N]');
  }
  for (const language of languages) {
    if (!SUPPORTED_LANGUAGES.has(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }
    if (language === 'en') {
      throw new Error(
        "Refusing to ingest 'en' -- the live API snapshot (snapshotAllGens.ts) owns English; run that instead."
      );
    }
  }

  return { languages, generations: generations ?? [2, 3, 4, 5, 6, 7, 8, 9], limit };
}

// --- orchestration -----------------------------------------------------

const BULK_EXPORT_ROOT = path.join('data', 'bulk-export');
const IMAGE_INDEX_PATH = path.join('data', 'bulk-export-support', 'datas.json');
const OUTPUT_ROOT = path.join('data', 'snapshot-all-gens');

export interface LanguageIngestStats {
  language: string;
  filesScanned: number;
  cardsWritten: number;
  distinctDexNumbers: number;
}

export async function convertRoot(
  rootDir: string,
  languages: string[],
  ranges: GenRange[],
  translationsByLanguage: Map<string, TranslationDict | undefined>,
  imageIndex: ImageAvailabilityIndex | undefined,
  limit: number | undefined,
  statsByLanguage: Map<string, LanguageIngestStats>,
  outputRoot: string = OUTPUT_ROOT
): Promise<void> {
  const files = await findCardFiles(rootDir);
  const nowIso = new Date().toISOString();
  const capturedDexByLanguage = new Map<string, Set<number>>();
  for (const language of languages) capturedDexByLanguage.set(language, new Set());

  for (const file of files) {
    const capturedAllLimited = languages.every((language) => {
      if (limit === undefined) return false;
      return (capturedDexByLanguage.get(language) as Set<number>).size >= limit;
    });
    if (capturedAllLimited) break;

    const card = await loadCardModule(file);
    if (!card || !Array.isArray(card.dexId) || card.dexId.length === 0) continue;

    const qualifying = inRangeDexIds(card.dexId, ranges);
    if (qualifying.length === 0) continue;

    const localId = localIdFromFileName(path.basename(file));

    for (const language of languages) {
      const captured = capturedDexByLanguage.get(language) as Set<number>;
      if (limit !== undefined && captured.size >= limit) continue;

      const record = buildBulkExportRecord(
        card,
        localId,
        language,
        translationsByLanguage.get(language),
        imageIndex,
        nowIso
      );
      if (!record) continue;

      if (!isSafePrimarySourceId(card.set.id) || !isSafePrimarySourceId(record.id)) {
        console.error(`  SKIPPED unsafe id: set=${JSON.stringify(card.set.id)} card=${JSON.stringify(record.id)}`);
        continue;
      }

      const cardDir = path.join(outputRoot, language, card.set.id, record.id);
      await mkdir(cardDir, { recursive: true });
      await writeFile(path.join(cardDir, 'record.json'), JSON.stringify(record, null, 2), 'utf8');

      const stats = statsByLanguage.get(language)!;
      stats.cardsWritten++;
      for (const n of qualifying) captured.add(n);
    }
  }

  for (const language of languages) {
    const stats = statsByLanguage.get(language)!;
    stats.filesScanned = files.length;
    stats.distinctDexNumbers = (capturedDexByLanguage.get(language) as Set<number>).size;
  }
}

async function main(): Promise<void> {
  const args = parseIngestArguments(process.argv.slice(2));
  const ranges = rangesForGenerations(args.generations);

  const westernLanguages = args.languages.filter((l) => dataFolderForLanguage(l) === 'data');
  const asianLanguages = args.languages.filter((l) => dataFolderForLanguage(l) === 'data-asia');

  console.log(
    `Ingesting bulk export for ${args.languages.join(',')}, generation(s) ${args.generations.join(',')}...`
  );

  const imageIndex = await loadImageAvailabilityIndex(IMAGE_INDEX_PATH);
  console.log(imageIndex ? 'Loaded image-availability cache.' : 'No image-availability cache found; image fields will be omitted.');

  const translationsByLanguage = new Map<string, TranslationDict | undefined>();
  for (const language of args.languages) {
    translationsByLanguage.set(language, await loadTranslationDict(BULK_EXPORT_ROOT, language));
  }

  const statsByLanguage = new Map<string, LanguageIngestStats>();
  for (const language of args.languages) {
    statsByLanguage.set(language, { language, filesScanned: 0, cardsWritten: 0, distinctDexNumbers: 0 });
  }

  if (westernLanguages.length > 0) {
    console.log(`Scanning western data root for: ${westernLanguages.join(',')}`);
    await convertRoot(
      path.join(BULK_EXPORT_ROOT, 'data'),
      westernLanguages,
      ranges,
      translationsByLanguage,
      imageIndex,
      args.limit,
      statsByLanguage
    );
  }

  if (asianLanguages.length > 0) {
    console.log(`Scanning Asian data root for: ${asianLanguages.join(',')}`);
    await convertRoot(
      path.join(BULK_EXPORT_ROOT, 'data-asia'),
      asianLanguages,
      ranges,
      translationsByLanguage,
      imageIndex,
      args.limit,
      statsByLanguage
    );
  }

  for (const language of args.languages) {
    const stats = statsByLanguage.get(language)!;
    console.log(
      `[${language}] files scanned: ${stats.filesScanned}, cards written: ${stats.cardsWritten}, ` +
        `distinct dex numbers: ${stats.distinctDexNumbers}`
    );
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
