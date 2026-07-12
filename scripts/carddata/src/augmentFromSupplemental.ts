import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Augments the app's static per-language card databases
// (public/data/cards/<language>.json) with Gen1 cards from a supplemental
// community card database (an MIT-licensed repo of per-card JSON records
// built from the OFFICIAL card-site catalogs), cloned locally and passed as
// argv[2]. The primary source's Japanese and Traditional Chinese coverage
// is roughly half and a quarter (respectively) of what the official
// catalogs hold -- measured directly during the multi-source evaluation
// that motivated this script -- so this fills those gaps: metadata plus
// official-site image URLs, deduplicated against cards we already have.
//
// Usage: npx tsx src/augmentFromSupplemental.ts <supplemental-repo-root>

interface SupplementalRecord {
  url?: string;
  name?: string;
  img?: string;
  card_type?: string;
  set_name?: string;
  set_full_name?: string;
  number?: string;
  pokedex_number?: unknown;
  jp_id?: number;
  [key: string]: unknown;
}

// Mirrors the app's CardRecord shape (see src/types/index.ts) -- duplicated
// on purpose, same as buildStaticDatabase.ts, since this package has no
// build-time link to the app's src tree.
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
}

/**
 * The supplemental database's set codes carry scrape artifacts its own
 * README admits to ("dirty set_names"): a leading space, a trailing
 * ".png", or a trailing " F" marker. Underneath the dirt they are the SAME
 * official set codes the primary source uses as setIds (verified by
 * sampling: our "SV2a" = their "SV2a F", our "SV3" = their "SV3 F"), which
 * is what makes exact per-card dedup possible at all.
 */
export function normalizeSetCode(raw: string): string {
  return raw
    .trim()
    .replace(/\.(png|gif|jpe?g)$/i, '')
    .replace(/\s+F$/, '')
    .trim();
}

/** Uppercased set code + card number with leading zeros dropped, so
 *  "SV2a"+"001" and "SV2A"+"1" collide (they are the same card). */
export function dedupKey(setId: string, localId: string): string {
  return `${setId.toUpperCase()}::${String(localId).replace(/^0+(?=\d)/, '')}`;
}

/**
 * One supplemental record -> zero or more app CardRecords (one per Gen1
 * dex number it names, mirroring buildStaticDatabase's own multi-dex
 * fan-out). Non-Pokemon cards, dex-less records, and records without an
 * image URL or card number are skipped -- this augmentation exists to add
 * DISPLAYABLE cards, and a record with no image adds nothing the primary
 * source's own metadata didn't already.
 */
export function supplementalToCards(
  record: SupplementalRecord,
  language: string
): CardRecord[] {
  if (!record.card_type || !record.card_type.includes('Pok')) return [];
  if (!record.img || !record.number || !record.name || !record.set_name) return [];
  const dexMatches = String(record.pokedex_number ?? '').match(/\d+/g) ?? [];
  const dexNumbers = [...new Set(dexMatches.map(Number))].filter((n) => n >= 1 && n <= 151);
  if (dexNumbers.length === 0) return [];

  const setId = normalizeSetCode(record.set_name);
  if (!setId) return [];
  // A stable unique id: the official site's own numeric detail id, present
  // either as jp_id or embedded in the record's detail-page URL.
  const detailId =
    record.jp_id ?? Number(String(record.url ?? '').match(/\/(?:detail|card)\/(\d+)/)?.[1]);
  if (!detailId || Number.isNaN(detailId)) return [];

  return dexNumbers.map((dexNumber) => ({
    id: `${language === 'ja' ? 'jpo' : 'two'}-${detailId}`,
    name: record.name!,
    dexNumber,
    setId,
    setName: (record.set_full_name && record.set_full_name.trim()) || setId,
    localId: record.number!,
    // The supplemental source records rarity as site-internal class codes
    // (or not at all); rather than guess a mapping, these land as Unknown,
    // which the app's "Standard prints" rarity group makes viewable.
    rarity: 'Unknown',
    imageBase: '',
    language,
    hostedThumbUrl: record.img,
    hostedFullUrl: record.img,
  }));
}

