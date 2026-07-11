import { readFile, readdir } from 'fs/promises';
import path from 'path';

// Independent completeness/quality audit of the built public/data/cards/*.json
// files -- deliberately re-derives dex coverage from the RAW scraped
// record.json files rather than trusting buildStaticDatabase.ts's own output,
// so a bug in that script's own dex-filtering logic would actually surface
// here instead of being silently confirmed by re-reading its own result.

interface CardRecord {
  id: string;
  name: string;
  dexNumber: number;
  setId: string;
  setName: string;
  localId: string;
  rarity: string;
  imageBase: string;
  language: string;
}

const REQUIRED_STRING_FIELDS: (keyof CardRecord)[] = [
  'id',
  'name',
  'setId',
  'setName',
  'localId',
  'rarity',
  'language',
];

const LANGUAGES = ['en', 'ja', 'fr', 'de', 'es', 'it', 'pt', 'zh-tw', 'th', 'zh-cn', 'id', 'ko'];

const SNAPSHOT_DIRS: Record<string, string> = {
  en: 'tcgdex-en-2026-07-11T10-10-28-844Z',
  ja: 'tcgdex-ja-2026-07-11T10-10-28-844Z',
  fr: 'tcgdex-2026-07-11T08-42-18-178Z',
  de: 'tcgdex-2026-07-11T08-42-18-190Z',
  es: 'tcgdex-2026-07-11T08-42-18-201Z',
  it: 'tcgdex-2026-07-11T08-42-18-216Z',
  pt: 'tcgdex-2026-07-11T08-42-18-227Z',
  'zh-tw': 'tcgdex-2026-07-11T08-34-51-811Z',
  th: 'tcgdex-2026-07-11T08-34-51-824Z',
  'zh-cn': 'tcgdex-2026-07-11T08-34-51-826Z',
  id: 'tcgdex-2026-07-11T08-34-51-828Z',
  ko: 'tcgdex-2026-07-11T08-34-51-800Z',
};

async function findAllRecordJsons(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name === 'record.json') {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function rawDexNumbersFor(language: string): Promise<Set<number>> {
  const snapshotDir = path.resolve(
    import.meta.dirname,
    '../data',
    SNAPSHOT_DIRS[language],
    language
  );
  const recordPaths = await findAllRecordJsons(snapshotDir);
  const dexNumbers = new Set<number>();
  for (const p of recordPaths) {
    const raw = JSON.parse(await readFile(p, 'utf-8'));
    // TCGdex localizes the category field per language -- fr/de/es/it/pt
    // all render it as "Pokémon" (accented) rather than English's
    // "Pokemon" (see tcgdexSource.ts's own isPokemonCard for the same
    // established fact). The scraper itself already filters to Pokemon-only
    // before ever writing a record.json, so this check is just a defensive
    // sanity re-verification, not the real gatekeeper -- but it must
    // recognize both spellings or it wrongly discards every already-valid
    // record for exactly those five languages.
    if (raw.category !== 'Pokemon' && raw.category !== 'Pokémon') continue;
    const dexIds: unknown = raw.dexId;
    if (!Array.isArray(dexIds)) continue;
    for (const d of dexIds) {
      if (typeof d === 'number' && d >= 1 && d <= 151) dexNumbers.add(d);
    }
  }
  return dexNumbers;
}

async function main(): Promise<void> {
  const publicDir = path.resolve(import.meta.dirname, '../../../public/data/cards');
  const report: string[] = [];
  let totalIssues = 0;

  for (const language of LANGUAGES) {
    const filePath = path.join(publicDir, `${language}.json`);
    const built: Record<string, CardRecord[]> = JSON.parse(await readFile(filePath, 'utf-8'));
    const builtDexNumbers = new Set(Object.keys(built).map(Number));

    const rawDexNumbers = await rawDexNumbersFor(language);

    const missingFromBuilt = [...rawDexNumbers].filter((d) => !builtDexNumbers.has(d));
    const extraInBuilt = [...builtDexNumbers].filter((d) => !rawDexNumbers.has(d));

    let emptyFieldCount = 0;
    let emptyImageCount = 0;
    let totalCards = 0;
    const emptyFieldExamples: string[] = [];
    for (const [dexNumber, cards] of Object.entries(built)) {
      for (const card of cards) {
        totalCards++;
        if (!card.imageBase) emptyImageCount++;
        for (const field of REQUIRED_STRING_FIELDS) {
          const value = card[field];
          if (value === undefined || value === null || value === '') {
            emptyFieldCount++;
            if (emptyFieldExamples.length < 5) {
              emptyFieldExamples.push(`dex ${dexNumber} card ${card.id ?? '?'}: ${field} is empty`);
            }
          }
        }
        if (typeof card.dexNumber !== 'number' || String(card.dexNumber) !== dexNumber) {
          emptyFieldCount++;
          if (emptyFieldExamples.length < 5) {
            emptyFieldExamples.push(
              `dex ${dexNumber} card ${card.id}: dexNumber field (${card.dexNumber}) doesn't match its own key`
            );
          }
        }
      }
    }

    report.push(`\n=== ${language} ===`);
    report.push(
      `  dex coverage: ${builtDexNumbers.size}/151 built, ${rawDexNumbers.size}/151 available in raw scrape`
    );
    if (missingFromBuilt.length > 0) {
      totalIssues += missingFromBuilt.length;
      report.push(
        `  ISSUE: ${missingFromBuilt.length} dex numbers have raw data but are MISSING from the built file: ${missingFromBuilt.sort((a, b) => a - b).join(', ')}`
      );
    }
    if (extraInBuilt.length > 0) {
      totalIssues += extraInBuilt.length;
      report.push(
        `  ISSUE: ${extraInBuilt.length} dex numbers exist in the built file but have NO raw data backing them: ${extraInBuilt.sort((a, b) => a - b).join(', ')}`
      );
    }
    report.push(`  ${totalCards} total card entries, ${emptyImageCount} with no image (expected for source gaps)`);
    if (emptyFieldCount > 0) {
      totalIssues += emptyFieldCount;
      report.push(`  ISSUE: ${emptyFieldCount} required-field problems, e.g.:`);
      for (const ex of emptyFieldExamples) report.push(`    - ${ex}`);
    } else {
      report.push(`  All required fields (id/name/setId/setName/localId/rarity/language) present on every card.`);
    }
  }

  report.push(`\n=== SUMMARY ===`);
  report.push(totalIssues === 0 ? 'No issues found.' : `${totalIssues} total issues found -- see above.`);
  console.log(report.join('\n'));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
