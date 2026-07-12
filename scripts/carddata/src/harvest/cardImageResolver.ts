// scripts/carddata/src/harvest/cardImageResolver.ts
//
// Resolves card scan images: a File: title in, a direct media URL (plus
// size/mime/sha1) out, via the wiki API client's batched imageinfo query.
// The literal image filename should always come from the card article's
// own infobox `image=`/`reprint<N>=` field when available -- that's the
// authoritative value. `guessCardImageFilename` below is a fallback only,
// for when no infobox has been fetched yet; illustration-rare/full-art
// variants are known to occasionally break the naming convention it
// encodes, so never treat a guessed filename as confirmed until imageinfo
// resolves it to a real, non-missing page.
import type { WikiApiClient } from './wikiApiClient';
import type { WikiImageInfo } from './types';

/** Prefixes a bare filename with the `File:` namespace, leaving an already-prefixed title untouched. */
export function toFileTitle(filename: string): string {
  return filename.startsWith('File:') ? filename : `File:${filename}`;
}

export interface GuessCardImageFilenameInput {
  /** The card's full printed name, including any suffix (e.g. "Pikachu ex"). Spaces and punctuation are stripped. */
  cardName: string;
  /** The set's plain English/Japanese name, as it appears in the article title (without the "(TCG)" suffix). */
  setName: string;
  /** The row's printed card number, e.g. "057/191" -- only the numerator is used, with leading zeros stripped. */
  cardNumber: string;
  extension?: 'jpg' | 'png';
}

/**
 * Best-effort filename guess for a card's scan, following the
 * `<CardName><SetName><CardNumber>.jpg` PascalCase-concatenated convention
 * observed on real card articles. This is a fallback for use before a card
 * article's own infobox has been fetched; always prefer the literal
 * infobox value once it's available.
 */
export function guessCardImageFilename(input: GuessCardImageFilenameInput): string {
  const numerator = input.cardNumber.split('/')[0]?.replace(/^0+(?=\d)/, '') ?? '';
  const clean = (value: string) => value.replace(/[^A-Za-z0-9]/g, '');
  return `${clean(input.cardName)}${clean(input.setName)}${numerator}.${input.extension ?? 'jpg'}`;
}

/**
 * Resolves any number of File: titles (or bare filenames) to their media
 * URLs, batching through the wiki API client's imageinfo query. Titles the
 * wiki has no File: page for come back with `missing: true` and `url: null`
 * rather than being silently dropped, so callers can distinguish "not
 * found" from "not requested".
 */
export async function resolveCardImages(
  client: Pick<WikiApiClient, 'queryImageInfo'>,
  filenamesOrFileTitles: string[]
): Promise<Map<string, WikiImageInfo>> {
  const fileTitles = filenamesOrFileTitles.map(toFileTitle);
  return client.queryImageInfo(fileTitles);
}
