import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { CardRecord } from './buildStaticDatabase';
import type { PkmnCardsRecord } from './parsePkmnCards';
import type { ArtOfPkmRecord } from './parseArtOfPkm';
import {
  buildArtofpkmIndex,
  buildPkmncardsIndex,
  containsLatinLetters,
  findArtofpkmMatch,
  findLatestSnapshotDir,
  findPkmncardsMatch,
  type ArtofpkmIndex,
  type PkmnCardsIndex,
} from './crossValidateStaticDatabase';

// ---------------------------------------------------------------------------
// Cross-source asset resolver.
//
// The static database's own image field (`imageBase`) is empty for a real
// slice of cards -- the primary catalog simply never got an image for them.
// This module fills those gaps (and, for Japanese, an untranslated-name gap)
// by falling back to one of two independently hosted image sets that were
// built from this repo's own fallback snapshots, joined to a primary-source
// card by the same fuzzy set-name + local-card-number matching already
// developed and proven out in crossValidateStaticDatabase.ts. It changes
// nothing about the primary source's own data -- it only ever supplies an
// alternate URL/name for a caller to prefer when the primary source has
// nothing.
// ---------------------------------------------------------------------------

const PRIMARY_HOSTED_BASE = 'https://raw.githubusercontent.com/froyonator/pcc-assets-a/main';
const ENGLISH_FALLBACK_HOSTED_BASE = 'https://raw.githubusercontent.com/froyonator/pcc-assets-b/main';
const JAPANESE_FALLBACK_HOSTED_BASE = 'https://raw.githubusercontent.com/froyonator/pcc-assets-c/main';

// The primary source's own per-card snapshot always saves its downloaded
// image as `image.webp` regardless of the real upstream content-type, so its
// hosted "original" is always a .webp file.
const PRIMARY_ORIGINAL_FILENAME = 'original.webp';
const THUMB_FILENAME = 'thumb.webp';

export interface ResolvedAssets {
  /** Set when a better hosted thumbnail than the caller's own default is available. Undefined = "no override". */
  thumbUrl?: string;
  /** Set when a better hosted full-resolution image than the caller's own default is available. Undefined = "no override". */
  fullUrl?: string;
  /** Set only for a Japanese card whose stored name looks like an untranslated placeholder and a fallback match supplied a plausible native-language name. Undefined = "keep the existing name". */
  resolvedName?: string;
}

// A record.json written by the fallback-source snapshot scripts always
// carries an `imageFile` field (e.g. "image.jpeg") recording the exact
// extension of the image that was actually downloaded for that card -- not
// modeled on PkmnCardsRecord/ArtOfPkmRecord themselves (those types describe
// only the page-parsed fields), but genuinely present on every record these
// indexes were built from, since a snapshot never writes a record.json for a
// card whose image download failed.
type WithImageFile<T> = T & { imageFile?: string };

function originalExtension<T>(record: WithImageFile<T>, fallbackExt: string): string {
  const imageFile = record.imageFile;
  if (!imageFile) return fallbackExt;
  const ext = path.extname(imageFile).slice(1).toLowerCase();
  return ext || fallbackExt;
}

export interface EnglishFallbackIndex {
  matchIndex: PkmnCardsIndex;
  // The fallback source's own record.json never records which set-folder it
  // was filed under (only the card's own slug) -- see this module's loader
  // below for how this gets built alongside matchIndex.
  setSlugByCardSlug: Map<string, string>;
}

export interface JapaneseFallbackIndex {
  matchIndex: ArtofpkmIndex;
}

export interface FallbackAssetIndexes {
  english?: EnglishFallbackIndex;
  japanese?: JapaneseFallbackIndex;
}

/** True for the match kinds crossValidateStaticDatabase.ts itself treats as a genuine, trustworthy join -- excludes 'ambiguous', 'none', and 'dex-conflict' (a numbering-channel collision that may well be a different physical card). */
function isUsableMatch<T>(match: {
  kind: string;
  record: T | null;
}): match is { kind: string; record: T } {
  return (match.kind === 'primary' || match.kind === 'fallback-dexnumber') && match.record !== null;
}

function primaryHostedUrl(card: CardRecord, filename: string): string {
  return `${PRIMARY_HOSTED_BASE}/${card.language}/${card.setId}/${card.id}/${filename}`;
}

function englishFallbackAssets(
  index: EnglishFallbackIndex,
  record: PkmnCardsRecord
): { thumbUrl: string; fullUrl: string } | null {
  const setSlug = index.setSlugByCardSlug.get(record.sourceCardSlug);
  if (!setSlug) return null;
  const ext = originalExtension(record as WithImageFile<PkmnCardsRecord>, 'jpeg');
  const base = `${ENGLISH_FALLBACK_HOSTED_BASE}/en/${setSlug}/${record.sourceCardSlug}`;
  return { thumbUrl: `${base}/${THUMB_FILENAME}`, fullUrl: `${base}/original.${ext}` };
}

function japaneseFallbackAssets(record: ArtOfPkmRecord): { thumbUrl: string; fullUrl: string } {
  const ext = originalExtension(record as WithImageFile<ArtOfPkmRecord>, 'webp');
  const base = `${JAPANESE_FALLBACK_HOSTED_BASE}/ja/${record.expansionId}/${record.sourceCardId}`;
  return { thumbUrl: `${base}/${THUMB_FILENAME}`, fullUrl: `${base}/original.${ext}` };
}

