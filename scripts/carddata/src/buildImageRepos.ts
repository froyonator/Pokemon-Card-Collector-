import { mkdir, readdir, copyFile, stat } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

// Walks a snapshot directory (as produced by the snapshot-* scripts) and
// copies every image it finds into a staging directory that mirrors a
// dedicated images repo, alongside a generated thumbnail. Kept as its own
// script (not part of buildStaticDatabase.ts) since this is a much heavier,
// much longer-running operation -- image I/O and resizing across every
// generation, not just the ~151 Gen1 dex numbers that script cares about --
// run once to populate the images repos, not on every static-database build.

const THUMB_WIDTH = 300; // enough for a grid tile; zoom/enlarge uses the original.
const CONCURRENCY = 24; // sharp's resize is CPU-bound; this is a throughput/memory tradeoff, not a politeness limit like the live harvesters use.

interface ImageJob {
  srcPath: string;
  destDir: string; // relative to the repo root, e.g. "en/base1/base1-1"
  ext: string;
}

async function findImages(
  snapshotDir: string,
  repoRelativePrefix: string
): Promise<ImageJob[]> {
  const jobs: ImageJob[] = [];
  async function walk(dir: string, relPrefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, `${relPrefix}/${entry.name}`);
        continue;
      }
      if (entry.name === 'record.json' || entry.name.endsWith('.json')) continue;
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!['webp', 'jpeg', 'jpg', 'png'].includes(ext)) continue;
      // relPrefix looks like "/ja/10/1" (image is the only non-json file in
      // its own per-card directory) -- drop the leading slash and the
      // image's own filename, the parent path IS the card's identity.
      const destDir = `${repoRelativePrefix}${relPrefix}`.replace(/^\/+/, '');
      jobs.push({ srcPath: full, destDir, ext });
    }
  }
  await walk(snapshotDir, '');
  return jobs;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function processJob(job: ImageJob, repoRoot: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const outDir = path.join(repoRoot, job.destDir);
  try {
    await mkdir(outDir, { recursive: true });
    const originalDest = path.join(outDir, `original.${job.ext}`);
    await copyFile(job.srcPath, originalDest);
    const thumbDest = path.join(outDir, 'thumb.webp');
    await sharp(job.srcPath)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbDest);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface SourceSpec {
  name: string;
  repoRoot: string;
  snapshots: { snapshotDir: string; repoRelativePrefix: string }[];
}

async function buildSource(spec: SourceSpec): Promise<void> {
  console.log(`\n=== ${spec.name} ===`);
  await mkdir(spec.repoRoot, { recursive: true });
  const allJobs: ImageJob[] = [];
  for (const { snapshotDir, repoRelativePrefix } of spec.snapshots) {
    const jobs = await findImages(snapshotDir, repoRelativePrefix);
    console.log(`  ${path.basename(snapshotDir)} -> ${repoRelativePrefix}: ${jobs.length} images found`);
    allJobs.push(...jobs);
  }
  console.log(`  Total: ${allJobs.length} images to process`);

  let done = 0;
  let failed = 0;
  const startedAt = Date.now();
  await mapWithConcurrency(allJobs, CONCURRENCY, async (job) => {
    const result = await processJob(job, spec.repoRoot);
    done += 1;
    if (!result.ok) {
      failed += 1;
      console.error(`  FAILED ${job.srcPath}: ${result.error}`);
    }
    if (done % 2000 === 0 || done === allJobs.length) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = done / elapsedSec;
      const etaSec = (allJobs.length - done) / rate;
      console.log(
        `  ${done}/${allJobs.length} (${failed} failed) -- ${rate.toFixed(1)}/s, ETA ${Math.round(etaSec / 60)}m`
      );
    }
    return result;
  });

  console.log(`  Done: ${done - failed}/${allJobs.length} succeeded, ${failed} failed`);
}

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
const REPOS_DIR = path.resolve(import.meta.dirname, '../image-repos');

const PRIMARY_SOURCE_LANGUAGE_SNAPSHOTS: Record<string, string> = {
  en: 'tcgdex-en-2026-07-11T10-10-28-844Z',
  ja: 'tcgdex-ja-2026-07-11T10-10-28-844Z',
  fr: 'tcgdex-2026-07-11T08-42-18-178Z',
  de: 'tcgdex-2026-07-11T08-42-18-190Z',
  es: 'tcgdex-2026-07-11T08-42-18-201Z',
  it: 'tcgdex-2026-07-11T08-42-18-216Z',
  pt: 'tcgdex-2026-07-11T08-42-18-227Z',
  'zh-tw': 'tcgdex-2026-07-11T08-34-51-811Z',
  th: 'tcgdex-2026-07-11T08-34-51-824Z',
  'zh-cn': 'tcgdex-2026-07-11T08-34-51-826Z',
  id: 'tcgdex-2026-07-11T08-34-51-828Z',
  ko: 'tcgdex-2026-07-11T08-34-51-800Z',
};

async function main(): Promise<void> {
  const primarySourceSnapshots = Object.entries(PRIMARY_SOURCE_LANGUAGE_SNAPSHOTS).map(([lang, dir]) => ({
    snapshotDir: path.join(DATA_DIR, dir, lang),
    repoRelativePrefix: `/${lang}`,
  }));
  // Sanity check every snapshot dir actually exists before starting a
  // multi-hour run -- fail fast on a typo'd path instead of discovering it
  // partway through.
  for (const spec of primarySourceSnapshots) {
    await stat(spec.snapshotDir);
  }

  await buildSource({
    name: 'primary source (all 12 covered languages, all generations)',
    repoRoot: path.join(REPOS_DIR, 'pcc-images-primary'),
    snapshots: primarySourceSnapshots,
  });

  await buildSource({
    name: 'English fallback source (en, all generations)',
    repoRoot: path.join(REPOS_DIR, 'pcc-images-english-fallback'),
    snapshots: [
      {
        snapshotDir: path.join(DATA_DIR, 'pkmncards-en-2026-07-11T08-34-52-015Z', 'en'),
        repoRelativePrefix: '/en',
      },
    ],
  });

  await buildSource({
    name: 'Japanese fallback source (ja, all generations)',
    repoRoot: path.join(REPOS_DIR, 'pcc-images-japanese-fallback'),
    snapshots: [
      {
        snapshotDir: path.join(DATA_DIR, 'artofpkm-ja-2026-07-11T08-34-52-017Z', 'ja'),
        repoRelativePrefix: '/ja',
      },
    ],
  });

  console.log('\nALL_SOURCES_DONE');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
