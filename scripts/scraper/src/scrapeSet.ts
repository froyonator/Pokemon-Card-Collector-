// scripts/scraper/src/scrapeSet.ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchRenderedHtml, closeBrowser } from './browserFetch';
import { parseSetCardList } from './parseSetCardList';
import { parseCardDetail } from './parseCardDetail';
import { downloadAndValidateImage } from './downloadImage';
import { withPoliteDelay } from './politeFetch';

const POLITE_DELAY_MS = 750;
const politeFetchHtml = withPoliteDelay(fetchRenderedHtml, POLITE_DELAY_MS);
const politeDownloadImage = withPoliteDelay(downloadAndValidateImage, POLITE_DELAY_MS);

async function main() {
  const [, , region, setId, setSlug, languageCode] = process.argv;
  if (!region || !setId || !setSlug || !languageCode) {
    console.error('Usage: npm run scrape-set -- <region> <setId> <setSlug> <languageCode>');
    console.error('Example: npm run scrape-set -- id 11921 shadowy-threats id');
    process.exit(1);
  }

  const setListUrl = `https://www.tcgcollector.com/sets/${setId}/${setSlug}?setCardCountMode=anyCardVariant&displayAs=list`;
  console.log(`Fetching set card list: ${setListUrl}`);
  const listHtml = await politeFetchHtml(setListUrl);
  const cardLinks = parseSetCardList(listHtml);
  console.log(`Found ${cardLinks.length} cards in this set.`);

  const outDir = path.join('data', languageCode);
  await mkdir(outDir, { recursive: true });

  let succeeded = 0;
  let failed = 0;

  for (const link of cardLinks) {
    const detailUrl = `https://www.tcgcollector.com/cards/${link.cardId}/${link.cardSlug}`;
    try {
      const detailHtml = await politeFetchHtml(detailUrl);
      const record = parseCardDetail(detailHtml, { cardId: link.cardId });

      const imageResult = await politeDownloadImage(record.imageUrl);
      if ('error' in imageResult) {
        console.error(`  Image failed for ${record.name} (${link.cardId}): ${imageResult.error}`);
        failed++;
        continue;
      }

      const safeCardNumber = record.cardNumber.replace(/\//g, '-');
      const baseName = `${record.expansionCode || setSlug}-${safeCardNumber || link.cardId}`;
      const ext = imageResult.image.contentType.split('/')[1] ?? 'webp';

      await writeFile(
        path.join(outDir, `${baseName}.json`),
        JSON.stringify({ ...record, imageSha256: imageResult.image.sha256, sourceCardId: link.cardId, sourceCardSlug: link.cardSlug }, null, 2)
      );
      await writeFile(path.join(outDir, `${baseName}.${ext}`), imageResult.image.bytes);

      console.log(`  OK: ${record.name} (${baseName})`);
      succeeded++;
    } catch (err) {
      console.error(`  Failed ${link.cardId}/${link.cardSlug}:`, err);
      failed++;
    }
  }

  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
  await closeBrowser();
}

main();
