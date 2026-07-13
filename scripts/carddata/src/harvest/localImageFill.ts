// scripts/carddata/src/harvest/localImageFill.ts
//
// Pure LOCAL image-recovery pass: no network calls at all. Card artwork is
// identical across every print language a set was released in -- only the
// card's own text (name, rules box) differs -- so a held card with no image
// at all can borrow another language's already-resolved image for the SAME
// physical card (same setId + localId) rather than show this app's "no
// image available" placeholder. Default source language is English; a
// Japanese target falls back to English too (ja-from-en), since English is
// this pipeline's most completely illustrated language by a wide margin.
//
// Each language pair is run against every file the two languages share: the
// flat Gen1 file (<lang>.json) plus every gen2..gen9 file
// (<lang>/gen<N>.json) -- same setId+localId join, run once per file rather
// than across the whole database at once, since each gen file is its own
// independent Record<dexNumber, CardRecord[]> keyed by that generation's own
// dex numbers.
//
// Usage: npm run harvest:local-images -- [--write] [--lang <target-code>] [--gens <csv>]
// Default is a dry-run report; nothing is written to
// public/data/cards/<lang>.json / <lang>/gen<N>.json unless --write is passed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dedupKey, type CardRecord } from '../augmentFromSupplemental';
import { PRIMARY_ORIGINAL_FILENAME, primaryHostedUrl, THUMB_FILENAME } from '../resolveCardAssets';

export interface LocalFillPair {
  targetLanguage: string;
  sourceLanguage: string;
}

/** Every European print language this project holds falls back to English; Japanese does too (ja-from-en), since English has this pipeline's deepest image coverage of any language. */
export const DEFAULT_LOCAL_FILL_PAIRS: LocalFillPair[] = [
  { targetLanguage: 'fr', sourceLanguage: 'en' },
  { targetLanguage: 'de', sourceLanguage: 'en' },
  { targetLanguage: 'es', sourceLanguage: 'en' },
  { targetLanguage: 'it', sourceLanguage: 'en' },
  { targetLanguage: 'pt', sourceLanguage: 'en' },
  { targetLanguage: 'ja', sourceLanguage: 'en' },
];

/** Gen2..Gen9 are stored as separate per-generation files alongside the flat Gen1 file -- see buildFillTargets. */
export const DEFAULT_GENS: number[] = [2, 3, 4, 5, 6, 7, 8, 9];

/** True for a held card this pass should try to fill: no primary-source image AND no hosted URL of any kind yet. */
export function hasNoImageAtAll(card: Pick<CardRecord, 'imageBase' | 'hostedThumbUrl' | 'hostedFullUrl'>): boolean {
  return !card.imageBase && !card.hostedThumbUrl && !card.hostedFullUrl;
}

/**
 * The best already-resolved image reference a source-language card can
 * offer: its own hosted URLs when it has them (covers both a primary-source
 * image and an already-resolved fallback-source image, since either one
 * always gets hostedThumbUrl/hostedFullUrl populated once resolved), or --
 * only when neither hosted field is set yet but a primary-source imageBase
 * is -- the same `pcc-assets-a` URL construction the static-database build
 * itself uses. Null when the source card has no image at all either.
 */
export function bestSourceImage(
  source: Pick<CardRecord, 'id' | 'language' | 'setId' | 'imageBase' | 'hostedThumbUrl' | 'hostedFullUrl'>
): { thumbUrl: string; fullUrl: string } | null {
  if (source.hostedThumbUrl || source.hostedFullUrl) {
    return {
      thumbUrl: source.hostedThumbUrl ?? source.hostedFullUrl!,
      fullUrl: source.hostedFullUrl ?? source.hostedThumbUrl!,
    };
  }
  if (source.imageBase) {
    return {
      thumbUrl: primaryHostedUrl(source, THUMB_FILENAME),
      fullUrl: primaryHostedUrl(source, PRIMARY_ORIGINAL_FILENAME),
    };
  }
  return null;
}

export interface LocalFillOutcome {
  targetLanguage: string;
  sourceLanguage: string;
  /** Held target cards examined with no image at all. */
  candidates: number;
  /** Of those, how many got a hostedThumbUrl/hostedFullUrl copied from the source language. */
  filled: number;
  /** Of those, how many still have no image after this pass (no source counterpart, or the source card is dark too). */
  stillMissing: number;
}

