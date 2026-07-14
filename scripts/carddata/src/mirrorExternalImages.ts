// scripts/carddata/src/mirrorExternalImages.ts
//
// Every hostedThumbUrl/hostedFullUrl this pipeline's harvesters have written
// so far either points at pcc-assets-a (the self-hosted mirror, see
// resolveCardAssets.ts) or, for a real slice of harvested records
// (mergeHarvest.ts's harvestedCardToRecord / mergeImages), directly at the
// upstream host the harvester read the image from
// (archives.bulbagarden.net, www.pokemon-card.com, asia.pokemon-card.com --
// and a handful of stray assets.tcgdex.net links). That is a hotlink, not a
// mirror: it departs from this project's own established convention (see
// image-recovery-survey.md section 4), which is that the deployed app never
// talks to an upstream host directly for an image already in the static
// database.
//
// This module closes that gap in three separable stages, run as three
// separate CLI modes so a long-running mirror pass can be killed and
// resumed without redoing work or accidentally rewriting data mid-flight:
//
//   --scan    Read-only. Walks every public/data/cards/**/*.json file
//             (skipping db-version.json) and reports, per external host and
//             per language, how many hostedThumbUrl/hostedFullUrl
//             references are NOT already on raw.githubusercontent.com.
//   --mirror  Downloads and validates each distinct external URL exactly
//             once (downloadAndValidateImage, the same validation
//             downloadImage.ts already applies everywhere else in this
//             pipeline), then writes it into a local checkout of the
//             dedicated mirror repo (pcc-assets-d) at the SAME
//             <language>/<setId>/<id>/ scheme primaryHostedUrl already uses
//             for pcc-assets-a, so URL construction stays shape-identical
//             across all asset repos. Checkpointed after every N images
//             (default 25) so a killed run resumes instead of re-fetching.
//   --apply   Idempotent rewrite pass: for every record whose
//             hostedThumbUrl/hostedFullUrl matches a URL the checkpoint
//             marks 'done', replaces it with the new pcc-assets-d raw URL.
//             Safe to re-run -- a record already pointing at
//             raw.githubusercontent.com is left untouched. --dry-run
//             reports what WOULD be rewritten (with samples) without
//             touching any file.
//
// A single external URL can be shared by more than one card (the "shared
// reprint artwork" pattern documented in image-recovery-survey.md section
// 3.1 -- e.g. a McDonald's Collection promo reusing a base set's scan), so
// --mirror groups by URL first and fans the one downloaded file out to
// every card identity that referenced it, rather than re-downloading per
// card.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { CardRecord } from './buildStaticDatabase';
import { downloadAndValidateImage } from './downloadImage';
import { withPoliteDelay } from './politeFetch';
import { THUMB_FILENAME } from './resolveCardAssets';

const execFileAsync = promisify(execFile);

// --- Mirror target repo -------------------------------------------------------

// Mirrored images land in their own dedicated asset repo (the user's
// explicit choice over growing pcc-assets-a/b/c). Same
// <language>/<setId>/<id>/ layout as pcc-assets-a so URL construction stays
// shape-identical to resolveCardAssets.ts's primaryHostedUrl -- only the
// repo slug differs.
export const MIRROR_REPO_SLUG = 'froyonator/pcc-assets-d';
export const MIRROR_HOSTED_BASE = `https://raw.githubusercontent.com/${MIRROR_REPO_SLUG}/main`;

/** The raw.githubusercontent.com URL a mirrored file is served from -- the mirror-repo twin of resolveCardAssets.ts's primaryHostedUrl, byte-for-byte the same path scheme under a different repo slug. */
export function mirroredHostedUrl(identity: { language: string; setId: string; id: string }, filename: string): string {
  return `${MIRROR_HOSTED_BASE}/${identity.language}/${identity.setId}/${identity.id}/${filename}`;
}

// --- Card identity ---------------------------------------------------------

export interface CardIdentity {
  language: string;
  setId: string;
  id: string;
}

