// scripts/carddata/src/generateFullDex.ts
//
// One-time generator for src/data/fullDex.ts -- the canonical 1-1025
// National Dex list (English display names + generation) used to slice
// card data into public/data/cards/<lang>/gen<N>.json files. Run via
// `npm run generate-dex` from scripts/carddata and commit the regenerated
// fullDex.ts alongside this script, so the live fetch below never needs to
// run again in normal operation.
//
// Source: PokeAPI's own public GitHub data export -- a couple of plain CSV
// fetches (not the paginated REST API, which would be one request per
// species). PokeAPI is a general Pokemon-species metadata project, entirely
// unrelated to this pipeline's card-data sources.
// https://github.com/PokeAPI/pokeapi, data/v2/csv/pokemon_species_names.csv.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GEN1_DEX } from '../../../src/data/gen1Dex';
import { generationForDexNumber } from './data/genRanges';

const SPECIES_NAMES_CSV_URL =
  'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';

// PokeAPI's languages.csv row 9 is English -- confirmed live against the
// fetched CSV (species 1's local_language_id=9 row reads "Bulbasaur").
const ENGLISH_LANGUAGE_ID = '9';

const TOTAL_SPECIES = 1025;

export interface FullDexEntry {
  number: number;
  name: string;
  generation: number;
}

/**
 * Converts a PokeAPI display name to this app's own display convention
 * (matching src/data/gen1Dex.ts): the curly right-single-quote PokeAPI uses
 * in "Farfetch'd"/"Sirfetch'd" (U+2019) becomes a plain ASCII apostrophe,
 * and the gender symbols PokeAPI uses for the Nidoran pair (U+2640/U+2642)
 * become the ASCII "-F"/"-M" suffix gen1Dex.ts already established. Every
 * other name (accents included, e.g. "Flabebe") passes through unchanged --
 * those ARE the correct display form.
 */
export function toAppDisplayName(pokeApiName: string): string {
  return pokeApiName.replace(/’/g, "'").replace(/♀/g, '-F').replace(/♂/g, '-M');
}

/**
 * Pure CSV-row parse: species id, language id, name -- the only three
 * fields this generator needs (genus and beyond are ignored). Assumes no
 * field before the fourth column contains a literal comma, true of every
 * local_language_id=9 (English) row in this file (verified live against the
 * full file before this script was written).
 */
export function parseSpeciesNameRow(
  line: string
): { speciesId: number; languageId: string; name: string } | null {
  const parts = line.split(',');
  if (parts.length < 3) return null;
  const speciesId = Number(parts[0]);
  if (!Number.isInteger(speciesId)) return null;
  return { speciesId, languageId: parts[1], name: parts[2] };
}

/** Builds species id -> English display name from the raw CSV text. */
export function buildEnglishNameMap(csvText: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = csvText.split('\n');
  for (const line of lines.slice(1)) {
    // skip the header row
    const parsed = parseSpeciesNameRow(line);
    if (!parsed || parsed.languageId !== ENGLISH_LANGUAGE_ID) continue;
    map.set(parsed.speciesId, toAppDisplayName(parsed.name));
  }
  return map;
}

/**
 * Pure transform: name map -> the full ordered 1..total dex list. Throws if
 * any number in range is missing a name, rather than silently emitting a
 * gap -- a missing entry means the upstream CSV changed shape or this
 * generator's parsing broke, either of which needs a human to look, not a
 * silently truncated fullDex.ts.
 */
export function buildFullDex(
  nameByNumber: Map<number, string>,
  total: number = TOTAL_SPECIES
): FullDexEntry[] {
  const entries: FullDexEntry[] = [];
  const missing: number[] = [];
  for (let number = 1; number <= total; number++) {
    const name = nameByNumber.get(number);
    if (!name) {
      missing.push(number);
      continue;
    }
    entries.push({ number, name, generation: generationForDexNumber(number) });
  }
  if (missing.length > 0) {
    throw new Error(`Missing English name(s) for dex number(s): ${missing.join(', ')}`);
  }
  return entries;
}

/**
 * Cross-checks the generated Gen1 slice against the app's own
 * hand-maintained src/data/gen1Dex.ts -- any mismatch is a real bug in
 * either this generator's name mapping or gen1Dex.ts itself, and must be
 * reported rather than silently allowed to diverge (see this task's own
 * instructions).
 */
export function diffAgainstGen1Dex(fullDex: FullDexEntry[]): string[] {
  const mismatches: string[] = [];
  const byNumber = new Map(fullDex.map((entry) => [entry.number, entry]));
  for (const gen1Entry of GEN1_DEX) {
    const generated = byNumber.get(gen1Entry.number);
    if (!generated) {
      mismatches.push(`#${gen1Entry.number}: missing from generated list (expected "${gen1Entry.name}")`);
      continue;
    }
    if (generated.name !== gen1Entry.name) {
      mismatches.push(`#${gen1Entry.number}: generated "${generated.name}" vs gen1Dex.ts "${gen1Entry.name}"`);
    }
  }
  return mismatches;
}

function formatEntry(entry: FullDexEntry): string {
  return `  { number: ${entry.number}, name: ${JSON.stringify(entry.name)}, generation: ${entry.generation} },`;
}

export function renderFullDexModule(entries: FullDexEntry[]): string {
  const lines = entries.map(formatEntry).join('\n');
  return `// GENERATED by scripts/carddata/src/generateFullDex.ts -- do not hand-edit.
// Run \`npm run generate-dex\` from scripts/carddata to regenerate.
//
// The canonical National Dex list, numbers 1-${TOTAL_SPECIES}, with English
// display names (matching this app's own casing/punctuation conventions --
// see src/data/gen1Dex.ts and generateFullDex.ts's toAppDisplayName) and the
// generation each dex number belongs to (see src/data/genRanges.ts for the
// range boundaries this was computed from).
export interface FullDexEntry {
  number: number;
  name: string;
  generation: number;
}

export const FULL_DEX: FullDexEntry[] = [
${lines}
];
`;
}

async function main(): Promise<void> {
  console.log('Fetching species names...');
  const response = await fetch(SPECIES_NAMES_CSV_URL);
  if (!response.ok) throw new Error(`Failed to fetch species names CSV: HTTP ${response.status}`);
  const csvText = await response.text();

  const nameByNumber = buildEnglishNameMap(csvText);
  const fullDex = buildFullDex(nameByNumber);

  const mismatches = diffAgainstGen1Dex(fullDex);
  if (mismatches.length > 0) {
    console.error('Gen1 name mismatch(es) against src/data/gen1Dex.ts:');
    for (const m of mismatches) console.error(`  ${m}`);
    throw new Error(`${mismatches.length} Gen1 name mismatch(es) -- see above. Not writing fullDex.ts.`);
  }
  console.log(`Verified: all ${GEN1_DEX.length} Gen1 names match src/data/gen1Dex.ts exactly.`);

  const outPath = path.resolve(import.meta.dirname, 'data', 'fullDex.ts');
  await writeFile(outPath, renderFullDexModule(fullDex), 'utf8');
  console.log(`Wrote ${fullDex.length} entries to ${outPath}`);
}

if (process.argv[1] && process.argv[1].includes('generateFullDex')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