/**
 * Fills hostedThumbUrl/hostedFullUrl on every `target` card with no image at
 * all, by copying the same-print `source`-language card's own best image
 * reference (same setId + normalized localId -- the same dedup key
 * mergeHarvest.ts and augmentFromSupplemental.ts already use). `imageBase`
 * is left untouched on every record: this only ever supplies a HOSTED url,
 * never claims the primary source itself had an image. Mutates `target` in
 * place; this function performs no I/O itself, so the caller decides
 * whether the mutated object actually gets persisted (dry-run vs --write).
 */
export function fillLocalImages(
  target: Record<string, CardRecord[]>,
  source: Record<string, CardRecord[]>,
  targetLanguage: string,
  sourceLanguage: string
): LocalFillOutcome {
  const sourceIndex = new Map<string, CardRecord>();
  for (const bucket of Object.values(source)) {
    for (const card of bucket) {
      const key = dedupKey(card.setId, card.localId);
      // First one wins on a same-key collision -- mirrors every other merge
      // in this pipeline's own convention (mergeSupplemental, mergeHarvest).
      if (!sourceIndex.has(key)) sourceIndex.set(key, card);
    }
  }

  let candidates = 0;
  let filled = 0;
  for (const bucket of Object.values(target)) {
    for (const card of bucket) {
      if (!hasNoImageAtAll(card)) continue;
      candidates++;

      const sourceCard = sourceIndex.get(dedupKey(card.setId, card.localId));
      if (!sourceCard) continue;
      const best = bestSourceImage(sourceCard);
      if (!best) continue;

      card.hostedThumbUrl = best.thumbUrl;
      card.hostedFullUrl = best.fullUrl;
      filled++;
    }
  }

  return { targetLanguage, sourceLanguage, candidates, filled, stillMissing: candidates - filled };
}

// --- Multi-file targets (flat Gen1 file + per-generation files) ------------

export interface FillTarget {
  targetLanguage: string;
  sourceLanguage: string;
  /** Path relative to the cards dir, e.g. "de.json" or "de/gen3.json". */
  targetRelPath: string;
  /** Path relative to the cards dir, e.g. "en.json" or "en/gen3.json". */
  sourceRelPath: string;
  /** null for the flat Gen1 file, else the generation number. */
  gen: number | null;
}

/** The flat-file relative path for a language, e.g. "de.json". */
function flatRelPath(language: string): string {
  return `${language}.json`;
}

/** The per-generation file relative path for a language, e.g. "de/gen3.json". */
function genRelPath(language: string, gen: number): string {
  return path.posix.join(language, `gen${gen}.json`);
}

/**
 * Expands each language pair into one target per file the two languages
 * share: the flat Gen1 file, plus one target per requested gen number
 * (default DEFAULT_GENS, i.e. gen2..gen9). Pure list-building, no I/O --
 * a target naming a file that doesn't actually exist on disk yet (e.g. a
 * language that has no gen9.json) is simply skipped at load time by the
 * caller (loadCardsOptional), not filtered out here.
 */
export function buildFillTargets(pairs: LocalFillPair[], gens: number[] = DEFAULT_GENS): FillTarget[] {
  const targets: FillTarget[] = [];
  for (const pair of pairs) {
    targets.push({
      ...pair,
      targetRelPath: flatRelPath(pair.targetLanguage),
      sourceRelPath: flatRelPath(pair.sourceLanguage),
      gen: null,
    });
    for (const gen of gens) {
      targets.push({
        ...pair,
        targetRelPath: genRelPath(pair.targetLanguage, gen),
        sourceRelPath: genRelPath(pair.sourceLanguage, gen),
        gen,
      });
    }
  }
  return targets;
}

// --- CLI ---------------------------------------------------------------------

interface CliArgs {
  write: boolean;
  onlyLanguage?: string;
  gens: number[];
}

function parseGensArg(value: string): number[] {
  const gens = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s));
  if (gens.length === 0 || gens.some((g) => !Number.isInteger(g) || g < 2)) {
    throw new Error('--gens must be a comma-separated list of integers >= 2.');
  }
  return gens;
}

export function parseArgs(argv: string[]): CliArgs {
  let write = false;
  let onlyLanguage: string | undefined;
  let gens = DEFAULT_GENS;
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--write') {
      write = true;
      continue;
    }
    if (flag === '--lang') {
      onlyLanguage = args.shift();
      continue;
    }
    if (flag === '--gens') {
      const value = args.shift();
      if (value === undefined) throw new Error('--gens requires a value.');
      gens = parseGensArg(value);
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  return { write, onlyLanguage, gens };
}

