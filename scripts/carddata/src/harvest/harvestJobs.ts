// scripts/carddata/src/harvest/harvestJobs.ts
//
// Builds the harvest work queue from the gap manifest: one job per missing
// set, per language. Pure and network-free -- the manifest is read from
// disk by the CLI (runHarvest.ts) and handed in here as plain data, so this
// module has no filesystem or network dependency and is fully unit-testable
// against small fixture manifests.

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
