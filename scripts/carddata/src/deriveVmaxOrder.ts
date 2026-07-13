// scripts/carddata/src/deriveVmaxOrder.ts
//
// One-off tool: derives each VMAX-relevant species' first English VMAX card
// release date, straight from the local bulk export clone at
// data/bulk-export/ (zero live network calls -- same offline
// dynamic-import technique bulkExportGen1Backfill.ts and bulkExportIngest.ts
// use for their own set metadata). Not part of the regular pipeline -- run
// manually, once, to compute the `order` values hardcoded into
// src/data/vmaxDex.ts. Prints one line per species: dex, name, earliest
// releaseDate, source setId.
//
// Scope: only reads en (English) VMAX-tagged cards from
// public/data/cards/en.json and public/data/cards/en/gen*.json, and only
// resolves releaseDate for the setId each such card belongs to. English
// covers every species with a VMAX card at all (verified against every
// other language during the roster audit), so this is enough to derive a
// release-order ranking -- exact-to-the-day precision for non-English
// releases isn't the goal, first-to-market order is.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildSetIdIndex } from './bulkExportIngest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const CARDS_DIR = path.join(REPO_ROOT, 'public/data/cards');
const BULK_EXPORT_WESTERN_ROOT = path.join(REPO_ROOT, 'scripts/carddata/data/bulk-export/data');

interface CardRecord {
  name: string;
  dexNumber: number;
  setId: string;
}

async function loadEnVmaxCards(): Promise<CardRecord[]> {
  const files = [path.join(CARDS_DIR, 'en.json')];
  const genDir = path.join(CARDS_DIR, 'en');
  for (const entry of await readdir(genDir)) {
    if (entry.endsWith('.json')) files.push(path.join(genDir, entry));
  }

  const results: CardRecord[] = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(file, 'utf8')) as Record<string, CardRecord[]>;
    for (const cards of Object.values(data)) {
      for (const card of cards) {
        if (/VMAX/.test(card.name)) results.push(card);
      }
    }
  }
  return results;
}

async function main(): Promise<void> {
  const cards = await loadEnVmaxCards();
  const setIdIndex = await buildSetIdIndex(BULK_EXPORT_WESTERN_ROOT);

  const releaseDateCache = new Map<string, string | null>();
  async function releaseDateFor(setId: string): Promise<string | null> {
    if (releaseDateCache.has(setId)) return releaseDateCache.get(setId)!;
    const entry = setIdIndex.get(setId);
    if (!entry) {
      releaseDateCache.set(setId, null);
      return null;
    }
    const setFilePath = `${entry.cardDir}.ts`;
    try {
      const mod = (await import(`file://${setFilePath.replace(/\\/g, '/')}`)) as {
        default?: { releaseDate?: unknown };
      };
      const raw = mod.default?.releaseDate;
      const date = typeof raw === 'string' ? raw : typeof raw === 'object' && raw !== null ? (raw as Record<string, string>).en ?? null : null;
      releaseDateCache.set(setId, date);
      return date;
    } catch {
      releaseDateCache.set(setId, null);
      return null;
    }
  }

  const bySpeciesName = new Map<string, { dex: number; earliest: string | null; setId: string | null }>();
  for (const card of cards) {
    const date = await releaseDateFor(card.setId);
    const existing = bySpeciesName.get(card.name);
    const isEarlier = date !== null && (!existing?.earliest || date < existing.earliest);
    if (!existing) {
      bySpeciesName.set(card.name, { dex: card.dexNumber, earliest: date, setId: date ? card.setId : null });
    } else if (isEarlier) {
      bySpeciesName.set(card.name, { dex: card.dexNumber, earliest: date, setId: card.setId });
    }
  }

  const rows = [...bySpeciesName.entries()].sort((a, b) => {
    const da = a[1].earliest ?? '9999-99-99';
    const db = b[1].earliest ?? '9999-99-99';
    return da === db ? a[1].dex - b[1].dex : da.localeCompare(db);
  });

  for (const [name, info] of rows) {
    console.log(`${info.earliest ?? 'UNKNOWN'}\tdex=${info.dex}\t${name}\t(${info.setId})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