/** Stable string key for a CardIdentity -- also the exact relative directory a mirrored image lands under in the mirror repo. */
export function identityKey(identity: CardIdentity): string {
  return `${identity.language}/${identity.setId}/${identity.id}`;
}

// --- Host classification ----------------------------------------------------

export const SELF_HOSTED_HOST = 'raw.githubusercontent.com';

/** Null for an unparseable URL, never throws -- a malformed hostedThumbUrl/hostedFullUrl is a data problem to report, not a crash. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** True for a value that is a URL AND resolves to some host other than the self-hosted mirror -- the exact set of records this module exists to fix. An unparseable string is treated as "not external" (nothing sane to mirror), not silently swept in. */
export function isExternalHostedUrl(value: string | undefined): value is string {
  if (!value) return false;
  const host = hostOf(value);
  return host !== null && host !== SELF_HOSTED_HOST;
}

// --- Content-type -> file extension -----------------------------------------

/** Mirrors the extension conventions already used across this pipeline's other hosted-image code (see resolveCardAssets.ts's englishFallbackAssets 'jpeg' / japaneseFallbackAssets 'webp' fallbacks) -- only ever called on a contentType downloadAndValidateImage has already accepted, so every case is covered. */
export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpeg';
    default:
      throw new Error(`unsupported content-type for extension mapping: ${contentType}`);
  }
}

// --- Politeness: per-host delay ---------------------------------------------

// The reference-wiki archive host is the one source this pipeline has
// already documented ToS caution around (see politeFetch.ts's own header
// comment); every other external host gets the pipeline's ordinary 1
// request/second pace.
const WIKI_ARCHIVE_HOST = 'archives.bulbagarden.net';
export const HOST_DELAY_MS: Record<string, number> = {
  [WIKI_ARCHIVE_HOST]: 5000,
};
export const DEFAULT_HOST_DELAY_MS = 1000;

export function delayForHost(host: string): number {
  return HOST_DELAY_MS[host] ?? DEFAULT_HOST_DELAY_MS;
}

type Downloader = (url: string) => ReturnType<typeof downloadAndValidateImage>;

/** One politely-paced downloader per distinct host, created lazily -- so the wiki archive host's 5s gap and every other host's 1s gap are enforced independently instead of one queue serializing all of them behind the slowest host. */
export function createPerHostDownloader(fetchImpl: typeof fetch): (url: string) => ReturnType<typeof downloadAndValidateImage> {
  const gated = new Map<string, Downloader>();
  return (url: string) => {
    const host = hostOf(url) ?? 'unknown';
    let fn = gated.get(host);
    if (!fn) {
      fn = withPoliteDelay((u: string) => downloadAndValidateImage(u, fetchImpl), delayForHost(host));
      gated.set(host, fn);
    }
    return fn(url);
  };
}

// --- Scanning ----------------------------------------------------------------

export interface HostLangCount {
  host: string;
  language: string;
  count: number;
}

export interface ScanReport {
  /** Per (host, language) reference count -- thumb and full counted separately, matching the audit method already used in the gap-audit docs. */
  hostLangCounts: HostLangCount[];
  /** Every distinct external URL found, mapped to every card identity that references it (thumb, full, or both -- deduped). */
  urlToIdentities: Map<string, CardIdentity[]>;
  /** Records with at least one external hostedThumbUrl/hostedFullUrl. */
  recordsWithExternal: number;
  filesScanned: number;
}

async function listCardJsonFiles(cardsDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith('.json') || entry.name === 'db-version.json') continue;
      out.push(full);
    }
  }
  await walk(cardsDir);
  return out;
}

/** The language a card JSON file belongs to, from its path relative to the cards dir: "zh-cn.json" -> "zh-cn", "zh-cn/gen2.json" -> "zh-cn". Used only for the human-facing per-language report -- path construction for a mirrored image always uses the card's own `language` field. */
export function languageForCardFile(cardsDir: string, filePath: string): string {
  const rel = path.relative(cardsDir, filePath);
  const first = rel.split(path.sep)[0];
  return first.endsWith('.json') ? first.slice(0, -5) : first;
}

