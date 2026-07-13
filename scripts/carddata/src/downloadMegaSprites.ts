// scripts/carddata/src/downloadMegaSprites.ts
//
// Downloads a self-hosted sprite set for every official Mega Evolution form
// (see src/data/megaDex.ts -- 46 species, 48 forms) into public/sprites/mega/,
// mirroring the conventions downloadSprites.ts already established for base
// forms so the running app never hot-links a third-party host at runtime:
//
//   public/sprites/mega/static/<slug>.png    -- all 48 forms.
//   public/sprites/mega/animated/<slug>.gif  -- as many as the animated
//                                               source covers (.webp instead
//                                               when conversion saves space;
//                                               see maybeConvertToWebp).
//   public/sprites/manifest.json             -- gains a "mega" array:
//                                               [{ slug, baseDex, name,
//                                                  animated, animatedExt? }]
//                                               alongside the existing
//                                               "animated"/"animatedFormat"
//                                               base-form keys (both kept).
//
// Static source: the same raw sprite archive downloadSprites.ts uses (see
// spriteUrl in src/api/pokeapi.ts), but keyed by each mega form's own
// numeric form id rather than its National Dex number -- mega forms don't
// have their own dex numbers, so that id has to be looked up. The lookup
// asks the community species/variety API (pokeapi.co) for each form slug's
// detail record once, then reuses spriteUrl()'s exact URL scheme with that
// numeric id. Looked-up ids are checkpointed so a resumed run doesn't
// re-query pokeapi.co for forms it already resolved.
//
// Animated source: the same modern battle-simulator animated archive
// (play.pokemonshowdown.com/sprites/ani/) used for base forms, but mega
// slugs need a different name transform than normalizeSpeciesNameForAnimatedSprite:
// the host keeps the hyphen before "mega" (e.g. "venusaur-mega.gif") but
// drops the hyphen between "mega" and a trailing X/Y ("charizard-megax.gif",
// not "charizard-mega-x.gif") -- verified live against both forms before
// writing megaAnimatedSlug. Every other mega species name in this set is
// plain ASCII with no punctuation, so no accent-stripping is needed here.
//
// Politeness / resumability: same withPoliteDelay-gated fetch and
// per-form-done checkpoint file (data/mega-sprite-download-progress.json)
// as downloadSprites.ts, so a killed/interrupted run resumes instead of
// re-downloading everything, and the combined request rate against either
// host never exceeds REQUESTS_PER_SECOND.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spriteUrl } from '../../../src/api/pokeapi';
import { MEGA_DEX, type MegaForm } from './data/megaDex';
import { maybeConvertToWebp, validateAnimatedImageBytes, validateStaticImageBytes } from './downloadSprites';
import { withPoliteDelay } from './politeFetch';

// --- Paths -------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const MEGA_STATIC_DIR = path.join(REPO_ROOT, 'public/sprites/mega/static');
export const MEGA_ANIMATED_DIR = path.join(REPO_ROOT, 'public/sprites/mega/animated');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'public/sprites/manifest.json');
export const CHECKPOINT_PATH = path.join(REPO_ROOT, 'scripts/carddata/data/mega-sprite-download-progress.json');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// --- Animated slug transform ---------------------------------------------

// Mega slugs (from megaDex.ts) already match the sprite archive's own
// variety-name spelling, e.g. "venusaur-mega", "charizard-mega-x". The
// animated host uses the same spelling EXCEPT it fuses "-mega-x"/"-mega-y"
// into "-megax"/"-megay" (hyphen dropped only between "mega" and the X/Y
// suffix, kept everywhere else).
export function megaAnimatedSlug(slug: string): string {
  return slug.replace(/-mega-(x|y)$/, '-mega$1');
}

