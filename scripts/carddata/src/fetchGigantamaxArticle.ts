// scripts/carddata/src/fetchGigantamaxArticle.ts
//
// One-off tool: fetches the reference wiki's "Gigantamax" article via the
// harvester's own wikiApiClient (same politeScheduler, same endpoint) and
// writes the raw wikitext to data/ (gitignored) for offline parsing. Not
// part of the regular harvest pipeline -- run manually, once, when the VMAX
// roster needs re-deriving from the independent authoritative source.
//
// Politeness: a single request, gated well above the site's declared
// crawl-delay floor (see wikiApiClient.ts), since a background crawl shares
// this host right now and must not be disturbed.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWikiApiClient } from './harvest/wikiApiClient';

const OUT_PATH = path.resolve(import.meta.dirname, '../data/gigantamax-article.wikitext.txt');

async function main(): Promise<void> {
  const client = createWikiApiClient({ minRequestGapMs: 6000 });
  const page = await client.parsePageWikitext('Gigantamax');
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, page.wikitext, 'utf8');
  console.log(`Fetched "${page.title}" (pageId=${page.pageId}), ${page.wikitext.length} chars -> ${OUT_PATH}`);
}

main().catch((error) => {
  console.error('Fetch failed:', error);
  process.exitCode = 1;
});
