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
// Usage: npm run harvest:local-images -- [--write] [--lang <target-code>]
// Default is a dry-run report; nothing is written to
// public/data/cards/<lang>.json unless --write is passed.
import { readFile, writeFile } from 'node:fs/promises';
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

// --- CLI ---------------------------------------------------------------------

interface CliArgs {
  write: boolean;
  onlyLanguage?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  let write = false;
  let onlyLanguage: string | undefined;
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
    throw new Error(`Unknown option: ${flag}`);
  }
  return { write, onlyLanguage };
}

async function loadCards(cardsDir: string, language: string): Promise<Record<string, CardRecord[]>> {
  return JSON.parse(await readFile(path.join(cardsDir, `${language}.json`), 'utf8')) as Record<string, CardRecord[]>;
}

/**
 * Runs every pair against the JSON databases under `cardsDir`: loads each
 * pair's target fresh (so an earlier pair's in-memory mutation to a shared
 * source language, e.g. `en` supplying both `fr` and `de`, never leaks into
 * a later pair's target), fills it, and writes it back only when `write` is
 * true and the pass actually changed something. Source databases are loaded
 * once and reused across every pair that shares one.
 */
export async function runLocalFill(
  cardsDir: string,
  pairs: LocalFillPair[],
  write: boolean
): Promise<LocalFillOutcome[]> {
  const sourceCache = new Map<string, Record<string, CardRecord[]>>();
  const outcomes: LocalFillOutcome[] = [];

  for (const pair of pairs) {
    let sourceCards = sourceCache.get(pair.sourceLanguage);
    if (!sourceCards) {
      sourceCards = await loadCards(cardsDir, pair.sourceLanguage);
      sourceCache.set(pair.sourceLanguage, sourceCards);
    }

    const targetPath = path.join(cardsDir, `${pair.targetLanguage}.json`);
    const targetCards = JSON.parse(await readFile(targetPath, 'utf8')) as Record<string, CardRecord[]>;

    const outcome = fillLocalImages(targetCards, sourceCards, pair.targetLanguage, pair.sourceLanguage);
    outcomes.push(outcome);

    if (write && outcome.filled > 0) {
      await writeFile(targetPath, JSON.stringify(targetCards), 'utf8');
    }
  }

  return outcomes;
}

function printSummary(outcomes: LocalFillOutcome[], write: boolean): void {
  console.log(`Local image fill (same-print artwork, no network calls) -- ${write ? 'WRITE' : 'dry-run'}`);
  console.table(
    outcomes.map((o) => ({
      target: o.targetLanguage,
      source: o.sourceLanguage,
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

  const outcomes = await runLocalFill(APP_CARDS_DIR, pairs, cli.write);
  printSummary(outcomes, cli.write);
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('localImageFill')) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
