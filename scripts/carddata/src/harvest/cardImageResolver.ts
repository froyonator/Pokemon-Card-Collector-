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
import { MAX_CARD_ASPECT_RATIO, MIN_CARD_ASPECT_RATIO } from '../downloadImage';
import { extractBalancedBraces, splitTopLevelPipes } from './setlistParser';
import type { WikiApiClient } from './wikiApiClient';
import type { WikiImageInfo } from './types';

/** Prefixes a bare filename with the `File:` namespace, leaving an already-prefixed title untouched. */
export function toFileTitle(filename: string): string {
  return filename.startsWith('File:') ? filename : `File:${filename}`;
}

/**
 * True when a resolved wiki file's own reported width/height (from the
 * imageinfo query's `size` prop -- present alongside a real url for every
 * real request against the live API) falls within a physical card scan's
 * plausible aspect-ratio range. Guards against a hotlinked non-scan image
 * that otherwise clears every other check (real file, resolves to a url)
 * -- confirmed live: a news/event photo of a hand holding a card,
 * landscape-oriented, assigned in place of a real scan. Dimensions absent
 * from the response (never true against the live API, but true of test
 * doubles that don't bother mocking them) are treated as inconclusive
 * rather than rejected, so this guard only ever REJECTS on positive
 * evidence of a wrong-shaped image, never on missing metadata.
 */
