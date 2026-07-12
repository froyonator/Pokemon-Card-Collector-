// scripts/carddata/src/harvest/harvestJobs.ts
//
// Builds the harvest work queue from the gap manifest: one job per missing
// set, per language. Pure and network-free -- the manifest is read from
// disk by the CLI (runHarvest.ts) and handed in here as plain data, so this
// module has no filesystem or network dependency and is fully unit-testable
// against small fixture manifests.
import type { ArticleTarget } from './retryResolution';

/** One entry of `languages.<lang>.missingSets` in the gap manifest. */
export interface GapManifestSetEntry {
  name: string;
  /**
   * A short set code when the manifest recorded one (e.g. "M11", "TT22").
   * Can carry more than one sub-code for a split regional release, e.g.
   * "AS1a / AS1b" -- only the first is used for id derivation.
   */
  code: string | null;
  cardCount?: number | null;
  releaseDate?: string | null;
}

export interface GapManifest {
  languages: Record<string, { missingSets?: GapManifestSetEntry[] } | undefined>;
}

export interface HarvestJob {
  language: string;
  /**
   * The wiki article title to fetch. This is a best-effort construction
   * from the manifest entry's name (see deriveWikiArticleTitle) -- the
   * harvest run itself is the first real confirmation the article exists
   * under this exact title.
   */
  setName: string;
  /**
   * Best-effort setId proposal, consistent with the app's existing setId
   * scheme (code-derived when the manifest carries a code, otherwise a
   * compact slug of the set name). NOT authoritative: mergeHarvest writes
   * cards under this id, but a reviewer may want to rename it before the
   * merged output is treated as final.
   */
  proposedSetId: string;
  cardCount: number | null;
  releaseDate: string | null;
  /**
   * Optional multi-article override: when a job's card list is really
   * spread across more than one wiki article (a paired X/Y regional
   * release, or a JP list living in its own section of a shared article --
   * see retryResolution.ts and data/harvest/article-overrides.json), this
   * carries the full set to fetch and concatenate instead of `setName`
   * alone. Populated by the `--job retry-failed` path via the curated
   * override mapping; ordinary missing-sets jobs leave it unset.
   */
  articles?: ArticleTarget[];
}

const DEFAULT_MISSING_SET_LANGUAGES = ['en', 'ja', 'id', 'th'] as const;

// Regional-catalog languages whose sets live under the wiki's "(ATCG)"
// namespace rather than a plain "(TCG)" article -- see the harvester design
// doc's navigation-map findings for how this was confirmed.
const REGIONAL_NAMESPACE_LANGUAGES = new Set(['id', 'th']);

/**
 * Constructs the wiki article title for a missing-set manifest entry. The
 * manifest's `name` field can itself carry a parenthetical gloss added by
 * the gap audit (e.g. "ADV Expansion Pack (EX Ruby & Sapphire JP)") that is
 * NOT part of the real article title, so it is stripped before appending
 * the namespace suffix.
 */
export function deriveWikiArticleTitle(entryName: string, language: string): string {
  const baseName = entryName.replace(/\s*\([^)]*\)\s*$/, '').trim() || entryName;
  const namespace = REGIONAL_NAMESPACE_LANGUAGES.has(language) ? 'ATCG' : 'TCG';
  return `${baseName} (${namespace})`;
}

/**
 * Best-effort setId proposal. Prefers the manifest's own short code
 * (lowercased, punctuation stripped, first sub-code only) since that is
 * exactly the existing setId scheme's own convention for subset-coded sets
 * (e.g. our held "SV2a" is used bare, not combined with "SV2b"). Falls back
 * to a compact slug of the set name when no code was recorded.
 */
export function deriveProposedSetId(entry: GapManifestSetEntry): string {
  if (entry.code) {
    const first = entry.code.split('/')[0]?.trim() ?? '';
    const cleaned = first.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (cleaned) return cleaned;
  }
  return slugifySetName(entry.name);
}

function slugifySetName(name: string): string {
  const withoutParenthetical = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const base = (withoutParenthetical || name).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return base || 'set';
}

