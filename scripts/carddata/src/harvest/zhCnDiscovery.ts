// scripts/carddata/src/harvest/zhCnDiscovery.ts
//
// Pure merge logic for `--job discover-zh-cn` (runHarvest.ts): folds a
// broader title-search sweep's results into the curated zh-cn article
// mapping (data/harvest/zh-cn-articles.json) without ever overwriting an
// existing entry -- the sweep is meant to fill in the ~20 CS-series sets
// the recon pass's narrower search never found an article for at all, not
// to second-guess entries a human already curated.
import type { ZhCnArticleMappingEntry, ZhCnArticleMappingFile } from './harvestJobs';
import type { WikiSearchResult } from './types';

/** A stable, human-legible mapping key derived from an article title (mirrors the curated mapping's own key style, e.g. "gallant-galaxy"). */
export function slugifyArticleTitle(title: string): string {
  const withoutNamespace = title.replace(/\s*\(A?TCG\)\s*$/i, '').trim();
  const slug = (withoutNamespace || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'set';
}

export interface ZhCnDiscoveryResult {
  mapping: ZhCnArticleMappingFile;
  addedCount: number;
  addedKeys: string[];
}

/**
 * Merges newly discovered `(ATCG)` article titles into `mapping`, appending
 * one new entry per title not already present (matched on articleTitle,
 * case-insensitively) and skipping anything that isn't actually in the
 * `(ATCG)` namespace (a broad title search can surface unrelated hits).
 * Every existing entry is left completely untouched, including its key --
 * this only ever appends.
 */
export function mergeDiscoveredZhCnArticles(
  mapping: ZhCnArticleMappingFile,
  discovered: WikiSearchResult[]
): ZhCnDiscoveryResult {
  const knownTitles = new Set(
    mapping.sets.map((entry) => entry.articleTitle?.trim().toLowerCase()).filter((t): t is string => Boolean(t))
  );
  const knownKeys = new Set(mapping.sets.map((entry) => entry.key));

  const added: ZhCnArticleMappingEntry[] = [];
  for (const result of discovered) {
    const title = result.title.trim();
    if (!/\(ATCG\)$/i.test(title)) continue;
    if (knownTitles.has(title.toLowerCase())) continue;

    let key = slugifyArticleTitle(title);
    let suffix = 2;
    while (knownKeys.has(key)) key = `${slugifyArticleTitle(title)}-${suffix++}`;

    knownTitles.add(title.toLowerCase());
    knownKeys.add(key);
    added.push({
      key,
      articleTitle: title,
      csCode: null,
      notes: 'Discovered by the broader (ATCG) title sweep (--job discover-zh-cn); CS code and card count unconfirmed pending a real harvest.',
    });
  }

  return {
    mapping: { ...mapping, sets: [...mapping.sets, ...added] },
    addedCount: added.length,
    addedKeys: added.map((entry) => entry.key),
  };
}
