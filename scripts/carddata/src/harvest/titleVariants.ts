// scripts/carddata/src/harvest/titleVariants.ts
//
// Generic orthographic variants of a wiki article title, tried when a
// direct title lookup 404s. Encodes known spelling/punctuation forks the
// reference wiki's real titles use (accented vs plain "e" in the Pokemon
// word, "and" vs "&", the regional-catalog "(ATCG)" vs the base "(TCG)"
// namespace) as small, composable substitutions rather than any one
// hardcoded title -- so a brand-new set hitting the same fork later doesn't
// need a code change, just another retry-failed run.

type Transform = (title: string) => string | null;

const TRANSFORMS: Transform[] = [
  // Plain "e" vs the accented Pokemon word -- confirmed live cause of the
  // en "Play! Pokemon Prize Pack Series N (TCG)" 404s (crawl.log): the
  // manifest's gap-audit name carries the plain spelling, the real title
  // uses the accented one.
  (title) => (title.includes('Pokemon') ? title.replace(/Pokemon/g, 'Pokémon') : null),
  (title) => (title.includes('Pokémon') ? title.replace(/Pokémon/g, 'Pokemon') : null),
  // "&" vs "and" -- a common wiki title fork (e.g. "Sword & Shield").
  (title) => (/\s&\s/.test(title) ? title.replace(/\s&\s/g, ' and ') : null),
  (title) => (/\sand\s/i.test(title) ? title.replace(/\sand\s/gi, ' & ') : null),
  // Regional-catalog namespace fallback: an id/th "(ATCG)" title that
  // doesn't exist often shares its card list with the base "(TCG)" article
  // instead (see the harvester's failure-taxonomy notes on id fix 3).
  (title) => (/\(ATCG\)$/.test(title) ? title.replace(/\(ATCG\)$/, '(TCG)') : null),
];

/**
 * Generates orthographic variants of `title`, including two-substitution
 * combinations (e.g. a title needing both the accent swap and the &/and
 * swap), deduplicated and excluding the original title itself. Order is
 * stable but not meaningfully ranked -- callers try them in sequence and
 * stop at the first one that resolves.
 */
export function generateTitleVariants(title: string): string[] {
  const variants = new Set<string>();

  for (const transform of TRANSFORMS) {
    const result = transform(title);
    if (result && result !== title) variants.add(result);
  }

  for (const variant of [...variants]) {
    for (const transform of TRANSFORMS) {
      const result = transform(variant);
      if (result && result !== title) variants.add(result);
    }
  }

  return [...variants];
}