export function isCardShapedImage(info: Pick<WikiImageInfo, 'width' | 'height'>): boolean {
  if (!info.width || !info.height) return true;
  const ratio = info.width / info.height;
  return ratio >= MIN_CARD_ASPECT_RATIO && ratio <= MAX_CARD_ASPECT_RATIO;
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
 *
 * Returns null when the card name, the set name, or the number would
 * vanish from the guess -- `clean()` strips every non-ASCII-alphanumeric
 * character, so a name/set written entirely outside ASCII (Japanese/Chinese
 * especially) cleans to the empty string. A guess missing any of its three
 * identity components carries no evidence tying it to THIS card, and can
 * collide with a completely unrelated file on the reference wiki (confirmed
 * live: a Japanese card name + Japanese set name both vanishing produced the
 * bare guess "11.jpg", which the wiki hosts as an unrelated merchandise
 * photo -- 11 different cards whose localId normalized to "11" all got
 * assigned that same photo). Never attempt a guess missing a component.
 */
export function guessCardImageFilename(input: GuessCardImageFilenameInput): string | null {
  const numerator = input.cardNumber.split('/')[0]?.replace(/^0+(?=\d)/, '') ?? '';
  const clean = (value: string) => value.replace(/[^A-Za-z0-9]/g, '');
  const cardName = clean(input.cardName);
  const setName = clean(input.setName);
  if (!cardName || !setName || !numerator) return null;
  return `${cardName}${setName}${numerator}.${input.extension ?? 'jpg'}`;
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
 * True when `filename`'s OWN print number -- the FIRST digit run in the
 * filename, immediately after the card name -- equals `printNumber`.
 * Anchored to the FIRST digit run rather than a search-anywhere match:
 * this pipeline's real observed filename convention is always
 * `<CardName><Number><SetName>.ext` (confirmed live: "Pikachu170Collection151.jpg",
 * "Mewex193PokémonCard151.jpg"), and the SET NAME itself can carry digits
 * of its own (confirmed live: the "151" expansion's own filename suffix is
 * literally "PokémonCard151.jpg" -- searching anywhere would false-match
 * row 151 against reprint entries for completely different prints, 193 and
 * 205, purely because their filenames also end in "...151.jpg"). Both
 * sides compared on the bare numerator (leading zeros stripped), matching
 * this pipeline's existing localId convention.
 */
function filenameCarriesPrintNumber(filename: string, printNumber: string): boolean {
  const numerator = printNumber.split('/')[0]?.trim().replace(/^0+(?=\d)/, '');
  if (!numerator) return false;
  const firstDigitRun = filename.match(/\d+/);
  if (!firstDigitRun) return false;
  return firstDigitRun[0].replace(/^0+(?=\d)/, '') === numerator;
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
 *
 * `printNumber`, when given, is this row's OWN printed card number -- the
 * disambiguating signal a set name alone can't provide when several
 * reprintN entries share the exact same target set (confirmed live: an
 * illustration-rare "parade" of four DIFFERENT Pikachu prints -- 170, 171,
 * 172, 173 -- all filed under the same set name "Collection 151" on one
 * shared article, with only the reprintN filename itself
 * ("Pikachu170Collection151.jpg" etc.) carrying which print is which; set
 * name alone would have picked the FIRST match for every one of the four
 * rows, silently handing all of them the same scan). When it's supplied:
 *  - a candidate whose own filename carries this print number wins
 *    outright, regardless of how many other set-name matches exist;
 *  - failing that, a set-name match is trusted only when it's the SOLE
 *    set-name match (unambiguous, same as the no-number behavior);
 *  - failing THAT, the bare `image=` field is checked on the exact same
 *    number-in-filename evidence as any reprintN candidate (confirmed
 *    live: Mew ex's own base print, #151, is `image=Mewex151PokémonCard151.jpg`
 *    on a shared article whose OTHER reprints are different numbered
 *    prints entirely -- the "151" in ITS filename is what ties it to row
 *    151, not merely being first-listed);
 *  - and failing even that, a multi-print article that genuinely has no
 *    field naming this row's number is left unresolved (null) rather than
 *    guessing the first-listed printing's image, which almost certainly
 *    belongs to a DIFFERENT print.
 * Omitting `printNumber` preserves the original set-name-only behavior
 * exactly, for callers (e.g. deepImageResolver.ts) that already establish
 * print identity at the article-title level before ever reading the
 * infobox.
 */
export function parseCardInfoboxImageFilename(
  wikitext: string,
  targetSetNames: string[],
  printNumber?: string
): string | null {
  const fields = parseFirstInfoboxFields(wikitext);
  if (!fields) return null;

  const normalizedTargets = targetSetNames.map((s) => s.trim().toLowerCase()).filter(Boolean);

  interface Candidate {
    filename: string;
    setField: string | null;
  }
  const reprintCandidates: Candidate[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const match = /^(?:image|reprint)(\d+)$/i.exec(key);
    if (!match) continue;
    const index = match[1];
    const setField =
      fields[`recaption${index}`] ?? fields[`set${index}`] ?? fields[`setname${index}`] ?? fields[`reprintset${index}`] ?? null;
    const cleaned = cleanInfoboxImageValue(value);
    if (cleaned) reprintCandidates.push({ filename: cleaned, setField });
  }

  if (printNumber) {
    const numberMatches = reprintCandidates.filter((c) => filenameCarriesPrintNumber(c.filename, printNumber));

    // A number match alone is not enough when we know which set this row
    // belongs to: a shared card NAME can resolve to a wiki article for a
    // COMPLETELY unrelated product that merely happens to reuse the same
    // print number by coincidence (confirmed live: "Eevee & Snorlax-GX"
    // has only ONE wiki article, "Team Up" (its 2019 origin release);
    // guessing any numbered title for it redirects there regardless of
    // number, and Team Up's own reprint1 happens to ALSO be numbered 171,
    // completely unrelated to a same-numbered zh-cn "Shining Synergy"
    // print). So once we know the target set(s), a number-matched
    // candidate is trusted only when its own setField doesn't positively
    // name a DIFFERENT set than every target -- an absent setField is
    // uninformative and doesn't disqualify it (see the Mew ex #151 base
    // print, whose bare `image=` field has no numbered companion at all).
    if (normalizedTargets.length > 0) {
      const corroborated = numberMatches.filter(
        (c) => !c.setField || normalizedTargets.some((t) => c.setField!.toLowerCase().includes(t))
      );
      if (corroborated.length === 1) return corroborated[0].filename;
      if (numberMatches.length > 0) return null; // one or more number matches, but none/multiple survive set corroboration -- never guess.
    } else if (numberMatches.length === 1) {
      return numberMatches[0].filename;
    } else if (numberMatches.length > 1) {
      return null; // ambiguous, no set names to narrow by.
    }

    // No candidate's own filename carries this print number. A set-name
    // match here would be a guess among sibling prints of the SAME set
    // (exactly the bug) -- only trust it when it's the single reprint
    // candidate in the whole infobox (nothing else to have confused it
    // with).
    if (normalizedTargets.length > 0 && reprintCandidates.length === 1) {
      const only = reprintCandidates[0];
      if (only.setField && normalizedTargets.some((t) => only.setField!.toLowerCase().includes(t))) {
        return only.filename;
      }
    }
    // The bare `image=` field itself is the base/first-listed printing --
    // trusted here on the SAME evidence standard as any reprintN candidate:
    // only when ITS OWN filename carries this row's print number (confirmed
    // live: Mew ex's base print #151 is `image=Mewex151PokémonCard151.jpg`,
    // sharing its article with several OTHER numbered reprints -- the "151"
    // in the filename is what ties it to row 151, not just its being first).
    const bareImage = cleanInfoboxImageValue(fields.image);
    if (bareImage && filenameCarriesPrintNumber(bareImage, printNumber)) return bareImage;

    // A multi-print infobox with no numbered (or bare-image) field tying to
    // this row: do not guess -- the bare `image=` field otherwise belongs to
    // whichever printing is listed first, not necessarily this one.
    if (reprintCandidates.length > 0) return null;
    return bareImage;
  }

  if (normalizedTargets.length > 0) {
    const setMatches = reprintCandidates.filter(
      (c) => c.setField && normalizedTargets.some((t) => c.setField!.toLowerCase().includes(t))
    );
    if (setMatches.length > 0) return setMatches[0].filename;
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