/** Builds one HarvestJob per missingSets entry, for each requested language (default: en/ja/id/th, matching the manifest's confirmed real-gap languages). */
export function buildMissingSetJobs(
  manifest: GapManifest,
  languages: readonly string[] = DEFAULT_MISSING_SET_LANGUAGES
): HarvestJob[] {
  const jobs: HarvestJob[] = [];
  for (const language of languages) {
    const missingSets = manifest.languages[language]?.missingSets ?? [];
    for (const entry of missingSets) {
      jobs.push({
        language,
        setName: deriveWikiArticleTitle(entry.name, language),
        proposedSetId: deriveProposedSetId(entry),
        cardCount: entry.cardCount ?? null,
        releaseDate: entry.releaseDate ?? null,
      });
    }
  }
  return jobs;
}

// --- zh-cn (curated article mapping) -----------------------------------------
//
// The gap manifest carries no per-set data for zh-cn -- languages.zh-cn
// .missingSets has one aggregated "CS-series sets (49 sets...)" entry, not
// 49 real ones -- so buildMissingSetJobs can't drive a zh-cn harvest the way
// it does for en/ja/id/th. Instead, --lang zh-cn --job missing-sets is
// driven by a hand-curated article mapping (data/harvest/zh-cn-articles.json,
// gitignored) built from the zh-cn source-recon notes: one entry per
// discoverable (ATCG)-namespace article, each with an optional CS-series
// code lifted from that recon pass.

/** One entry of the curated zh-cn article mapping file. */
export interface ZhCnArticleMappingEntry {
  /** Stable slug identifying this entry regardless of whether an article was found (used for unresolved reporting). */
  key: string;
  /** The wiki article title to fetch verbatim, already carrying its "(ATCG)" suffix, or null when no article is known yet. */
  articleTitle: string | null;
  /**
   * A CS-series code recorded by the recon pass (e.g. "CS35"), or a
   * split code for a multi-subset set (e.g. "CS5a / CS5b" -- only the
   * first is used for id derivation, same convention as
   * deriveProposedSetId). Null when no code is known yet -- the live
   * infobox is the authoritative source for this at harvest time.
   */
  csCode: string | null;
  /** Free-form provenance/context note; surfaced verbatim for unresolved entries so the runner can report them meaningfully. */
  notes: string;
  cardCount?: number | null;
}

export interface ZhCnArticleMappingFile {
  sets: ZhCnArticleMappingEntry[];
}

export interface ZhCnUnresolvedEntry {
  key: string;
  notes: string;
}

export interface ZhCnJobBuildResult {
  jobs: HarvestJob[];
  unresolved: ZhCnUnresolvedEntry[];
}

/**
 * Best-effort setId for a zh-cn mapping entry: prefers the mapping's own
 * CS-series code (lowercased, punctuation stripped, first sub-code only --
 * same convention as deriveProposedSetId), falling back to a compact slug
 * of the article title (or the mapping key, when even the article title is
 * unknown) when no code was recorded.
 */
export function deriveZhCnSetId(
  entry: Pick<ZhCnArticleMappingEntry, 'csCode' | 'key' | 'articleTitle'>
): string {
  if (entry.csCode) {
    const first = entry.csCode.split('/')[0]?.trim() ?? '';
    const cleaned = first.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (cleaned) return cleaned;
  }
  return slugifySetName(entry.articleTitle ?? entry.key);
}

/**
 * Builds zh-cn missing-set jobs from the curated article mapping. Entries
 * with no known `articleTitle` are NOT turned into jobs -- there is nothing
 * to fetch -- they are returned separately as `unresolved` so the CLI can
 * report them instead of silently dropping them or failing the whole run.
 * The `articleTitle` is used verbatim as the job's setName: these titles
 * already end in "(ATCG)" from the recon pass, so (unlike
 * deriveWikiArticleTitle) no namespace suffix is appended here.
 */
export function buildZhCnJobs(mapping: ZhCnArticleMappingFile): ZhCnJobBuildResult {
  const jobs: HarvestJob[] = [];
  const unresolved: ZhCnUnresolvedEntry[] = [];
  for (const entry of mapping.sets) {
    if (!entry.articleTitle) {
      unresolved.push({ key: entry.key, notes: entry.notes });
      continue;
    }
    jobs.push({
      language: 'zh-cn',
      setName: entry.articleTitle,
      proposedSetId: deriveZhCnSetId(entry),
      cardCount: entry.cardCount ?? null,
      releaseDate: null,
    });
  }
  return { jobs, unresolved };
}
