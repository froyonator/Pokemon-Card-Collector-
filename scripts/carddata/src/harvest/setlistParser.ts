// scripts/carddata/src/harvest/setlistParser.ts
//
// Extracts a set's card list from its wikitext: the `{{Setlist/entry}}` /
// `{{Setlist/nmentry}}` template rows, plus the `{{TCGExpansionInfobox}}`
// metadata block. Pure string parsing keyed on fixed template parameter
// positions -- no HTML, no live requests, no AI interpretation.
import type { ParsedSetPage, SetInfobox, SetlistRow, SetlistRowNameSource } from './types';

// --- Balanced wikitext template/link parsing -------------------------------
//
// A row's cells can themselves contain nested `{{...}}` template calls
// (`{{TCG ID|...}}`) and/or `[[...]]` wikilinks that carry their own `|`
// characters, so params cannot be split on every `|` -- only ones outside
// any nested `{{ }}` or `[[ ]]` pair.

/** Finds the balanced `{{...}}` template call starting at `startIndex` (which must point at its opening `{{`). Returns null if unbalanced. */
export function extractBalancedBraces(text: string, startIndex: number): { raw: string; endIndex: number } | null {
  if (text.slice(startIndex, startIndex + 2) !== '{{') return null;
  let depth = 0;
  let i = startIndex;
  while (i < text.length) {
    if (text.startsWith('{{', i)) {
      depth++;
      i += 2;
      continue;
    }
    if (text.startsWith('}}', i)) {
      depth--;
      i += 2;
      if (depth === 0) return { raw: text.slice(startIndex, i), endIndex: i };
      continue;
    }
    i++;
  }
  return null;
}

/** Finds the balanced `[[...]]` wikilink starting at `startIndex`. Returns null if unbalanced. */
function extractBalancedBrackets(text: string, startIndex: number): { raw: string; endIndex: number } | null {
  if (text.slice(startIndex, startIndex + 2) !== '[[') return null;
  let depth = 0;
  let i = startIndex;
  while (i < text.length) {
    if (text.startsWith('[[', i)) {
      depth++;
      i += 2;
      continue;
    }
    if (text.startsWith(']]', i)) {
      depth--;
      i += 2;
      if (depth === 0) return { raw: text.slice(startIndex, i), endIndex: i };
      continue;
    }
    i++;
  }
  return null;
}