/**
 * Resolves the best available hosted image URLs (and, for Japanese, the best
 * available name) for one primary-source card.
 *
 * Resolution order for images: the primary source's own hosted copy whenever
 * it has one (`card.imageBase` non-empty) -- constructed directly from the
 * card's own id/set/language, never from a fallback -- otherwise a fuzzy
 * cross-source match in the appropriate fallback index (English for
 * `language === 'en'`, Japanese for `language === 'ja'`, nothing for any
 * other language, since neither fallback source covers them). Both URLs stay
 * undefined when neither source has an image, leaving the caller's own
 * existing (live API) fallback path untouched.
 *
 * Name resolution is independent of image resolution and Japanese-only: it
 * only overrides `name` when the primary source's own text looks like an
 * untranslated English placeholder AND the matched fallback record supplies
 * a plausible native-language name (itself free of Latin letters).
 */
export function resolveCardAssets(
  card: CardRecord,
  fallbackIndexes: FallbackAssetIndexes
): ResolvedAssets {
  const resolved: ResolvedAssets = {};

  if (card.imageBase) {
    resolved.thumbUrl = primaryHostedUrl(card, THUMB_FILENAME);
    resolved.fullUrl = primaryHostedUrl(card, PRIMARY_ORIGINAL_FILENAME);
  }

  if (card.language === 'en' && !card.imageBase && fallbackIndexes.english) {
    const match = findPkmncardsMatch(fallbackIndexes.english.matchIndex, card);
    if (isUsableMatch(match)) {
      const assets = englishFallbackAssets(fallbackIndexes.english, match.record);
      if (assets) {
        resolved.thumbUrl = assets.thumbUrl;
        resolved.fullUrl = assets.fullUrl;
      }
    }
  } else if (card.language === 'ja' && fallbackIndexes.japanese) {
    const match = findArtofpkmMatch(fallbackIndexes.japanese.matchIndex, card, card.dexNumber);
    const matchedRecord = isUsableMatch(match) ? match.record : null;

    if (!card.imageBase && matchedRecord) {
      const assets = japaneseFallbackAssets(matchedRecord);
      resolved.thumbUrl = assets.thumbUrl;
      resolved.fullUrl = assets.fullUrl;
    }

    if (matchedRecord && containsLatinLetters(card.name)) {
      const candidateName = matchedRecord.japaneseName;
      if (candidateName && !containsLatinLetters(candidateName)) {
        resolved.resolvedName = candidateName;
      }
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Fallback index loading -- run once per full build, not once per card.
// ---------------------------------------------------------------------------

/** Builds the card-slug -> set-slug lookup the English fallback snapshot's own record.json never records, from the snapshot's own directory layout (`en/<setSlug>/<cardSlug>/`). No JSON parsing needed -- just the two levels of directory names. */
async function buildSetSlugByCardSlug(snapshotDir: string): Promise<Map<string, string>> {
  const languageDir = path.join(snapshotDir, 'en');
  const setEntries = await readdir(languageDir, { withFileTypes: true });
  const setSlugByCardSlug = new Map<string, string>();
  for (const setEntry of setEntries) {
    if (!setEntry.isDirectory()) continue;
    const cardEntries = await readdir(path.join(languageDir, setEntry.name), { withFileTypes: true });
    for (const cardEntry of cardEntries) {
      if (!cardEntry.isDirectory()) continue;
      setSlugByCardSlug.set(cardEntry.name, setEntry.name);
    }
  }
  return setSlugByCardSlug;
}

async function loadEnglishFallbackIndex(snapshotDir: string): Promise<EnglishFallbackIndex> {
  const [matchIndex, setSlugByCardSlug] = await Promise.all([
    buildPkmncardsIndex(snapshotDir),
    buildSetSlugByCardSlug(snapshotDir),
  ]);
  return { matchIndex, setSlugByCardSlug };
}

async function loadJapaneseFallbackIndex(snapshotDir: string): Promise<JapaneseFallbackIndex> {
  return { matchIndex: await buildArtofpkmIndex(snapshotDir) };
}

// Directory-name prefixes the fallback snapshot scripts publish under --
// same prefixes crossValidateStaticDatabase.ts's own main() looks for.
const ENGLISH_FALLBACK_SNAPSHOT_PREFIX = 'pkmncards-en-';
const JAPANESE_FALLBACK_SNAPSHOT_PREFIX = 'artofpkm-ja-';

/** Loads both fallback indexes from the latest snapshot under `dataDir` matching each source's prefix. Meant to be called exactly once per full static-database build and passed to every `resolveCardAssets` call, not rebuilt per card. */
export async function loadFallbackAssetIndexes(dataDir: string): Promise<FallbackAssetIndexes> {
  const [englishSnapshotDir, japaneseSnapshotDir] = await Promise.all([
    findLatestSnapshotDir(dataDir, ENGLISH_FALLBACK_SNAPSHOT_PREFIX),
    findLatestSnapshotDir(dataDir, JAPANESE_FALLBACK_SNAPSHOT_PREFIX),
  ]);

  const [english, japanese] = await Promise.all([
    loadEnglishFallbackIndex(englishSnapshotDir),
    loadJapaneseFallbackIndex(japaneseSnapshotDir),
  ]);

  return { english, japanese };
}
