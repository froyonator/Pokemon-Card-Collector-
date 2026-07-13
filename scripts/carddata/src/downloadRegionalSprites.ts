// scripts/carddata/src/downloadRegionalSprites.ts
//
// Downloads a self-hosted sprite set for every regional form that has its
// own pokeapi.co variety (see src/data/regionalDex.ts -- `hasOwnVariety:
// true` entries only; the exclusive-evolution entries deliberately have no
// separate variety to fetch and just reuse the base-species sprite
// downloadSprites.ts already downloaded for their own dex number) into
// public/sprites/regional/, mirroring the conventions
// downloadMegaSprites.ts/downloadGmaxSprites.ts already established:
//
//   public/sprites/regional/static/<slug>.png    -- every form that
//                                                    resolves a pokeapi
//                                                    form id and static
//                                                    image.
//   public/sprites/regional/animated/<slug>.gif  -- as many as the
//                                                    animated source
//                                                    covers (.webp instead
//                                                    when conversion saves
//                                                    space; see
//                                                    maybeConvertToWebp).
//   public/sprites/manifest.json                 -- gains a "regional"
//                                                    array, shaped like the
//                                                    existing "mega"/"gmax"
//                                                    arrays plus a `family`
//                                                    field, merged in
//                                                    ADDITIVELY (every
//                                                    other top-level key is
//                                                    read fresh and
//                                                    preserved untouched).
//
// Static source: the same raw sprite archive downloadSprites.ts uses (see
// spriteUrl in src/api/pokeapi.ts), keyed by each form's own numeric
// pokeapi.co form id (looked up once per slug, then checkpointed) -- same
// technique as downloadMegaSprites.ts/downloadGmaxSprites.ts.
//
// Animated source: the same modern battle-simulator animated archive
// (play.pokemonshowdown.com/sprites/ani/). Verified live before writing
// this: the plain "<pokeapi-slug>.gif" URL resolves directly for the large
// majority of forms (vulpix-alola, ponyta-galar, growlithe-hisui,
// wooper-paldea all confirmed 200 with zero transform), but the six
// multi-form entries needed individual live verification --
//   - darmanitan-galar-standard -> darmanitan-galar.gif (confirmed 200)
//   - darmanitan-galar-zen -> darmanitan-galarzen.gif (confirmed 200; note
//     no hyphen between "galar" and "zen", unlike the pokeapi slug)
//   - raticate-totem-alola -> raticate-alola-totem.gif (confirmed 200;
//     note "alola" and "totem" are SWAPPED relative to the pokeapi slug)
//   - Tauros's three Paldean breeds (combat/blaze/aqua) have NO animated
//     sprite on this host under any plausible slug tried
//     (tauros-paldea-<breed>, tauros-paldea-<breed>-breed, tauros-paldea)
//     -- confirmed absent, left as animated: false like any other
//     not-covered form.
//
// Politeness / resumability: same withPoliteDelay-gated fetch and
// per-form-done checkpoint file (data/regional-sprite-download-progress.json)
// as downloadMegaSprites.ts, so a killed/interrupted run resumes instead of
// re-downloading everything.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spriteUrl } from '../../../src/api/pokeapi';
import { REGIONAL_DEX, type RegionalForm } from './data/regionalDex';
import { maybeConvertToWebp, validateAnimatedImageBytes, validateStaticImageBytes } from './downloadSprites';
import { withPoliteDelay } from './politeFetch';

// --- Paths -------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const REGIONAL_STATIC_DIR = path.join(REPO_ROOT, 'public/sprites/regional/static');
export const REGIONAL_ANIMATED_DIR = path.join(REPO_ROOT, 'public/sprites/regional/animated');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'public/sprites/manifest.json');
export const CHECKPOINT_PATH = path.join(REPO_ROOT, 'scripts/carddata/data/regional-sprite-download-progress.json');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// --- Only hasOwnVariety forms are ever looked up against a sprite host ---

export function regionalFormsWithOwnVariety(): RegionalForm[] {
  return REGIONAL_DEX.filter((f) => f.hasOwnVariety);
}

// --- Animated slug transform ---------------------------------------------

// Every regional slug (from regionalDex.ts) already matches pokeapi.co's
// own variety spelling, and the animated host uses that exact spelling for
// the large majority of forms (verified live -- see this module's header
// comment). These three multi-form entries needed a real, individually
// verified override.
const ANIMATED_SLUG_OVERRIDES: Record<string, string> = {
  'darmanitan-galar-standard': 'darmanitan-galar',
  'darmanitan-galar-zen': 'darmanitan-galarzen',
  'raticate-totem-alola': 'raticate-alola-totem',
};

