// scripts/carddata/src/downloadSprites.ts
//
// Downloads a self-hosted sprite set for every National Pokedex species
// (1-1025) into public/sprites/, so the running app never hot-links a
// third-party host at runtime:
//
//   public/sprites/static/<dex>.png     -- one per species, all 1025.
//   public/sprites/animated/<dex>.gif   -- as many species as the animated
//                                          source covers (.webp instead when
//                                          conversion actually saves space;
//                                          see maybeConvertToWebp).
//   public/sprites/manifest.json        -- { animated: number[], animatedFormat?: {...} }
//                                          so the app knows which dex numbers
//                                          have an animated file without
//                                          probing for 404s at runtime.
//
// Static source: the exact URL scheme already used at runtime today, see
// src/api/pokeapi.ts's spriteUrl -- same artwork, just fetched once here
// instead of on every page load.
//
// Animated source: exactly one, the community battle-simulator sprite
// archive's MODERN animated set (play.pokemonshowdown.com/sprites/ani/).
// Deliberately not the older generation-v/black-white animated set --
// lower resolution, different art style, explicitly out of scope. A
// species this modern set doesn't cover is simply left out of the
// manifest; the app's only fallback is the static sprite.
//
// Politeness: every network call funnels through one withPoliteDelay-wrapped
// fetch (see politeFetch.ts), so static and animated requests together never
// exceed ~10 req/s against either host. Transient failures (network errors,
// 5xx) get one retry; a 404 is a confirmed "this species has no animated
// sprite", not a failure, and is recorded as such (no retry).
//
// Resumability: progress checkpoints to data/sprite-download-progress.json
// after every dex number, so a killed/interrupted run resumes rather than
// re-downloading everything. The checkpoint is distrusted and rebuilt for
// the animated half if it (or the files on disk) don't clearly attribute
// every animated file to this modern source -- see pruneUntrustedAnimated --
// which also protects against an earlier partial run having saved
// generation-v animated files under the same paths.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { allDexEntries } from '../../../src/data/generations';
import { spriteUrl } from '../../../src/api/pokeapi';
import { withPoliteDelay } from './politeFetch';

// --- Paths -------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const STATIC_DIR = path.join(REPO_ROOT, 'public/sprites/static');
export const ANIMATED_DIR = path.join(REPO_ROOT, 'public/sprites/animated');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'public/sprites/manifest.json');
export const CHECKPOINT_PATH = path.join(REPO_ROOT, 'scripts/carddata/data/sprite-download-progress.json');

// --- Name normalization for the animated source -------------------------

