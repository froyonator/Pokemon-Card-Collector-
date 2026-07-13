// scripts/carddata/src/downloadGmaxSprites.ts
//
// Downloads a self-hosted sprite set for every official Gigantamax form
// (see src/data/vmaxDex.ts -- 33 forms across 32 species, only the entries
// with `hasGigantamax: true`) into public/sprites/gmax/, mirroring the
// conventions downloadMegaSprites.ts already established for Mega forms so
// the running app never hot-links a third-party host at runtime:
//
//   public/sprites/gmax/static/<slug>.png    -- every Gigantamax form that
//                                               resolves a form id and
//                                               static image.
//   public/sprites/gmax/animated/<slug>.gif  -- as many as the animated
//                                               source covers (.webp instead
//                                               when conversion saves space;
//                                               see maybeConvertToWebp).
//   public/sprites/manifest.json             -- gains a "gmax" array,
//                                               shaped exactly like the
//                                               existing "mega" array,
//                                               merged in ADDITIVELY (every
//                                               other top-level key,
//                                               including "mega", is
//                                               preserved untouched).
//
// Plain-Dynamax entries (hasGigantamax: false) are deliberately never
// looked up against any sprite host -- the app falls back to that
// species' own base sprite for those, by design (see vmaxDex.ts).
//
// Static source: the same raw sprite archive downloadSprites.ts uses (see
// spriteUrl in src/api/pokeapi.ts), keyed by each Gigantamax form's own
// numeric pokeapi.co form id (looked up once per slug, then checkpointed).
//
// Animated source: the same modern battle-simulator animated archive
// (play.pokemonshowdown.com/sprites/ani/) used for base and Mega forms.
// Verified live before writing this: the host uses the exact same
// "<species>-gmax.gif" slug pokeapi.co's own variety naming uses for every
// simple case (charizard-gmax.gif, pikachu-gmax.gif both confirmed 200),
// with one confirmed naming divergence -- Toxtricity's static source
// requires the base-form qualifier ("toxtricity-amped-gmax", since
// pokeapi.co splits its static sprite by base form even though the game
// and every VMAX card treat Toxtricity as one shared Gigantamax look) but
// the animated host does NOT: "toxtricity-gmax.gif" (no qualifier) is the
// one that resolves, "toxtricity-amped-gmax.gif" 404s. Urshifu's two Styles
// were probed under several plausible slugs (urshifu-gmax,
// urshifu-singlestrike-gmax, urshifu-rapidstrike-gmax, hyphenated and not)
// and none resolved -- both fall back to animated:false / the static
// sprite, exactly like several newest-wave Mega forms already do.
//
// Politeness / resumability: same withPoliteDelay-gated fetch and
// per-form-done checkpoint file (data/gmax-sprite-download-progress.json)
// as downloadMegaSprites.ts, so a killed/interrupted run resumes instead of
// re-downloading everything.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spriteUrl } from '../../../src/api/pokeapi';
import { VMAX_DEX, type VmaxForm } from './data/vmaxDex';
import { maybeConvertToWebp, validateAnimatedImageBytes, validateStaticImageBytes } from './downloadSprites';
import { withPoliteDelay } from './politeFetch';

// --- Paths -------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const GMAX_STATIC_DIR = path.join(REPO_ROOT, 'public/sprites/gmax/static');
export const GMAX_ANIMATED_DIR = path.join(REPO_ROOT, 'public/sprites/gmax/animated');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'public/sprites/manifest.json');
export const CHECKPOINT_PATH = path.join(REPO_ROOT, 'scripts/carddata/data/gmax-sprite-download-progress.json');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// --- Only the Gigantamax entries are ever looked up against a sprite host ---

export function gmaxForms(): VmaxForm[] {
  return VMAX_DEX.filter((f) => f.hasGigantamax);
}

// --- Animated slug transform ---------------------------------------------

// Every gmax slug (from vmaxDex.ts) already matches pokeapi.co's own static
// variety spelling. The animated host uses the exact same spelling for
// every simple "<species>-gmax" slug (verified live), EXCEPT Toxtricity --
// see this module's header comment -- whose animated file drops the
// base-form qualifier pokeapi.co's static host requires.
const ANIMATED_SLUG_OVERRIDES: Record<string, string> = {
  'toxtricity-amped-gmax': 'toxtricity-gmax',
};

export function gmaxAnimatedSlug(slug: string): string {
  return ANIMATED_SLUG_OVERRIDES[slug] ?? slug;
}