export function regionalAnimatedSlug(slug: string): string {
  return ANIMATED_SLUG_OVERRIDES[slug] ?? slug;
}

export function regionalAnimatedSpriteUrl(slug: string): string {
  return `https://play.pokemonshowdown.com/sprites/ani/${regionalAnimatedSlug(slug)}.gif`;
}

// --- Checkpoint shape ----------------------------------------------------

interface FormIdEntry {
  status: 'resolved';
  formId: number;
}
interface FormIdUnresolvedEntry {
  status: 'unresolved';
  reason: string;
}
export type FormIdCheckpointEntry = FormIdEntry | FormIdUnresolvedEntry;

interface StaticDoneEntry {
  status: 'done';
  bytes: number;
}
interface StaticFailedEntry {
  status: 'failed';
  reason: string;
}
export type RegionalStaticCheckpointEntry = StaticDoneEntry | StaticFailedEntry;

interface AnimatedDoneEntry {
  status: 'done';
  ext: 'gif' | 'webp';
  bytes: number;
}
interface AnimatedNotFoundEntry {
  status: 'not-found';
}
interface AnimatedFailedEntry {
  status: 'failed';
  reason: string;
}
export type RegionalAnimatedCheckpointEntry = AnimatedDoneEntry | AnimatedNotFoundEntry | AnimatedFailedEntry;

export interface RegionalCheckpoint {
  formIds: Record<string, FormIdCheckpointEntry>;
  static: Record<string, RegionalStaticCheckpointEntry>;
  animated: Record<string, RegionalAnimatedCheckpointEntry>;
}

export function emptyRegionalCheckpoint(): RegionalCheckpoint {
  return { formIds: {}, static: {}, animated: {} };
}

export async function loadRegionalCheckpoint(checkpointPath: string): Promise<RegionalCheckpoint> {
  try {
    const raw = await readFile(checkpointPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RegionalCheckpoint>;
    return {
      formIds: parsed.formIds && typeof parsed.formIds === 'object' ? parsed.formIds : {},
      static: parsed.static && typeof parsed.static === 'object' ? parsed.static : {},
      animated: parsed.animated && typeof parsed.animated === 'object' ? parsed.animated : {},
    };
  } catch {
    return emptyRegionalCheckpoint();
  }
}

export async function saveRegionalCheckpoint(checkpointPath: string, checkpoint: RegionalCheckpoint): Promise<void> {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// --- Manifest --------------------------------------------------------------

export interface RegionalManifestEntry {
  slug: string;
  baseDex: number;
  name: string;
  family: RegionalForm['family'];
  animated: boolean;
  animatedExt?: 'webp';
}

export function buildRegionalManifestSection(checkpoint: RegionalCheckpoint): RegionalManifestEntry[] {
  const entries: RegionalManifestEntry[] = [];
  for (const form of regionalFormsWithOwnVariety()) {
    const staticEntry = checkpoint.static[form.slug];
    if (staticEntry?.status !== 'done') continue; // no usable static sprite, leave out of manifest
    const animatedEntry = checkpoint.animated[form.slug];
    const entry: RegionalManifestEntry = {
      slug: form.slug,
      baseDex: form.baseDex,
      name: form.displayName,
      family: form.family,
      animated: animatedEntry?.status === 'done',
    };
    if (animatedEntry?.status === 'done' && animatedEntry.ext === 'webp') entry.animatedExt = 'webp';
    entries.push(entry);
  }
  entries.sort((a, b) => (regionalOrderOf(a.slug) ?? 0) - (regionalOrderOf(b.slug) ?? 0));
  return entries;
}

function regionalOrderOf(slug: string): number | undefined {
  return REGIONAL_DEX.find((f) => f.slug === slug)?.order;
}

// Merges the "regional" key in additively -- every other top-level key
// (including "mega"/"gmax", owned by separate scripts) is read fresh and
// preserved untouched, minimizing the window for a lost-update race against
// another script writing the same manifest file.
export async function mergeRegionalIntoManifest(manifestPath: string, regionalSection: RegionalManifestEntry[]): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const merged = { ...existing, regional: regionalSection };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(merged, null, 2), 'utf8');
}

// --- Network ----------------------------------------------------------------