const HOSTED_FIELDS = ['hostedThumbUrl', 'hostedFullUrl'] as const;

/** Scans one already-loaded language database (as parsed from a single JSON file) and folds its external-URL references into the running scan state. Pure aside from the mutation of the passed-in maps -- kept separate from listCardJsonFiles/readFile so it's directly unit-testable against an in-memory fixture. */
export function scanDatabase(
  database: Record<string, CardRecord[]>,
  fileLanguage: string,
  state: { hostLangCounts: Map<string, number>; urlToIdentities: Map<string, Map<string, CardIdentity>>; recordsWithExternal: number }
): number {
  let recordsWithExternal = 0;
  for (const bucket of Object.values(database)) {
    for (const card of bucket) {
      let cardHasExternal = false;
      for (const field of HOSTED_FIELDS) {
        const url = card[field];
        if (!isExternalHostedUrl(url)) continue;
        cardHasExternal = true;
        const host = hostOf(url) ?? 'unparseable';
        const key = `${host}|${fileLanguage}`;
        state.hostLangCounts.set(key, (state.hostLangCounts.get(key) ?? 0) + 1);

        const identity: CardIdentity = { language: card.language, setId: card.setId, id: card.id };
        let idMap = state.urlToIdentities.get(url);
        if (!idMap) {
          idMap = new Map();
          state.urlToIdentities.set(url, idMap);
        }
        idMap.set(identityKey(identity), identity);
      }
      if (cardHasExternal) recordsWithExternal++;
    }
  }
  return recordsWithExternal;
}

export async function scanCardsDir(cardsDir: string): Promise<ScanReport> {
  const files = await listCardJsonFiles(cardsDir);
  const state = {
    hostLangCounts: new Map<string, number>(),
    urlToIdentities: new Map<string, Map<string, CardIdentity>>(),
    recordsWithExternal: 0,
  };
  for (const file of files) {
    const language = languageForCardFile(cardsDir, file);
    const database = JSON.parse(await readFile(file, 'utf8')) as Record<string, CardRecord[]>;
    state.recordsWithExternal += scanDatabase(database, language, state);
  }

  const hostLangCounts: HostLangCount[] = [...state.hostLangCounts.entries()]
    .map(([key, count]) => {
      const [host, language] = key.split('|');
      return { host, language, count };
    })
    .sort((a, b) => b.count - a.count);

  const urlToIdentities = new Map<string, CardIdentity[]>();
  for (const [url, idMap] of state.urlToIdentities) {
    urlToIdentities.set(url, [...idMap.values()]);
  }

  return { hostLangCounts, urlToIdentities, recordsWithExternal: state.recordsWithExternal, filesScanned: files.length };
}

export function printScanReport(report: ScanReport): void {
  console.log(`Scanned ${report.filesScanned} card database files.`);
  console.log(`${report.recordsWithExternal} records reference a hosted image URL NOT on ${SELF_HOSTED_HOST}.`);
  console.log(`${report.urlToIdentities.size} distinct external URLs to mirror.`);
  console.log('Per host / per language reference counts (thumb + full counted separately):');
  console.table(report.hostLangCounts);
}

// --- Checkpoint --------------------------------------------------------------

export interface MirrorDoneEntry {
  status: 'done';
  ext: string;
  sha256: string;
  bytes: number;
  identities: string[];
}
export interface MirrorFailedEntry {
  status: 'failed';
  reason: string;
}
export type MirrorCheckpointEntry = MirrorDoneEntry | MirrorFailedEntry;

export interface MirrorCheckpoint {
  images: Record<string, MirrorCheckpointEntry>;
}

export function emptyMirrorCheckpoint(): MirrorCheckpoint {
  return { images: {} };
}