export function gmaxAnimatedSpriteUrl(slug: string): string {
  return `https://play.pokemonshowdown.com/sprites/ani/${gmaxAnimatedSlug(slug)}.gif`;
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
export type GmaxStaticCheckpointEntry = StaticDoneEntry | StaticFailedEntry;

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
export type GmaxAnimatedCheckpointEntry = AnimatedDoneEntry | AnimatedNotFoundEntry | AnimatedFailedEntry;

export interface GmaxCheckpoint {
  formIds: Record<string, FormIdCheckpointEntry>;
  static: Record<string, GmaxStaticCheckpointEntry>;
  animated: Record<string, GmaxAnimatedCheckpointEntry>;
}

export function emptyGmaxCheckpoint(): GmaxCheckpoint {
  return { formIds: {}, static: {}, animated: {} };
}

export async function loadGmaxCheckpoint(checkpointPath: string): Promise<GmaxCheckpoint> {
  try {
    const raw = await readFile(checkpointPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GmaxCheckpoint>;
    return {
      formIds: parsed.formIds && typeof parsed.formIds === 'object' ? parsed.formIds : {},
      static: parsed.static && typeof parsed.static === 'object' ? parsed.static : {},
      animated: parsed.animated && typeof parsed.animated === 'object' ? parsed.animated : {},
    };
  } catch {
    return emptyGmaxCheckpoint();
  }
}

export async function saveGmaxCheckpoint(checkpointPath: string, checkpoint: GmaxCheckpoint): Promise<void> {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// --- Manifest --------------------------------------------------------------

export interface GmaxManifestEntry {
  slug: string;
  baseDex: number;
  name: string;
  animated: boolean;
  animatedExt?: 'webp';
}

export function buildGmaxManifestSection(checkpoint: GmaxCheckpoint): GmaxManifestEntry[] {
  const entries: GmaxManifestEntry[] = [];
  for (const form of gmaxForms()) {
    const staticEntry = checkpoint.static[form.slug];
    if (staticEntry?.status !== 'done') continue; // no usable static sprite, leave out of manifest
    const animatedEntry = checkpoint.animated[form.slug];
    const entry: GmaxManifestEntry = {
      slug: form.slug,
      baseDex: form.baseDex,
      name: form.displayName,
      animated: animatedEntry?.status === 'done',
    };
    if (animatedEntry?.status === 'done' && animatedEntry.ext === 'webp') entry.animatedExt = 'webp';
    entries.push(entry);
  }
  entries.sort((a, b) => (gmaxOrderOf(a.slug) ?? 0) - (gmaxOrderOf(b.slug) ?? 0));
  return entries;
}

function gmaxOrderOf(slug: string): number | undefined {
  return VMAX_DEX.find((f) => f.slug === slug)?.order;
}

// Merges the "gmax" key in additively -- every other top-level key
// (including "mega", owned by a separate concurrent task) is read fresh and
// preserved untouched, minimizing the window for a lost-update race against
// another script writing the same manifest file.
export async function mergeGmaxIntoManifest(manifestPath: string, gmaxSection: GmaxManifestEntry[]): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const merged = { ...existing, gmax: gmaxSection };
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
// gmax variety -- the id the static sprite archive keys official-artwork
// files by (see spriteUrl in src/api/pokeapi.ts).
async function resolveFormId(form: VmaxForm, checkpoint: GmaxCheckpoint): Promise<number | null> {
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

async function downloadGmaxStatic(form: VmaxForm, formId: number, checkpoint: GmaxCheckpoint): Promise<void> {
  const destPath = path.join(GMAX_STATIC_DIR, `${form.slug}.png`);
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
  await mkdir(GMAX_STATIC_DIR, { recursive: true });
  await writeFile(destPath, result.bytes);
  checkpoint.static[form.slug] = { status: 'done', bytes: result.bytes.byteLength };
}

async function downloadGmaxAnimated(form: VmaxForm, checkpoint: GmaxCheckpoint): Promise<void> {
  const existing = checkpoint.animated[form.slug];
  if (existing?.status === 'done') {
    const destPath = path.join(GMAX_ANIMATED_DIR, `${form.slug}.${existing.ext}`);
    if (await fileExists(destPath)) return;
  } else if (existing?.status === 'not-found') {
    return; // confirmed absent from the animated source, nothing to retry
  }

  const url = gmaxAnimatedSpriteUrl(form.slug);
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

  await mkdir(GMAX_ANIMATED_DIR, { recursive: true });
  const webpBytes = await maybeConvertToWebp(result.bytes);
  if (webpBytes) {
    await writeFile(path.join(GMAX_ANIMATED_DIR, `${form.slug}.webp`), webpBytes);
    checkpoint.animated[form.slug] = { status: 'done', ext: 'webp', bytes: webpBytes.byteLength };
  } else {
    await writeFile(path.join(GMAX_ANIMATED_DIR, `${form.slug}.gif`), result.bytes);
    checkpoint.animated[form.slug] = { status: 'done', ext: 'gif', bytes: result.bytes.byteLength };
  }
}

// --- Main --------------------------------------------------------------------

export interface GmaxRunSummary {
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

export async function run(forms: VmaxForm[] = gmaxForms()): Promise<GmaxRunSummary> {
  await mkdir(GMAX_STATIC_DIR, { recursive: true });
  await mkdir(GMAX_ANIMATED_DIR, { recursive: true });

  const checkpoint = await loadGmaxCheckpoint(CHECKPOINT_PATH);

  for (const form of forms) {
    const formId = await resolveFormId(form, checkpoint);
    await saveGmaxCheckpoint(CHECKPOINT_PATH, checkpoint);
    if (formId === null) continue; // can't fetch a static sprite without the form id
    await downloadGmaxStatic(form, formId, checkpoint);
    await downloadGmaxAnimated(form, checkpoint);
    await saveGmaxCheckpoint(CHECKPOINT_PATH, checkpoint);
  }

  const gmaxSection = buildGmaxManifestSection(checkpoint);
  await mergeGmaxIntoManifest(MANIFEST_PATH, gmaxSection);

  const summary: GmaxRunSummary = {
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
      console.log('Gigantamax sprite download complete.');
      console.log(`  Static:   ${summary.staticDone}/${summary.totalForms} done, ${summary.staticFailed} failed, ${(summary.staticBytes / 1_000_000).toFixed(1)} MB`);
      console.log(`  Animated: ${summary.animatedDone}/${summary.totalForms} done, ${summary.animatedNotFound} not covered by the source, ${summary.animatedFailed} failed, ${(summary.animatedBytes / 1_000_000).toFixed(1)} MB`);
      if (summary.unresolvedFormIds.length > 0) {
        console.warn(`  Unresolved form ids: ${summary.unresolvedFormIds.join(', ')}`);
      }
    })
    .catch((error) => {
      console.error('Gigantamax sprite download failed:', error);
      process.exitCode = 1;
    });
}