const REQUESTS_PER_SECOND = 10;

interface FetchResult {
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

interface JsonFetchResult {
  ok: boolean;
  status: number;
  json: unknown;
}

async function rawFetchJson(url: string): Promise<JsonFetchResult> {
  const res = await fetch(url);
  if (!res.ok) return { ok: false, status: res.status, json: null };
  return { ok: true, status: res.status, json: await res.json() };
}

// One shared politely-paced fetch gate for every network call this script
// makes (form-id lookups, static images, animated images) so the combined
// request rate against pokeapi.co and the two sprite hosts together never
// exceeds REQUESTS_PER_SECOND.
const politeFetchBytes = withPoliteDelay(rawFetchBytes, 1000 / REQUESTS_PER_SECOND);
const politeFetchJson = withPoliteDelay(rawFetchJson, 1000 / REQUESTS_PER_SECOND);

async function fetchBytesWithRetry(url: string): Promise<FetchResult> {
  const first = await politeFetchBytes(url);
  if (first.ok || first.status === 404) return first;
  return politeFetchBytes(url); // one retry for transient failures only
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

// --- Form id resolution -------------------------------------------------------

// Looks up (and checkpoints) the numeric form id pokeapi.co assigns each
// regional variety -- the id the static sprite archive keys official-artwork
// files by (see spriteUrl in src/api/pokeapi.ts).
async function resolveFormId(form: RegionalForm, checkpoint: RegionalCheckpoint): Promise<number | null> {
  const existing = checkpoint.formIds[form.slug];
  if (existing?.status === 'resolved') return existing.formId;

  const result = await politeFetchJson(`${POKEAPI_BASE}/pokemon/${form.slug}`);
  if (!result.ok || result.json === null || typeof result.json !== 'object') {
    checkpoint.formIds[form.slug] = { status: 'unresolved', reason: `HTTP ${result.status}` };
    console.warn(`[form-id] ${form.slug}: HTTP ${result.status}`);
    return null;
  }
  const id = (result.json as { id?: unknown }).id;
  if (typeof id !== 'number') {
    checkpoint.formIds[form.slug] = { status: 'unresolved', reason: 'response had no numeric id' };
    console.warn(`[form-id] ${form.slug}: response had no numeric id`);
    return null;
  }
  checkpoint.formIds[form.slug] = { status: 'resolved', formId: id };
  return id;
}

// --- Per-form download ---------------------------------------------------

async function downloadRegionalStatic(form: RegionalForm, formId: number, checkpoint: RegionalCheckpoint): Promise<void> {
  const destPath = path.join(REGIONAL_STATIC_DIR, `${form.slug}.png`);
  const existing = checkpoint.static[form.slug];
  if (existing?.status === 'done' && (await fileExists(destPath))) return;

  const url = spriteUrl(formId);
  const result = await fetchBytesWithRetry(url);
  if (!result.ok) {
    checkpoint.static[form.slug] = { status: 'failed', reason: `HTTP ${result.status}` };
    console.warn(`[static] ${form.slug}: HTTP ${result.status}`);
    return;
  }
  const validation = validateStaticImageBytes(result.bytes, result.contentType);
  if (!validation.ok) {
    checkpoint.static[form.slug] = { status: 'failed', reason: validation.reason };
    console.warn(`[static] ${form.slug}: ${validation.reason}`);
    return;
  }
  await mkdir(REGIONAL_STATIC_DIR, { recursive: true });
  await writeFile(destPath, result.bytes);
  checkpoint.static[form.slug] = { status: 'done', bytes: result.bytes.byteLength };
}

async function downloadRegionalAnimated(form: RegionalForm, checkpoint: RegionalCheckpoint): Promise<void> {
  const existing = checkpoint.animated[form.slug];
  if (existing?.status === 'done') {
    const destPath = path.join(REGIONAL_ANIMATED_DIR, `${form.slug}.${existing.ext}`);
    if (await fileExists(destPath)) return;
  } else if (existing?.status === 'not-found') {
    return; // confirmed absent from the animated source, nothing to retry
  }

  const url = regionalAnimatedSpriteUrl(form.slug);
  const result = await fetchBytesWithRetry(url);
  if (result.status === 404) {
    checkpoint.animated[form.slug] = { status: 'not-found' };
    return;
  }
  if (!result.ok) {
    checkpoint.animated[form.slug] = { status: 'failed', reason: `HTTP ${result.status}` };
    console.warn(`[animated] ${form.slug}: HTTP ${result.status}`);
    return;
  }
  const validation = validateAnimatedImageBytes(result.bytes, result.contentType);
  if (!validation.ok) {
    checkpoint.animated[form.slug] = { status: 'failed', reason: validation.reason };
    console.warn(`[animated] ${form.slug}: ${validation.reason}`);
    return;
  }

  await mkdir(REGIONAL_ANIMATED_DIR, { recursive: true });
  const webpBytes = await maybeConvertToWebp(result.bytes);
  if (webpBytes) {
    await writeFile(path.join(REGIONAL_ANIMATED_DIR, `${form.slug}.webp`), webpBytes);
    checkpoint.animated[form.slug] = { status: 'done', ext: 'webp', bytes: webpBytes.byteLength };
  } else {
    await writeFile(path.join(REGIONAL_ANIMATED_DIR, `${form.slug}.gif`), result.bytes);
    checkpoint.animated[form.slug] = { status: 'done', ext: 'gif', bytes: result.bytes.byteLength };
  }
}

// --- Main --------------------------------------------------------------------

export interface RegionalRunSummary {
  totalForms: number;
  staticDone: number;
  staticFailed: number;
  animatedDone: number;
  animatedNotFound: number;
  animatedFailed: number;
  staticBytes: number;
  animatedBytes: number;
  unresolvedFormIds: string[];
}

export async function run(forms: RegionalForm[] = regionalFormsWithOwnVariety()): Promise<RegionalRunSummary> {
  await mkdir(REGIONAL_STATIC_DIR, { recursive: true });
  await mkdir(REGIONAL_ANIMATED_DIR, { recursive: true });

  const checkpoint = await loadRegionalCheckpoint(CHECKPOINT_PATH);

  for (const form of forms) {
    const formId = await resolveFormId(form, checkpoint);
    await saveRegionalCheckpoint(CHECKPOINT_PATH, checkpoint);
    if (formId === null) continue; // can't fetch a static sprite without the form id
    await downloadRegionalStatic(form, formId, checkpoint);
    await downloadRegionalAnimated(form, checkpoint);
    await saveRegionalCheckpoint(CHECKPOINT_PATH, checkpoint);
  }

  const regionalSection = buildRegionalManifestSection(checkpoint);
  await mergeRegionalIntoManifest(MANIFEST_PATH, regionalSection);

  const summary: RegionalRunSummary = {
    totalForms: forms.length,
    staticDone: 0,
    staticFailed: 0,
    animatedDone: 0,
    animatedNotFound: 0,
    animatedFailed: 0,
    staticBytes: 0,
    animatedBytes: 0,
    unresolvedFormIds: [],
  };
  for (const [slug, entry] of Object.entries(checkpoint.formIds)) {
    if (entry.status === 'unresolved') summary.unresolvedFormIds.push(slug);
  }
  for (const entry of Object.values(checkpoint.static)) {
    if (entry.status === 'done') {
      summary.staticDone += 1;
      summary.staticBytes += entry.bytes;
    } else {
      summary.staticFailed += 1;
    }
  }
  for (const entry of Object.values(checkpoint.animated)) {
    if (entry.status === 'done') {
      summary.animatedDone += 1;
      summary.animatedBytes += entry.bytes;
    } else if (entry.status === 'not-found') {
      summary.animatedNotFound += 1;
    } else {
      summary.animatedFailed += 1;
    }
  }
  return summary;
}

// --- CLI entry -----------------------------------------------------------

// Only run when executed directly (not when imported by tests), matching
// this pipeline's existing scripts (see downloadMegaSprites.ts).
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  run()
    .then((summary) => {
      console.log('Regional sprite download complete.');
      console.log(`  Static:   ${summary.staticDone}/${summary.totalForms} done, ${summary.staticFailed} failed, ${(summary.staticBytes / 1_000_000).toFixed(1)} MB`);
      console.log(`  Animated: ${summary.animatedDone}/${summary.totalForms} done, ${summary.animatedNotFound} not covered by the source, ${summary.animatedFailed} failed, ${(summary.animatedBytes / 1_000_000).toFixed(1)} MB`);
      if (summary.unresolvedFormIds.length > 0) {
        console.warn(`  Unresolved form ids: ${summary.unresolvedFormIds.join(', ')}`);
      }
    })
    .catch((error) => {
      console.error('Regional sprite download failed:', error);
      process.exitCode = 1;
    });
}