async function loadCardsOptional(cardsDir: string, relPath: string): Promise<Record<string, CardRecord[]> | null> {
  try {
    return JSON.parse(await readFile(path.join(cardsDir, relPath), 'utf8')) as Record<string, CardRecord[]>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

/** One target's LocalFillOutcome plus the file-level metadata that produced it, for per-gen/per-file reporting. */
export interface FillRunOutcome extends LocalFillOutcome {
  targetRelPath: string;
  sourceRelPath: string;
  gen: number | null;
}

/**
 * Runs every target file against the JSON databases under `cardsDir`: loads
 * each target's source fresh from cache (an earlier target sharing the same
 * source file, e.g. every EU language's gen3 target reading en/gen3.json,
 * reuses one read), fills it, and writes it back only when `write` is true
 * and the pass actually changed something. A target whose target or source
 * file doesn't exist on disk (a language/gen combination this project
 * doesn't hold yet) is silently skipped rather than erroring the whole run
 * -- so the returned array can be shorter than `targets`, and each returned
 * entry carries its own target/source paths rather than relying on
 * positional alignment with the input list.
 */
export async function runLocalFill(
  cardsDir: string,
  targets: FillTarget[],
  write: boolean
): Promise<FillRunOutcome[]> {
  const sourceCache = new Map<string, Record<string, CardRecord[]> | null>();
  const outcomes: FillRunOutcome[] = [];

  for (const target of targets) {
    let sourceCards = sourceCache.get(target.sourceRelPath);
    if (sourceCards === undefined) {
      sourceCards = await loadCardsOptional(cardsDir, target.sourceRelPath);
      sourceCache.set(target.sourceRelPath, sourceCards);
    }
    if (!sourceCards) continue;

    const targetCards = await loadCardsOptional(cardsDir, target.targetRelPath);
    if (!targetCards) continue;

    const outcome = fillLocalImages(targetCards, sourceCards, target.targetLanguage, target.sourceLanguage);
    outcomes.push({ ...outcome, targetRelPath: target.targetRelPath, sourceRelPath: target.sourceRelPath, gen: target.gen });

    if (write && outcome.filled > 0) {
      const targetPath = path.join(cardsDir, target.targetRelPath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, JSON.stringify(targetCards), 'utf8');
    }
  }

  return outcomes;
}

function printSummary(outcomes: FillRunOutcome[], write: boolean): void {
  console.log(`Local image fill (same-print artwork, no network calls) -- ${write ? 'WRITE' : 'dry-run'}`);
  console.table(
    outcomes.map((o) => ({
      target: o.targetRelPath,
      source: o.sourceRelPath,
      candidates: o.candidates,
      filled: o.filled,
      stillMissing: o.stillMissing,
    }))
  );
  const totals = outcomes.reduce(
    (acc, o) => ({ candidates: acc.candidates + o.candidates, filled: acc.filled + o.filled }),
    { candidates: 0, filled: 0 }
  );
  console.log(
    `Total: ${totals.filled}/${totals.candidates} filled` +
      (write ? '.' : ' (dry-run -- nothing written; re-run with --write to apply).')
  );

  // Per-language, per-gen breakdown (gen1 shown for the flat file) so a
  // caller can see exactly where the fill landed without re-deriving it
  // from the raw per-target rows above.
  const byLanguage = new Map<string, { gen: string; filled: number }[]>();
  for (const o of outcomes) {
    const gen = o.gen === null ? 'gen1' : `gen${o.gen}`;
    const list = byLanguage.get(o.targetLanguage) ?? [];
    list.push({ gen, filled: o.filled });
    byLanguage.set(o.targetLanguage, list);
  }
  for (const [language, rows] of byLanguage) {
    const total = rows.reduce((n, r) => n + r.filled, 0);
    if (total === 0) continue;
    console.log(`  ${language}: ${rows.map((r) => `${r.gen}=${r.filled}`).join(' ')} (total ${total})`);
  }
}

const APP_CARDS_DIR = path.resolve('..', '..', 'public', 'data', 'cards');

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const pairs = cli.onlyLanguage
    ? DEFAULT_LOCAL_FILL_PAIRS.filter((p) => p.targetLanguage === cli.onlyLanguage)
    : DEFAULT_LOCAL_FILL_PAIRS;

  if (pairs.length === 0) {
    console.error(`No local-fill pair configured for target language "${cli.onlyLanguage}".`);
    process.exitCode = 1;
    return;
  }

  const targets = buildFillTargets(pairs, cli.gens);
  const outcomes = await runLocalFill(APP_CARDS_DIR, targets, cli.write);
  printSummary(outcomes, cli.write);
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('localImageFill')) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