// The animated host keys sprites by a "toID"-style slug: lowercase, accents
// stripped, everything that isn't a-z0-9 dropped entirely (not just spaces
// -- hyphens, periods, apostrophes, colons all go too). This one rule
// covers every special case the app's dex names produce:
//   "Mr. Mime"      -> "mrmime"
//   "Farfetch'd"    -> "farfetchd"
//   "Ho-Oh"         -> "hooh"
//   "Porygon-Z"     -> "porygonz"
//   "Type: Null"    -> "typenull"
//   "Jangmo-o"      -> "jangmoo"   (and Hakamo-o, Kommo-o the same way)
//   "Tapu Koko"     -> "tapukoko"  (and the rest of the Tapu quartet)
//   "Mime Jr."      -> "mimejr"
//   "Flabébé"       -> "flabebe"   (NFD-normalize first to drop the accent)
//   "Urshifu"       -> "urshifu"   (single dex entry = the default form)
//   "Nidoran-F"     -> "nidoranf"  (and Nidoran-M -> "nidoranm")
//   "Wo-Chien" etc. -> "wochien"   (Gen9 Treasures of Ruin/Paradox names)
//   "Walking Wake"  -> "walkingwake"
export function normalizeSpeciesNameForAnimatedSprite(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics after NFD split
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const SHOWDOWN_ANI_SOURCE = 'showdown-ani';

export function animatedSpriteUrl(speciesName: string): string {
  return `https://play.pokemonshowdown.com/sprites/ani/${normalizeSpeciesNameForAnimatedSprite(speciesName)}.gif`;
}

// --- Checkpoint shape ----------------------------------------------------

interface StaticDoneEntry {
  status: 'done';
  bytes: number;
}
interface StaticFailedEntry {
  status: 'failed';
  reason: string;
}
export type StaticCheckpointEntry = StaticDoneEntry | StaticFailedEntry;

interface AnimatedDoneEntry {
  status: 'done';
  source: typeof SHOWDOWN_ANI_SOURCE;
  name: string;
  ext: 'gif' | 'webp';
  bytes: number;
}
interface AnimatedNotFoundEntry {
  status: 'not-found';
  source: typeof SHOWDOWN_ANI_SOURCE;
  name: string;
}
interface AnimatedFailedEntry {
  status: 'failed';
  reason: string;
}
export type AnimatedCheckpointEntry = AnimatedDoneEntry | AnimatedNotFoundEntry | AnimatedFailedEntry;

export interface Checkpoint {
  static: Record<string, StaticCheckpointEntry>;
  animated: Record<string, AnimatedCheckpointEntry>;
}

export function emptyCheckpoint(): Checkpoint {
  return { static: {}, animated: {} };
}

export async function loadCheckpoint(checkpointPath: string): Promise<Checkpoint> {
  try {
    const raw = await readFile(checkpointPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Checkpoint>;
    return {
      static: parsed.static && typeof parsed.static === 'object' ? parsed.static : {},
      animated: parsed.animated && typeof parsed.animated === 'object' ? parsed.animated : {},
    };
  } catch {
    return emptyCheckpoint();
  }
}

export async function saveCheckpoint(checkpointPath: string, checkpoint: Checkpoint): Promise<void> {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// A checkpoint's animated half is only trustworthy if every entry in it
// explicitly attributes itself to this modern source. An entry missing
// `source` (or attributing itself to anything else, e.g. a stale
// generation-v run) means we cannot tell what's actually on disk --
// distrust the whole animated half rather than risk serving old-style
// sprites under the new manifest.
export function isAnimatedCheckpointTrustworthy(checkpoint: Checkpoint): boolean {
  return Object.values(checkpoint.animated).every(
    (entry) => entry.status !== 'done' && entry.status !== 'not-found'
      ? true
      : entry.source === SHOWDOWN_ANI_SOURCE
  );
}

// --- Manifest --------------------------------------------------------------

export interface SpriteManifest {
  animated: number[];
  animatedFormat?: Record<string, 'webp'>;
}

export function buildManifest(checkpoint: Checkpoint): SpriteManifest {
  const animated: number[] = [];
  const animatedFormat: Record<string, 'webp'> = {};
  for (const [dexKey, entry] of Object.entries(checkpoint.animated)) {
    if (entry.status !== 'done') continue;
    const dex = Number(dexKey);
    animated.push(dex);
    if (entry.ext === 'webp') animatedFormat[dexKey] = 'webp';
  }
  animated.sort((a, b) => a - b);
  const manifest: SpriteManifest = { animated };
  if (Object.keys(animatedFormat).length > 0) manifest.animatedFormat = animatedFormat;
  return manifest;
}

// --- Validation ------------------------------------------------------------

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF_MAGIC_STRINGS = ['GIF87a', 'GIF89a'];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateStaticImageBytes(bytes: Buffer, contentType: string): ValidationResult {
  if (!contentType.startsWith('image/')) {
    return { ok: false, reason: `unexpected content-type: ${contentType}` };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty response body' };
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, reason: 'response is not a valid PNG (bad magic bytes)' };
  }
  return { ok: true };
}

export function validateAnimatedImageBytes(bytes: Buffer, contentType: string): ValidationResult {
  if (!contentType.startsWith('image/')) {
    return { ok: false, reason: `unexpected content-type: ${contentType}` };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty response body' };
  const header = bytes.subarray(0, 6).toString('ascii');
  if (!GIF_MAGIC_STRINGS.includes(header)) {
    return { ok: false, reason: 'response is not a valid GIF (bad magic bytes)' };
  }
  return { ok: true };
}

// --- Network ----------------------------------------------------------------

const REQUESTS_PER_SECOND = 10;

export interface FetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: Buffer;
}

async function rawFetchBytes(url: string): Promise<FetchResult> {
  const res = await fetch(url);
  const contentType = (res.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  const bytes = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
  return { ok: res.ok, status: res.status, contentType, bytes };
}

// One shared politely-paced fetch gate, used by both static and animated
// downloads, so the combined request rate against either host never
// exceeds REQUESTS_PER_SECOND.
const politeFetchBytes = withPoliteDelay(rawFetchBytes, 1000 / REQUESTS_PER_SECOND);

async function fetchWithRetry(url: string): Promise<FetchResult> {
  const first = await politeFetchBytes(url);
  if (first.ok || first.status === 404) return first;
  // One retry for transient failures (network hiccup, 5xx). A 404 is a
  // confirmed absence, not a transient failure -- don't retry those.
  return politeFetchBytes(url);
}

// --- WebP conversion (optional, only when it actually saves space) --------

const WEBP_SAVINGS_THRESHOLD = 0.25; // only switch to webp if it saves >25%
const WEBP_QUALITY = 80;

// Returns webp bytes only if conversion succeeded AND it's meaningfully
// smaller than the source GIF; otherwise returns null and the caller keeps
// the original GIF. Never upscales -- sharp's animated re-encode keeps the
// source's original dimensions and frame count as-is.
export async function maybeConvertToWebp(gifBytes: Buffer): Promise<Buffer | null> {
  try {
    const webpBytes = await sharp(gifBytes, { animated: true }).webp({ quality: WEBP_QUALITY }).toBuffer();
    const savings = 1 - webpBytes.byteLength / gifBytes.byteLength;
    if (savings > WEBP_SAVINGS_THRESHOLD) return webpBytes;
    return null;
  } catch {
    return null;
  }
}

// --- File helpers ------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

// Deletes any file under `dir` whose dex number doesn't have a trustworthy
// 'done' entry (from this source) in the checkpoint -- guards against
// leftover files from an earlier partial/differently-sourced run (e.g.
// generation-v animated sprites saved under the same <dex>.gif paths).
export async function pruneUntrustedAnimated(dir: string, checkpoint: Checkpoint): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    const match = /^(\d+)\.(gif|webp)$/.exec(entry);
    if (!match) continue; // unrecognized file, leave alone
    const dex = match[1];
    const checkpointEntry = checkpoint.animated[dex];
    const trusted =
      checkpointEntry?.status === 'done' &&
      checkpointEntry.source === SHOWDOWN_ANI_SOURCE &&
      checkpointEntry.ext === match[2];
    if (!trusted) {
      await rm(path.join(dir, entry), { force: true });
      removed.push(entry);
    }
  }
  return removed;
}

// --- Per-species download ---------------------------------------------------

export interface DexJob {
  number: number;
  name: string;
}

async function downloadStatic(entry: DexJob, checkpoint: Checkpoint): Promise<void> {
  const key = String(entry.number);
  const destPath = path.join(STATIC_DIR, `${entry.number}.png`);
  const existing = checkpoint.static[key];
  if (existing?.status === 'done' && (await fileExists(destPath))) return;

  const url = spriteUrl(entry.number);
  const result = await fetchWithRetry(url);
  if (!result.ok) {
    checkpoint.static[key] = { status: 'failed', reason: `HTTP ${result.status}` };
    console.warn(`[static] #${entry.number} ${entry.name}: HTTP ${result.status}`);
    return;
  }
  const validation = validateStaticImageBytes(result.bytes, result.contentType);
  if (!validation.ok) {
    checkpoint.static[key] = { status: 'failed', reason: validation.reason };
    console.warn(`[static] #${entry.number} ${entry.name}: ${validation.reason}`);
    return;
  }
  await mkdir(STATIC_DIR, { recursive: true });
  await writeFile(destPath, result.bytes);
  checkpoint.static[key] = { status: 'done', bytes: result.bytes.byteLength };
}

async function downloadAnimated(entry: DexJob, checkpoint: Checkpoint): Promise<void> {
  const key = String(entry.number);
  const existing = checkpoint.animated[key];
  if (existing?.status === 'done') {
    const destPath = path.join(ANIMATED_DIR, `${entry.number}.${existing.ext}`);
    if (await fileExists(destPath)) return;
  } else if (existing?.status === 'not-found') {
    return; // confirmed absent from the animated source, nothing to retry
  }

  const url = animatedSpriteUrl(entry.name);
  const normalizedName = normalizeSpeciesNameForAnimatedSprite(entry.name);
  const result = await fetchWithRetry(url);
  if (result.status === 404) {
    checkpoint.animated[key] = { status: 'not-found', source: SHOWDOWN_ANI_SOURCE, name: normalizedName };
    return;
  }
  if (!result.ok) {
    checkpoint.animated[key] = { status: 'failed', reason: `HTTP ${result.status}` };
    console.warn(`[animated] #${entry.number} ${entry.name}: HTTP ${result.status}`);
    return;
  }
  const validation = validateAnimatedImageBytes(result.bytes, result.contentType);
  if (!validation.ok) {
    checkpoint.animated[key] = { status: 'failed', reason: validation.reason };
    console.warn(`[animated] #${entry.number} ${entry.name}: ${validation.reason}`);
    return;
  }

  await mkdir(ANIMATED_DIR, { recursive: true });
  const webpBytes = await maybeConvertToWebp(result.bytes);
  if (webpBytes) {
    await writeFile(path.join(ANIMATED_DIR, `${entry.number}.webp`), webpBytes);
    checkpoint.animated[key] = {
      status: 'done',
      source: SHOWDOWN_ANI_SOURCE,
      name: normalizedName,
      ext: 'webp',
      bytes: webpBytes.byteLength,
    };
  } else {
    await writeFile(path.join(ANIMATED_DIR, `${entry.number}.gif`), result.bytes);
    checkpoint.animated[key] = {
      status: 'done',
      source: SHOWDOWN_ANI_SOURCE,
      name: normalizedName,
      ext: 'gif',
      bytes: result.bytes.byteLength,
    };
  }
}

// --- Main --------------------------------------------------------------------

export interface RunSummary {
  staticDone: number;
  staticFailed: number;
  animatedDone: number;
  animatedNotFound: number;
  animatedFailed: number;
  staticBytes: number;
  animatedBytes: number;
  missingAnimated: number[];
}

export async function run(dexEntries: DexJob[] = allDexEntries()): Promise<RunSummary> {
  await mkdir(STATIC_DIR, { recursive: true });
  await mkdir(ANIMATED_DIR, { recursive: true });

  let checkpoint = await loadCheckpoint(CHECKPOINT_PATH);
  if (!isAnimatedCheckpointTrustworthy(checkpoint)) {
    console.warn('Animated checkpoint entries missing a source attribution -- distrusting and rebuilding the animated half.');
    checkpoint = { static: checkpoint.static, animated: {} };
  }
  const removed = await pruneUntrustedAnimated(ANIMATED_DIR, checkpoint);
  if (removed.length > 0) {
    console.warn(`Removed ${removed.length} untrusted animated file(s) not attributable to the modern source: ${removed.join(', ')}`);
  }

  for (const entry of dexEntries) {
    await downloadStatic(entry, checkpoint);
    await downloadAnimated(entry, checkpoint);
    await saveCheckpoint(CHECKPOINT_PATH, checkpoint);
  }

  const manifest = buildManifest(checkpoint);
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  const summary: RunSummary = {
    staticDone: 0,
    staticFailed: 0,
    animatedDone: 0,
    animatedNotFound: 0,
    animatedFailed: 0,
    staticBytes: 0,
    animatedBytes: 0,
    missingAnimated: [],
  };
  for (const [key, entry] of Object.entries(checkpoint.static)) {
    if (entry.status === 'done') {
      summary.staticDone += 1;
      summary.staticBytes += entry.bytes;
    } else {
      summary.staticFailed += 1;
      console.warn(`[static] permanently failed for dex ${key}: ${entry.reason}`);
    }
  }
  for (const [key, entry] of Object.entries(checkpoint.animated)) {
    if (entry.status === 'done') {
      summary.animatedDone += 1;
      summary.animatedBytes += entry.bytes;
    } else if (entry.status === 'not-found') {
      summary.animatedNotFound += 1;
      summary.missingAnimated.push(Number(key));
    } else {
      summary.animatedFailed += 1;
      console.warn(`[animated] permanently failed for dex ${key}: ${entry.reason}`);
    }
  }
  summary.missingAnimated.sort((a, b) => a - b);
  return summary;
}

// Only run when executed directly (not when imported by tests), matching
// this pipeline's existing scripts (see buildStaticDatabase.ts).
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  run()
    .then((summary) => {
      console.log('Sprite download complete.');
      console.log(`  Static:   ${summary.staticDone}/1025 done, ${summary.staticFailed} failed, ${(summary.staticBytes / 1_000_000).toFixed(1)} MB`);
      console.log(`  Animated: ${summary.animatedDone}/1025 done, ${summary.animatedNotFound} not covered by the source, ${summary.animatedFailed} failed, ${(summary.animatedBytes / 1_000_000).toFixed(1)} MB`);
    })
    .catch((error) => {
      console.error('Sprite download failed:', error);
      process.exitCode = 1;
    });
}
