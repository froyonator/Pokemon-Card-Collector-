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
import { extractBalancedBraces, splitTopLevelPipes } from './setlistParser';
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

export interface CardArticleDisambiguator {
  cardName: string;
  setName: string;
  number: string;
}

/**
 * Splits a card article title's trailing "Name (SetName Number)"
 * disambiguator into its parts, when present. Every `{{TCG ID}}`-macro- or
 * `wikilink`-derived title carries this suffix (see setlistParser.ts's own
 * `resolveNameCell`) -- reprint rows included, where SetName names the
 * origin set the scan actually files under, not the product the row is
 * listed in (confirmed live: "Cubone (Battle Styles 69)" for a card listed
 * in a Trick or Trade promo set). Returns null for a bare `literal` name
 * with no parenthetical to split.
 */
export function parseCardArticleDisambiguator(cardArticleTitle: string): CardArticleDisambiguator | null {
  const match = cardArticleTitle.match(/^(.+?)\s\(([^()]+)\)$/);
  if (!match) return null;
  const cardName = match[1].trim();
  const inner = match[2].trim();
  const lastSpace = inner.lastIndexOf(' ');
  if (lastSpace === -1) return null;
  const setName = inner.slice(0, lastSpace).trim();
  const number = inner.slice(lastSpace + 1).trim();
  if (!cardName || !setName || !number) return null;
  return { cardName, setName, number };
}

const INFOBOX_TEMPLATE_PATTERN = /\{\{[^|{}\n]*Infobox\b/i;

/** Parses the first `{{...Infobox|...}}` template call's key=value fields out of a card article's wikitext. Null when no such template is found. */
function parseFirstInfoboxFields(wikitext: string): Record<string, string> | null {
  const marker = INFOBOX_TEMPLATE_PATTERN.exec(wikitext);
  if (!marker) return null;
  const template = extractBalancedBraces(wikitext, marker.index);
  if (!template) return null;

  const inner = template.raw.slice(2, -2);
  const pipeIndex = inner.indexOf('|');
  if (pipeIndex === -1) return {};

  const fields: Record<string, string> = {};
  for (const part of splitTopLevelPipes(inner.slice(pipeIndex + 1))) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key) fields[key] = value;
  }
  return fields;
}

/** Strips an infobox image field down to a bare filename: unwraps a `[[File:Name.jpg|...]]`-style link, or a bare `Image:`/`File:` prefix. */
function cleanInfoboxImageValue(raw: string | undefined): string | null {
  let value = (raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith('[[') && value.endsWith(']]')) {
    value = splitTopLevelPipes(value.slice(2, -2))[0]?.trim() ?? '';
  }
  value = value.replace(/^(?:File|Image):\s*/i, '').trim();
  return value || null;
}

/**
 * Reads a card article's own infobox `image=` field -- the authoritative
 * source for its scan filename, for use once a filename guess has failed
 * to resolve. A card reprinted across several products can share one
 * article with per-printing `reprintN` fields (confirmed live: Pikachu's
 * shared article carries `reprint1=PikachuPaldeanFates131.jpg` alongside
 * `recaption1={{TCG|Paldean Fates}} print...`, the set-naming companion
 * field) alongside the bare `image=`/`caption=` pair for the FIRST-listed
 * printing, which is not necessarily the one this row is about; when a
 * numbered field's own companion caption names one of `targetSetNames`
 * (case-insensitive substring), it's preferred over the bare `image`
 * field, which is otherwise the fallback.
 */
export function parseCardInfoboxImageFilename(wikitext: string, targetSetNames: string[]): string | null {
  const fields = parseFirstInfoboxFields(wikitext);
  if (!fields) return null;

  const normalizedTargets = targetSetNames.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (normalizedTargets.length > 0) {
    for (const [key, value] of Object.entries(fields)) {
      const match = /^(?:image|reprint)(\d+)$/i.exec(key);
      if (!match) continue;
      const index = match[1];
      const setField =
        fields[`recaption${index}`] ?? fields[`set${index}`] ?? fields[`setname${index}`] ?? fields[`reprintset${index}`];
      if (setField && normalizedTargets.some((t) => setField.toLowerCase().includes(t))) {
        const cleaned = cleanInfoboxImageValue(value);
        if (cleaned) return cleaned;
      }
    }
  }

  return cleanInfoboxImageValue(fields.image);
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
