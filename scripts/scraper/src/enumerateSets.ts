import { closeBrowser, configureBrowserSession, fetchRenderedHtml } from './browserFetch';
import { parseRegionSetList } from './parseRegionSetList';
import { STORAGE_STATE_ENV_VAR } from './sessionState';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const storageStateFlagIndex = args.indexOf('--storage-state');
  let storageStatePath: string | undefined;
  if (storageStateFlagIndex !== -1) {
    storageStatePath = args[storageStateFlagIndex + 1];
    if (!storageStatePath || storageStatePath.startsWith('--')) {
      throw new Error('--storage-state requires a Playwright storage-state JSON path.');
    }
    args.splice(storageStateFlagIndex, 2);
  }

  const [region] = args;
  if (!region || args.length !== 1) {
    throw new Error(
      `Usage: npm run enumerate-sets -- <intl|jp|cn|id> [--storage-state <path>] (or set ${STORAGE_STATE_ENV_VAR})`
    );
  }
  if (!new Set(['intl', 'jp', 'cn', 'id']).has(region)) {
    throw new Error(`Unsupported region: ${region}. Expected intl, jp, cn, or id.`);
  }

  configureBrowserSession(storageStatePath);
  const sourceUrl = `https://www.tcgcollector.com/sets/${region}`;
  const sets = parseRegionSetList(await fetchRenderedHtml(sourceUrl));
  if (sets.length === 0) {
    throw new Error(
      'The region page contained no set links. The page may be a challenge/interstitial or the site markup may have changed.'
    );
  }

  console.log(JSON.stringify({ region, sourceUrl, setCount: sets.length, sets }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
