// scripts/carddata/src/scrapeSet.ts
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchRenderedHtml, closeBrowser, configureBrowserSession } from './browserFetch';
import { STORAGE_STATE_ENV_VAR } from './sessionState';
import { parseSetCardList } from './parseSetCardList';
import { parseCardDetail } from './parseCardDetail';
import { downloadAndValidateImage } from './downloadImage';
import { withPoliteDelay } from './politeFetch';
import { validateCardRecord } from './validateCardRecord';

const POLITE_DELAY_MS = 750;
const politeFetchHtml = withPoliteDelay(fetchRenderedHtml, POLITE_DELAY_MS);
const politeDownloadImage = withPoliteDelay(downloadAndValidateImage, POLITE_DELAY_MS);

async function main() {
  const args = process.argv.slice(2);
  const storageStateFlagIndex = args.indexOf('--storage-state');
  let storageStatePath: string | undefined;
  if (storageStateFlagIndex !== -1) {
    storageStatePath = args[storageStateFlagIndex + 1];
    if (!storageStatePath || storageStatePath.startsWith('--')) {
      console.error(
        'Error: --storage-state requires a path to a Playwright storage-state JSON file.'
      );
      throw new Error('Invalid command line.');
    }
    args.splice(storageStateFlagIndex, 2);
  }

  const [region, setId, setSlug, languageCode] = args;
  if (!region || !setId || !setSlug || !languageCode) {
    console.error(
      'Usage: npm run harvest-set -- <region> <setId> <setSlug> <languageCode> [--storage-state <path>]'
    );
    console.error(
      'Example: npm run harvest-set -- id 11921 shadowy-threats id --storage-state .auth/storage-state.json'
    );
    console.error(`Alternatively, set ${STORAGE_STATE_ENV_VAR} to the storage-state path.`);
    throw new Error('Invalid command line.');
  }

  if (args.length !== 4) {
    throw new Error(`Unexpected argument(s): ${args.slice(4).join(' ')}`);
  }

  if (!new Set(['intl', 'jp', 'cn', 'id']).has(region)) {
    throw new Error(`Unsupported region: ${region}. Expected intl, jp, cn, or id.`);
  }
  if (!/^\d+$/.test(setId)) throw new Error('Set id must contain only digits.');
  if (!/^[a-z0-9-]+$/.test(setSlug)) throw new Error('Set slug contains unsupported characters.');
  if (!/^[a-z0-9-]+$/.test(languageCode)) {
    throw new Error('Language code contains unsupported characters.');
  }

  configureBrowserSession(storageStatePath);

  const setListUrl = `https://www.tcgcollector.com/sets/${setId}/${setSlug}?setCardCountMode=anyCardVariant&displayAs=list`;
  console.log(`Fetching set card list: ${setListUrl}`);
  const listHtml = await politeFetchHtml(setListUrl);
  const cardLinks = parseSetCardList(listHtml);
  if (cardLinks.length === 0) {
    throw new Error(
      'The set page contained no card links. The page may be a challenge/interstitial or the site markup may have changed.'
    );
  }
  console.log(`Found ${cardLinks.length} cards in this set.`);

  const snapshotId = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingRoot = path.join('data', `.${snapshotId}.staging`);
  const finalRoot = path.join('data', snapshotId);
  const stagingDir = path.join(stagingRoot, languageCode, setId);
  const outDir = path.join('data', snapshotId, languageCode, setId);
  await mkdir(stagingDir, { recursive: true });

  let succeeded = 0;
  let failed = 0;

  let published = false;
  try {
    for (const link of cardLinks) {
      const detailUrl = `https://www.tcgcollector.com/cards/${link.cardId}/${link.cardSlug}`;
      try {
        const detailHtml = await politeFetchHtml(detailUrl);
        const record = parseCardDetail(detailHtml, { cardId: link.cardId });
        const recordErrors = validateCardRecord(record, { cardId: link.cardId, setId });
        if (recordErrors.length > 0) {
          throw new Error(`Invalid card detail page: ${recordErrors.join('; ')}`);
        }

        const imageResult = await politeDownloadImage(record.imageUrl);
        if ('error' in imageResult) {
          console.error(`  Image failed for ${record.name} (${link.cardId}): ${imageResult.error}`);
          failed++;
          continue;
        }

        const safeCardNumber = record.cardNumber
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
          .replace(/[. ]+$/g, '');
        const baseName = `${safeCardNumber || 'unknown'}-${link.cardId}`;
        const ext = imageResult.image.contentType.split('/')[1] ?? 'webp';
        const imageFile = `${baseName}.${ext}`;

        await writeFile(path.join(stagingDir, imageFile), imageResult.image.bytes);
        await writeFile(
          path.join(stagingDir, `${baseName}.json`),
          JSON.stringify(
            {
              ...record,
              language: languageCode,
              region,
              imageFile,
              imageSha256: imageResult.image.sha256,
              imageWidth: imageResult.image.width,
              imageHeight: imageResult.image.height,
              sourceSetId: setId,
              sourceSetSlug: setSlug,
              sourceCardId: link.cardId,
              sourceCardSlug: link.cardSlug,
              sourceUrl: detailUrl,
            },
            null,
            2
          )
        );

        console.log(`  OK: ${record.name} (${baseName})`);
        succeeded++;
      } catch (err) {
        console.error(`  Failed ${link.cardId}/${link.cardSlug}:`, err);
        failed++;
      }
    }

    console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
    if (failed > 0) {
      throw new Error(`Harvest incomplete: ${failed} of ${cardLinks.length} cards failed.`);
    }

    await writeFile(
      path.join(stagingDir, 'manifest.json'),
      JSON.stringify(
        {
          snapshotId,
          createdAt: new Date().toISOString(),
          region,
          language: languageCode,
          setId,
          setSlug,
          cardCount: succeeded,
          sourceUrl: setListUrl,
        },
        null,
        2
      )
    );
    await mkdir(finalRoot, { recursive: false });
    await cp(stagingRoot, finalRoot, { recursive: true });
    await writeFile(
      path.join(finalRoot, 'manifest.json'),
      JSON.stringify({ snapshotId, completedAt: new Date().toISOString(), complete: true }, null, 2)
    );
    await rm(stagingRoot, { recursive: true, force: true });
    published = true;
    console.log(`Published immutable snapshot: ${outDir}`);
  } finally {
    if (!published) {
      await rm(stagingRoot, { recursive: true, force: true });
      await rm(finalRoot, { recursive: true, force: true });
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
