// scripts/carddata/src/harvest/enrichmentJobs.ts
//
// Builds enrichment jobs for sets we already hold but with data holes:
// missing rarity and/or a bare-code placeholder standing in for the set's
// real localized name. One job per affected (language, setId) pair -- the
// harvest run fetches that set's wiki set-list ONCE and applies it to every
// affected card by localId, rather than one fetch per card. Pure and
// network-free, same as harvestJobs.ts.

export interface LocalIncompleteIssueBucket {
  count: number;
  bySet: Record<string, string[]>;
}

export interface LocalIncompleteLanguage {
  issues: {
    rarityMissing?: LocalIncompleteIssueBucket;
    setNameIsBareCode?: LocalIncompleteIssueBucket;
    [key: string]: LocalIncompleteIssueBucket | undefined;
  };
}

export interface LocalIncompleteManifest {
  languages: Record<string, LocalIncompleteLanguage | undefined>;
}

export interface EnrichmentJob {
  language: string;
  /** Our own existing setId for this held set (e.g. "SV2a", "BW4-B") -- already in the static database, just incomplete. */
  setId: string;
  needsRarity: boolean;
  needsSetName: boolean;
  /** Every held card id (our own id scheme, e.g. "jpo-27761") in this set affected by at least one of the issues above. */
  cardIds: string[];
}

const DEFAULT_ENRICHMENT_LANGUAGES = ['ja', 'zh-tw'] as const;

/** Builds one EnrichmentJob per (language, setId) pair with at least one recorded data hole. */
export function buildEnrichmentJobs(
  localIncomplete: LocalIncompleteManifest,
  languages: readonly string[] = DEFAULT_ENRICHMENT_LANGUAGES
): EnrichmentJob[] {
  const jobs: EnrichmentJob[] = [];
  for (const language of languages) {
    const issues = localIncomplete.languages[language]?.issues ?? {};
    const rarityBySet = issues.rarityMissing?.bySet ?? {};
    const bareCodeBySet = issues.setNameIsBareCode?.bySet ?? {};
    const setIds = [...new Set([...Object.keys(rarityBySet), ...Object.keys(bareCodeBySet)])].sort();
    for (const setId of setIds) {
      const cardIds = new Set<string>([...(rarityBySet[setId] ?? []), ...(bareCodeBySet[setId] ?? [])]);
      jobs.push({
        language,
        setId,
        needsRarity: setId in rarityBySet,
        needsSetName: setId in bareCodeBySet,
        cardIds: [...cardIds].sort(),
      });
    }
  }
  return jobs;
}