async function* walkJson(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJson(full);
    else if (entry.name.endsWith('.json')) yield full;
  }
}

interface MergeOutcome {
  added: number;
  skippedExisting: number;
  overlapRate: number;
}

export function mergeSupplemental(
  existing: Record<string, CardRecord[]>,
  supplemental: CardRecord[]
): MergeOutcome {
  const existingKeys = new Set<string>();
  for (const bucket of Object.values(existing)) {
    for (const card of bucket) existingKeys.add(dedupKey(card.setId, card.localId));
  }
  let added = 0;
  let skippedExisting = 0;
  const seenSupplementalKeys = new Set<string>();
  for (const card of supplemental) {
    const key = dedupKey(card.setId, card.localId);
    if (existingKeys.has(key)) {
      skippedExisting++;
      continue;
    }
    // The supplemental data can list the same physical card under more than
    // one record (variant listings); first one wins, same as the harvest
    // pipeline's own dedup convention. Keyed per dex number so a multi-dex
    // card still lands under each of its dex entries.
    const perDexKey = `${key}@${card.dexNumber}`;
    if (seenSupplementalKeys.has(perDexKey)) continue;
    seenSupplementalKeys.add(perDexKey);
    (existing[card.dexNumber] ??= []).push(card);
    added++;
  }
  const total = added + skippedExisting;
  return { added, skippedExisting, overlapRate: total === 0 ? 0 : skippedExisting / total };
}

const TARGETS: { language: string; folder: string }[] = [
  { language: 'ja', folder: 'data_jp' },
  { language: 'zh-tw', folder: 'data_tc' },
];

async function main(): Promise<void> {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    console.error('Usage: npx tsx src/augmentFromSupplemental.ts <supplemental-repo-root>');
    process.exit(1);
  }
  const appDataDir = path.resolve('..', '..', 'public', 'data', 'cards');

  for (const { language, folder } of TARGETS) {
    const sourceDir = path.join(repoRoot, folder);
    const cards: CardRecord[] = [];
    let parsed = 0;
    for await (const file of walkJson(sourceDir)) {
      let record: SupplementalRecord;
      try {
        record = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        continue;
      }
      parsed++;
      cards.push(...supplementalToCards(record, language));
    }

    const targetPath = path.join(appDataDir, `${language}.json`);
    const existing: Record<string, CardRecord[]> = JSON.parse(await readFile(targetPath, 'utf8'));
    const before = Object.values(existing).reduce((n, b) => n + b.length, 0);
    const outcome = mergeSupplemental(existing, cards);

    // Safety valve: if almost nothing overlapped, the two sources' set
    // codes don't actually align for this language and "everything is new"
    // would really mean "everything is about to be duplicated". Overlap on
    // the cards we DO already share is the proof the join key works.
    if (outcome.overlapRate < 0.1 && outcome.skippedExisting < 50) {
      console.error(
        `${language}: ABORTED -- overlap with existing data is implausibly low ` +
          `(${outcome.skippedExisting} matches, rate ${(outcome.overlapRate * 100).toFixed(1)}%); ` +
          'the set-code join key likely does not align for this language. Nothing written.'
      );
      continue;
    }

    await writeFile(targetPath, JSON.stringify(existing), 'utf8');
    const after = Object.values(existing).reduce((n, b) => n + b.length, 0);
    console.log(
      `${language}: parsed=${parsed} supplementalGen1=${cards.length} added=${outcome.added} ` +
        `alreadyHad=${outcome.skippedExisting} (overlap ${(outcome.overlapRate * 100).toFixed(1)}%) ` +
        `-> ${before} => ${after} cards, ${(Buffer.byteLength(JSON.stringify(existing)) / 1024).toFixed(1)} KB`
    );
  }
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('augmentFromSupplemental')) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