export function megaAnimatedSpriteUrl(slug: string): string {
  return `https://play.pokemonshowdown.com/sprites/ani/${megaAnimatedSlug(slug)}.gif`;
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
export type MegaStaticCheckpointEntry = StaticDoneEntry | StaticFailedEntry;

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
export type MegaAnimatedCheckpointEntry = AnimatedDoneEntry | AnimatedNotFoundEntry | AnimatedFailedEntry;

export interface MegaCheckpoint {
  formIds: Record<string, FormIdCheckpointEntry>;
  static: Record<string, MegaStaticCheckpointEntry>;
  animated: Record<string, MegaAnimatedCheckpointEntry>;
}

export function emptyMegaCheckpoint(): MegaCheckpoint {
  return { formIds: {}, static: {}, animated: {} };
}

export async function loadMegaCheckpoint(checkpointPath: string): Promise<MegaCheckpoint> {
  try {
    const raw = await readFile(checkpointPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MegaCheckpoint>;
    return {
      formIds: parsed.formIds && typeof parsed.formIds === 'object' ? parsed.formIds : {},
      static: parsed.static && typeof parsed.static === 'object' ? parsed.static : {},
      animated: parsed.animated && typeof parsed.animated === 'object' ? parsed.animated : {},
    };
  } catch {
    return emptyMegaCheckpoint();
  }
}

export async function saveMegaCheckpoint(checkpointPath: string, checkpoint: MegaCheckpoint): Promise<void> {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// --- Manifest --------------------------------------------------------------

export interface MegaManifestEntry {
  slug: string;
  baseDex: number;
  name: string;
  animated: boolean;
  animatedExt?: 'webp';
}

export function buildMegaManifestSection(checkpoint: MegaCheckpoint): MegaManifestEntry[] {
  const entries: MegaManifestEntry[] = [];
  for (const form of MEGA_DEX) {
    const staticEntry = checkpoint.static[form.slug];
    if (staticEntry?.status !== 'done') continue; // no usable static sprite, leave out of manifest
    const animatedEntry = checkpoint.animated[form.slug];
    const entry: MegaManifestEntry = {
      slug: form.slug,
      baseDex: form.baseDex,
      name: form.displayName,
      animated: animatedEntry?.status === 'done',
    };
    if (animatedEntry?.status === 'done' && animatedEntry.ext === 'webp') entry.animatedExt = 'webp';
    entries.push(entry);
  }
  entries.sort((a, b) => (megaOrderOf(a.slug) ?? 0) - (megaOrderOf(b.slug) ?? 0));
  return entries;
}

function megaOrderOf(slug: string): number | undefined {
  return MEGA_DEX.find((f) => f.slug === slug)?.order;
}

export async function mergeMegaIntoManifest(manifestPath: string, megaSection: MegaManifestEntry[]): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const merged = { ...existing, mega: megaSection };
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
// mega variety -- the id the static sprite archive keys official-artwork
// files by (see spriteUrl in src/api/pokeapi.ts).
async function resolveFormId(form: MegaForm, checkpoint: MegaCheckpoint): Promise<number | null> {
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

async function downloadMegaStatic(form: MegaForm, formId: number, checkpoint: MegaCheckpoint): Promise<void> {
  const destPath = path.join(MEGA_STATIC_DIR, `${form.slug}.png`);
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
  await mkdir(MEGA_STATIC_DIR, { recursive: true });
  await writeFile(destPath, result.bytes);
  checkpoint.static[form.slug] = { status: 'done', bytes: result.bytes.byteLength };
}

async function downloadMegaAnimated(form: MegaForm, checkpoint: MegaCheckpoint): Promise<void> {
  const existing = checkpoint.animated[form.slug];
  if (existing?.status === 'done') {
    const destPath = path.join(MEGA_ANIMATED_DIR, `${form.slug}.${existing.ext}`);
    if (await fileExists(destPath)) return;
  } else if (existing?.status === 'not-found') {
    return; // confirmed absent from the animated source, nothing to retry
  }

  const url = megaAnimatedSpriteUrl(form.slug);
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

  await mkdir(MEGA_ANIMATED_DIR, { recursive: true });
  const webpBytes = await maybeConvertToWebp(result.bytes);
  if (webpBytes) {
    await writeFile(path.join(MEGA_ANIMATED_DIR, `${form.slug}.webp`), webpBytes);
    checkpoint.animated[form.slug] = { status: 'done', ext: 'webp', bytes: webpBytes.byteLength };
  } else {
    await writeFile(path.join(MEGA_ANIMATED_DIR, `${form.slug}.gif`), result.bytes);
    checkpoint.animated[form.slug] = { status: 'done', ext: 'gif', bytes: result.bytes.byteLength };
  }
}

// --- Main --------------------------------------------------------------------

export interface MegaRunSummary {
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

export async function run(forms: MegaForm[] = MEGA_DEX): Promise<MegaRunSummary> {
  await mkdir(MEGA_STATIC_DIR, { recursive: true });
  await mkdir(MEGA_ANIMATED_DIR, { recursive: true });

  const checkpoint = await loadMegaCheckpoint(CHECKPOINT_PATH);

  for (const form of forms) {
    const formId = await resolveFormId(form, checkpoint);
    await saveMegaCheckpoint(CHECKPOINT_PATH, checkpoint);
    if (formId === null) continue; // can't fetch a static sprite without the form id
    await downloadMegaStatic(form, formId, checkpoint);
    await downloadMegaAnimated(form, checkpoint);
    await saveMegaCheckpoint(CHECKPOINT_PATH, checkpoint);
  }

  const megaSection = buildMegaManifestSection(checkpoint);
  await mergeMegaIntoManifest(MANIFEST_PATH, megaSection);

  const summary: MegaRunSummary = {
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

// Only run when executed directly (not when imported by tests), matching
// this pipeline's existing scripts (see downloadSprites.ts).
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  run()
    .then((summary) => {
      console.log('Mega sprite download complete.');
      console.log(`  Static:   ${summary.staticDone}/${summary.totalForms} done, ${summary.staticFailed} failed, ${(summary.staticBytes / 1_000_000).toFixed(1)} MB`);
      console.log(`  Animated: ${summary.animatedDone}/${summary.totalForms} done, ${summary.animatedNotFound} not covered by the source, ${summary.animatedFailed} failed, ${(summary.animatedBytes / 1_000_000).toFixed(1)} MB`);
      if (summary.unresolvedFormIds.length > 0) {
        console.warn(`  Unresolved form ids: ${summary.unresolvedFormIds.join(', ')}`);
      }
    })
    .catch((error) => {
      console.error('Mega sprite download failed:', error);
      process.exitCode = 1;
    });
}