/** Splits `inner` on `|` characters that are not nested inside a `{{...}}` or `[[...]]` pair. */
export function splitTopLevelPipes(inner: string): string[] {
  const parts: string[] = [];
  let braceDepth = 0;
  let bracketDepth = 0;
  let current = '';
  let i = 0;
  while (i < inner.length) {
    if (inner.startsWith('{{', i)) {
      braceDepth++;
      current += '{{';
      i += 2;
      continue;
    }
    if (inner.startsWith('}}', i)) {
      braceDepth = Math.max(0, braceDepth - 1);
      current += '}}';
      i += 2;
      continue;
    }
    if (inner.startsWith('[[', i)) {
      bracketDepth++;
      current += '[[';
      i += 2;
      continue;
    }
    if (inner.startsWith(']]', i)) {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += ']]';
      i += 2;
      continue;
    }
    const ch = inner[i];
    if (ch === '|' && braceDepth === 0 && bracketDepth === 0) {
      parts.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  parts.push(current);
  return parts;
}

/** Splits a balanced `{{Name|a|b|...}}` call (as returned by extractBalancedBraces) into its template name and top-level params. */
function splitTemplateCall(raw: string): { name: string; params: string[] } {
  const inner = raw.slice(2, -2);
  const pipeIndex = inner.indexOf('|');
  if (pipeIndex === -1) return { name: inner.trim(), params: [] };
  return { name: inner.slice(0, pipeIndex).trim(), params: splitTopLevelPipes(inner.slice(pipeIndex + 1)) };
}

// --- Name-cell resolution (design doc section on card-title derivation) ---

interface ResolvedName {
  displayName: string;
  cardArticleTitle: string;
  nameSource: SetlistRowNameSource;
}

/**
 * Resolves a setlist row's name cell to the card's own article title.
 * Two paths, per the `{{Setlist/entry}}` template's own name-cell
 * semantics: a `{{TCG ID|Set|Name|Number}}` macro expands deterministically
 * to `Name (Set Number)`; a literal `[[Title|Display]]` wikilink is used
 * whenever the article title needs a suffix (ex/GX/V/...) the macro can't
 * carry, and its target must be taken verbatim rather than reconstructed.
 * A `{{TCG ID}}` call can also carry a 4th param that overrides the
 * displayed text while still using the macro for title derivation.
 */
function resolveNameCell(nameCell: string): ResolvedName {
  const trimmed = nameCell.trim();

  if (trimmed.startsWith('{{TCG ID|') || trimmed.startsWith('{{TCG ID}}')) {
    const macro = extractBalancedBraces(trimmed, 0);
    if (macro) {
      const { params } = splitTemplateCall(macro.raw);
      const [setName, cardName, cardNum, displayOverride] = params.map((p) => p.trim());
      if (setName && cardName && cardNum) {
        return {
          displayName: displayOverride || cardName,
          cardArticleTitle: `${cardName} (${setName} ${cardNum})`,
          nameSource: 'tcgIdMacro',
        };
      }
    }
  }

  if (trimmed.startsWith('[[')) {
    const link = extractBalancedBrackets(trimmed, 0);
    if (link) {
      const linkInner = link.raw.slice(2, -2);
      const linkParts = splitTopLevelPipes(linkInner);
      const title = linkParts[0]?.trim() ?? '';
      const display = linkParts[1]?.trim() || title;
      if (title) {
        return { displayName: display, cardArticleTitle: title, nameSource: 'wikilink' };
      }
    }
  }

  return { displayName: trimmed, cardArticleTitle: trimmed, nameSource: 'literal' };
}

// --- Number-cell cleaning (reprint origin-set symbol) ------------------------

/**
 * A promo-style set's number cell can carry a leading `[[Image:...]]` (or
 * `[[File:...]]`) wikilink -- the origin set's symbol icon -- before the
 * actual printed number, marking the row as a reprint that visually
 * belongs to that origin set rather than to the product it's listed in
 * (confirmed live: a Trick or Trade 2022 row prints
 * `[[Image:SetSymbolBattle Styles.png|18px|link=Battle Styles (TCG)]] 069/163`
 * for a card that's really a Battle Styles reprint). Strips that wikilink
 * off so `cardNumber`/`localId` come out clean, and -- when the link's
 * `link=` param names a set article -- surfaces the origin set's plain
 * name for the image-filename strategy that needs it.
 */
function stripOriginSetSymbol(cardNumberCell: string): { number: string; originSetName: string | null } {
  const trimmed = cardNumberCell.trim();
  if (!trimmed.startsWith('[[')) return { number: trimmed, originSetName: null };

  const link = extractBalancedBrackets(trimmed, 0);
  if (!link) return { number: trimmed, originSetName: null };

  const linkParts = splitTopLevelPipes(link.raw.slice(2, -2));
  const target = linkParts[0]?.trim() ?? '';
  if (!/^(?:Image|File):/i.test(target)) return { number: trimmed, originSetName: null };

  const number = trimmed.slice(link.endIndex).trim();
  const linkParam = linkParts.find((p) => /^link\s*=/i.test(p.trim()));
  let originSetName: string | null = null;
  if (linkParam) {
    const linkTarget = linkParam.slice(linkParam.indexOf('=') + 1).trim();
    if (/\(A?TCG\)$/.test(linkTarget)) originSetName = deriveSetNameFromArticleTitle(linkTarget);
  }
  return { number, originSetName };
}

// --- Setlist row extraction -------------------------------------------------

function nullIfEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

// `{{Setlist/nmentry}}` (the "Additional Cards" promo table) reuses
// `{{Setlist/entry}}`'s own position semantics minus the rarity column, per
// the design doc's own template-source reading, but no real "Additional
// Cards" wikitext excerpt was available to verify the exact param count
// against -- this maps positions 1/2/3/4/5 the same as `entry` and treats
// position 6 as the promo note. Re-verify against a real fetched example
// before trusting promoNote on nmentry rows.
function buildRow(params: string[], hasRarity: boolean): SetlistRow {
  const [cardNumberCell, regulationMark, nameCell, primaryType, secondaryField, rarityOrPromo, trailingPromo] =
    params;
  const resolved = resolveNameCell(nameCell ?? '');
  const { number: cardNumber, originSetName } = stripOriginSetSymbol(cardNumberCell ?? '');
  return {
    cardNumber,
    regulationMark: nullIfEmpty(regulationMark),
    displayName: resolved.displayName,
    cardArticleTitle: resolved.cardArticleTitle,
    primaryType: nullIfEmpty(primaryType),
    secondaryField: nullIfEmpty(secondaryField),
    rarity: hasRarity ? nullIfEmpty(rarityOrPromo) : null,
    promoNote: hasRarity ? nullIfEmpty(trailingPromo) : nullIfEmpty(rarityOrPromo),
    nameSource: resolved.nameSource,
    originSetName,
  };
}

/** Extracts every `{{Setlist/entry}}` (or `{{Setlist/nmentry}}`) row from wikitext. Malformed individual rows are skipped, not fatal to the whole page. */
function extractSetlistRows(wikitext: string, templateSuffix: 'entry' | 'nmentry'): SetlistRow[] {
  const marker = `{{Setlist/${templateSuffix}|`;
  const rows: SetlistRow[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = wikitext.indexOf(marker, searchFrom);
    if (start === -1) break;
    const template = extractBalancedBraces(wikitext, start);
    if (!template) {
      // Unbalanced braces (a stray editor typo, as this pipeline's design
      // doc found live in the wild) -- skip past this occurrence rather
      // than aborting the whole page.
      searchFrom = start + marker.length;
      continue;
    }
    searchFrom = template.endIndex;
    const { params } = splitTemplateCall(template.raw);
    if (params.length === 0) continue;
    rows.push(buildRow(params, templateSuffix === 'entry'));
  }
  return rows;
}

// --- Set infobox extraction -------------------------------------------------

function firstDefined(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

// Most set articles use {{TCGExpansionInfobox}}; small in-between
// enhancement packs (the zh-cn "CS-series" pattern documented in the
// harvester's zh-cn recon notes) use {{TCGPromoInfobox}} instead, with a
// slightly different field set (e.g. "date" rather than "release"). Both
// share the same key=value-per-parameter shape, so one extraction routine
// covers both -- whichever marker actually appears in the wikitext wins.
const INFOBOX_MARKERS = ['{{TCGExpansionInfobox', '{{TCGPromoInfobox'] as const;

/** Parses a set article's infobox (`{{TCGExpansionInfobox|...}}` or `{{TCGPromoInfobox|...}}`) key=value block into structured fields, keeping every raw field for anything this type doesn't model yet. */
function parseSetInfobox(wikitext: string): SetInfobox {
  const raw: Record<string, string> = {};
  let marker: string | null = null;
  let start = -1;
  for (const candidate of INFOBOX_MARKERS) {
    const idx = wikitext.indexOf(candidate);
    if (idx !== -1 && (start === -1 || idx < start)) {
      start = idx;
      marker = candidate;
    }
  }
  if (start !== -1 && marker) {
    const template = extractBalancedBraces(wikitext, start);
    if (template) {
      const inner = template.raw.slice(2, -2);
      const afterName = inner.slice(marker.length - 2); // strip the infobox template name
      const fieldStart = afterName.startsWith('|') ? afterName.slice(1) : afterName;
      for (const part of splitTopLevelPipes(fieldStart)) {
        const eqIndex = part.indexOf('=');
        if (eqIndex === -1) continue;
        const key = part.slice(0, eqIndex).trim();
        const value = part.slice(eqIndex + 1).trim();
        if (key) raw[key] = value;
      }
    }
  }

  const cardCountRaw = firstDefined(raw.encards, raw.cards);
  return {
    raw,
    cardCount: cardCountRaw && /^\d+$/.test(cardCountRaw) ? Number(cardCountRaw) : null,
    setNumber: firstDefined(raw.ensetnum, raw.setnum),
    releaseDate: firstDefined(raw.enrelease, raw.release, raw.date),
    japaneseName: firstDefined(raw.jasetname),
    japaneseSetNumber: firstDefined(raw.jasetnum),
    japaneseReleaseDate: firstDefined(raw.jarelease),
    previousSet: firstDefined(raw.prevset),
    nextSet: firstDefined(raw.nextset),
  };
}

// A zh-cn "CS-series" set code (e.g. "CS35", "CS5a"), as embedded verbatim
// in an infobox's own image/logo filename field (see the harvester's zh-cn
// recon notes) -- case-sensitive so it only matches the wiki's own code
// styling, not incidental lowercase "cs" substrings elsewhere.
const CS_CODE_PATTERN = /CS\d+[a-zA-Z]?/;

/**
 * Extracts a zh-cn CS-series set code from an infobox's raw field values,
 * when one is present. This is the live, authoritative signal for a
 * CS-series set's real code -- callers harvesting the zh-cn namespace
 * should prefer it over any hand-curated mapping guess when the two
 * disagree.
 */
export function extractCsCode(setInfo: Pick<SetInfobox, 'raw'>): string | null {
  for (const value of Object.values(setInfo.raw)) {
    const match = value.match(CS_CODE_PATTERN);
    if (match) return match[0];
  }
  return null;
}

// --- Public API --------------------------------------------------------------

/** Parses a set article's full wikitext into its infobox metadata plus main/additional card-list rows. */
export function parseSetPageWikitext(wikitext: string): ParsedSetPage {
  return {
    setInfo: parseSetInfobox(wikitext),
    cardListRows: extractSetlistRows(wikitext, 'entry'),
    additionalCardRows: extractSetlistRows(wikitext, 'nmentry'),
  };
}

/** Strips the `(TCG)`/`(ATCG)` disambiguation suffix a set article title always carries, e.g. `"Surging Sparks (TCG)"` -> `"Surging Sparks"`. */
export function deriveSetNameFromArticleTitle(articleTitle: string): string {
  return articleTitle.replace(/\s*\((?:A?TCG)\)\s*$/, '').trim();
}