export async function loadMirrorCheckpoint(checkpointPath: string): Promise<MirrorCheckpoint> {
  try {
    const raw = await readFile(checkpointPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MirrorCheckpoint>;
    return { images: parsed.images && typeof parsed.images === 'object' ? parsed.images : {} };
  } catch {
    return emptyMirrorCheckpoint();
  }
}

export async function saveMirrorCheckpoint(checkpointPath: string, checkpoint: MirrorCheckpoint): Promise<void> {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// --- Mirror stage --------------------------------------------------------------

const THUMB_WIDTH = 300; // matches buildImageRepos.ts's own thumbnail width, for a visually consistent grid tile.
const CHECKPOINT_EVERY_DEFAULT = 25;

export interface MirrorRunOptions {
  cardsDir: string;
  assetRepoDir: string;
  checkpointPath: string;
  fetchImpl?: typeof fetch;
  checkpointEvery?: number;
  /** Caps how many NOT-yet-attempted URLs this run processes -- for staged, observable execution rather than one multi-hour blocking call. Undefined = no cap (process every remaining URL). */
  limit?: number;
  /** Restricts mirroring to URLs referenced only by this file-language (see languageForCardFile) -- lets a run be staged language-by-language as the task calls for (zh-cn first, etc.) without re-scanning every language's URLs together. */
  onlyLanguage?: string;
}

export interface MirrorRunSummary {
  scanned: number;
  attemptedThisRun: number;
  succeededThisRun: number;
  failedThisRun: number;
  bytesDownloadedThisRun: number;
  alreadyDone: number;
  alreadyFailed: number;
  remaining: number;
}

async function writeMirroredImage(assetRepoDir: string, identity: CardIdentity, ext: string, bytes: Buffer): Promise<void> {
  const destDir = path.join(assetRepoDir, identity.language, identity.setId, identity.id);
  await mkdir(destDir, { recursive: true });
  await writeFile(path.join(destDir, `original.${ext}`), bytes);
  // Thumb rendered to a buffer and written via Node's own fs rather than
  // sharp's toFile: some harvested setIds/card ids are long enough that the
  // full destination path exceeds Windows' classic 260-char MAX_PATH, which
  // libvips' own file open cannot handle -- Node's fs can (libuv uses
  // extended-length paths internally). Confirmed live on the zh-cn
  // 30th-anniversary sets during this module's first real run.
  const thumb = await sharp(bytes).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  await writeFile(path.join(destDir, THUMB_FILENAME), thumb);
}

/**
 * Scans for external URLs, then downloads (politely, per-host-paced) and
 * mirrors every one not already checkpointed. Resume-safe: a URL already
 * marked 'done' or 'failed' in the checkpoint is skipped entirely, so
 * killing and re-running this function only ever makes forward progress.
 * Does not touch public/data/cards -- see rewriteExternalUrls for the
 * separate, idempotent apply step.
 */
export async function mirrorExternalImages(options: MirrorRunOptions): Promise<MirrorRunSummary> {
  const report = await scanCardsDir(options.cardsDir);
  const checkpoint = await loadMirrorCheckpoint(options.checkpointPath);
  const download = createPerHostDownloader(options.fetchImpl ?? fetch);
  const checkpointEvery = options.checkpointEvery ?? CHECKPOINT_EVERY_DEFAULT;

  let attemptedThisRun = 0;
  let succeededThisRun = 0;
  let failedThisRun = 0;
  let bytesDownloadedThisRun = 0;
  let alreadyDone = 0;
  let alreadyFailed = 0;

  for (const [url, identities] of report.urlToIdentities) {
    if (options.onlyLanguage && !identities.some((i) => i.language === options.onlyLanguage)) continue;

    const existing = checkpoint.images[url];
    if (existing) {
      if (existing.status === 'done') alreadyDone++;
      else alreadyFailed++;
      continue;
    }
    if (options.limit !== undefined && attemptedThisRun >= options.limit) continue;

    attemptedThisRun++;
    const result = await download(url);
    if ('error' in result) {
      checkpoint.images[url] = { status: 'failed', reason: result.error };
      failedThisRun++;
      console.warn(`[mirror] FAILED ${url}: ${result.error}`);
    } else {
      const ext = extensionForContentType(result.image.contentType);
      for (const identity of identities) {
        await writeMirroredImage(options.assetRepoDir, identity, ext, result.image.bytes);
      }
      checkpoint.images[url] = {
        status: 'done',
        ext,
        sha256: result.image.sha256,
        bytes: result.image.bytes.byteLength,
        identities: identities.map(identityKey),
      };
      succeededThisRun++;
      bytesDownloadedThisRun += result.image.bytes.byteLength;
    }

    if (attemptedThisRun % checkpointEvery === 0) {
      await saveMirrorCheckpoint(options.checkpointPath, checkpoint);
      console.log(`[mirror] checkpoint: ${attemptedThisRun} attempted this run (${succeededThisRun} ok, ${failedThisRun} failed)`);
    }
  }
  await saveMirrorCheckpoint(options.checkpointPath, checkpoint);

  const remaining = [...report.urlToIdentities.keys()].filter((url) => !checkpoint.images[url]).length;

  return {
    scanned: report.urlToIdentities.size,
    attemptedThisRun,
    succeededThisRun,
    failedThisRun,
    bytesDownloadedThisRun,
    alreadyDone,
    alreadyFailed,
    remaining,
  };
}

// --- Apply / rewrite stage -----------------------------------------------------

export interface RewriteSample {
  file: string;
  cardId: string;
  field: string;
  from: string;
  to: string;
}

export interface RewriteSummary {
  filesRewritten: number;
  fieldsRewritten: number;
  /** First N (see REWRITE_SAMPLE_LIMIT) rewrites, for human inspection -- especially useful under dryRun. */
  samples: RewriteSample[];
  dryRun: boolean;
}

const REWRITE_SAMPLE_LIMIT = 60;

/** Given a checkpoint's 'done' entry, the raw.githubusercontent.com URL a card's field should be rewritten to. */
function rewrittenUrl(identity: CardIdentity, entry: MirrorDoneEntry, field: (typeof HOSTED_FIELDS)[number]): string {
  const filename = field === 'hostedThumbUrl' ? THUMB_FILENAME : `original.${entry.ext}`;
  return mirroredHostedUrl(identity, filename);
}

/**
 * Idempotent: rewrites hostedThumbUrl/hostedFullUrl to the mirrored
 * pcc-assets-d URL for every record whose current value is an external URL
 * AND has a 'done' checkpoint entry. A record already pointing at
 * raw.githubusercontent.com (either because it was mirrored on a previous
 * --apply run, or never needed mirroring) is left untouched -- so re-running
 * after a partial --mirror run only picks up the newly-completed subset.
 * Under `dryRun`, computes the identical summary (including samples) but
 * writes nothing at all.
 */
export async function rewriteExternalUrls(
  cardsDir: string,
  checkpoint: MirrorCheckpoint,
  dryRun = false
): Promise<RewriteSummary> {
  const files = await listCardJsonFiles(cardsDir);
  let filesRewritten = 0;
  let fieldsRewritten = 0;
  const samples: RewriteSample[] = [];

  for (const file of files) {
    const database = JSON.parse(await readFile(file, 'utf8')) as Record<string, CardRecord[]>;
    let changed = false;
    for (const bucket of Object.values(database)) {
      for (const card of bucket) {
        for (const field of HOSTED_FIELDS) {
          const url = card[field];
          if (!isExternalHostedUrl(url)) continue;
          const entry = checkpoint.images[url];
          if (!entry || entry.status !== 'done') continue;
          const identity: CardIdentity = { language: card.language, setId: card.setId, id: card.id };
          const to = rewrittenUrl(identity, entry, field);
          if (samples.length < REWRITE_SAMPLE_LIMIT) {
            samples.push({ file: path.relative(cardsDir, file), cardId: card.id, field, from: url, to });
          }
          card[field] = to;
          changed = true;
          fieldsRewritten++;
        }
      }
    }
    if (changed) {
      if (!dryRun) await writeFile(file, JSON.stringify(database), 'utf8');
      filesRewritten++;
    }
  }

  return { filesRewritten, fieldsRewritten, samples, dryRun };
}

// --- Push stage ------------------------------------------------------------

export interface RepoSizeCheck {
  ok: boolean;
  sizeBytes: number;
  thresholdBytes: number;
}

// Guard-rail scoped to the dedicated mirror repo (pcc-assets-d), per the
// user's decision: ~4 GB ceiling. Checked via the GitHub API's reported
// repo size (KB, includes full git history) rather than a local `du`, so
// this never requires cloning multiple gigabytes just to decide whether a
// push is even allowed.
export const PUSH_SIZE_THRESHOLD_BYTES = 4 * 1024 * 1024 * 1024;

export async function checkRepoSizeOk(
  repoNameWithOwner: string = MIRROR_REPO_SLUG,
  thresholdBytes: number = PUSH_SIZE_THRESHOLD_BYTES,
  runGh: (args: string[]) => Promise<{ stdout: string }> = (args) => execFileAsync('gh', args)
): Promise<RepoSizeCheck> {
  const { stdout } = await runGh(['api', `repos/${repoNameWithOwner}`, '--jq', '.size']);
  const sizeKb = Number(stdout.trim());
  const sizeBytes = sizeKb * 1024;
  return { ok: sizeBytes <= thresholdBytes, sizeBytes, thresholdBytes };
}

// --- CLI -----------------------------------------------------------------------

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
export const DEFAULT_ASSET_REPO_DIR = path.join(DATA_DIR, 'asset-repos', 'pcc-assets-d');
export const DEFAULT_CHECKPOINT_PATH = path.join(DATA_DIR, 'mirror-external-images-progress.json');
export const DEFAULT_CARDS_DIR = path.resolve(import.meta.dirname, '../../..', 'public', 'data', 'cards');

interface CliArgs {
  mode: 'scan' | 'mirror' | 'apply';
  lang?: string;
  limit?: number;
  dryRun: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  let mode: CliArgs['mode'] = 'scan';
  let lang: string | undefined;
  let limit: number | undefined;
  let dryRun = false;
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--scan') mode = 'scan';
    else if (flag === '--mirror') mode = 'mirror';
    else if (flag === '--apply') mode = 'apply';
    else if (flag === '--dry-run') dryRun = true;
    else if (flag === '--lang') lang = args.shift();
    else if (flag === '--limit') {
      const value = args.shift();
      if (value === undefined) throw new Error('--limit requires a value.');
      limit = Number(value);
      if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer.');
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { mode, lang, limit, dryRun };
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.mode === 'scan') {
    const report = await scanCardsDir(DEFAULT_CARDS_DIR);
    printScanReport(report);
    return;
  }

  if (cli.mode === 'mirror') {
    const summary = await mirrorExternalImages({
      cardsDir: DEFAULT_CARDS_DIR,
      assetRepoDir: DEFAULT_ASSET_REPO_DIR,
      checkpointPath: DEFAULT_CHECKPOINT_PATH,
      onlyLanguage: cli.lang,
      limit: cli.limit,
    });
    console.log('Mirror run complete:', summary);
    return;
  }

  if (cli.mode === 'apply') {
    const checkpoint = await loadMirrorCheckpoint(DEFAULT_CHECKPOINT_PATH);
    const summary = await rewriteExternalUrls(DEFAULT_CARDS_DIR, checkpoint, cli.dryRun);
    console.log(
      `Apply (rewrite) ${summary.dryRun ? 'DRY-RUN -- nothing written' : 'run complete'}: ` +
        `${summary.fieldsRewritten} fields across ${summary.filesRewritten} files.`
    );
    if (summary.samples.length > 0) {
      console.log(`First ${summary.samples.length} rewrites:`);
      for (const s of summary.samples) {
        console.log(`  [${s.file}] ${s.cardId} ${s.field}`);
        console.log(`    ${s.from}`);
        console.log(`    -> ${s.to}`);
      }
    }
    return;
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
