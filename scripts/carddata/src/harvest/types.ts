// scripts/carddata/src/harvest/types.ts
//
// Shared shapes for the reference-wiki harvester. This module has no
// runtime logic; it exists so wikiApiClient.ts, setlistParser.ts, and
// cardImageResolver.ts can agree on data shapes without importing each
// other's internals.

/** A page's wikitext (template source), as returned by action=parse. */
export interface WikiPageWikitext {
  title: string;
  pageId: number | null;
  wikitext: string;
}

/** One resolved File: title, via action=query&prop=imageinfo. */
export interface WikiImageInfo {
  fileTitle: string;
  url: string | null;
  thumbUrl?: string;
  width?: number;
  height?: number;
  mime?: string;
  sha1?: string;
  /**
   * True when the query returned no `imageinfo` for this title at all --
   * i.e. no resolvable file, on the local wiki OR its shared media
   * repository. NOT the same as the response's own `missing` flag: a file
   * that lives only on the shared repository (true of every real card
   * scan) reports `missing: true` on its local wiki page while still
   * carrying a fully populated `imageinfo`, so that flag alone isn't a
   * reliable "does this file exist" signal.
   */
  missing: boolean;
}

/** One hit from action=query&list=search. */
export interface WikiSearchResult {
  title: string;
  snippet?: string;
}

/**
 * How a setlist row's card article title was derived: either computed
 * deterministically from a `{{TCG ID|...}}` macro call, taken verbatim from
 * a literal wikilink target (the branch used for ex/GX/V/-style suffixed
 * names), or -- rarely -- read as plain unlinked text with no article to
 * resolve against.
 */
export type SetlistRowNameSource = 'tcgIdMacro' | 'wikilink' | 'literal';

/** One row of a set's card list (or "Additional Cards" promo table). */
export interface SetlistRow {
  /** Raw numerator/denominator as printed, e.g. "057/191". Numerator can exceed the denominator for secret/hyper rares. */
  cardNumber: string;
  /** Single-letter regulation mark icon code (e.g. "H", "I"), when present. */
  regulationMark: string | null;
  /** The name as it displays on the card list row (may omit a suffix that IS present in cardArticleTitle). */
  displayName: string;
  /** The card's own wiki article title, safe to use for a follow-up page fetch. */
  cardArticleTitle: string;
  /** Primary type/category cell (Grass...Colorless, or Item/Supporter/Stadium/Trainer/Pokemon Tool/Energy). */
  primaryType: string | null;
  /** Secondary cell: dual-energy-cost display, or an Energy card's own basic type. */
  secondaryField: string | null;
  /** Rarity, either an English name ("Double Rare") or a short code ("RR"), null on the no-rarity "Additional Cards" table. */
  rarity: string | null;
  /** Promo/note text, only populated on "Additional Cards" rows. */
  promoNote: string | null;
  nameSource: SetlistRowNameSource;
  /**
   * A promo-style set's number cell can carry a leading set-symbol wikilink
   * (`[[Image:...|link=Origin Set (TCG)]]`) marking the row as a reprint
   * that visually belongs to that origin set rather than to the set it's
   * listed in. This is that origin set's plain name (its `(TCG)`/`(ATCG)`
   * suffix stripped), when the cell carried one and its `link=` target
   * named a set article; null on an ordinary row.
   */
  originSetName: string | null;
}

/** Structured fields lifted from a set article's `{{TCGExpansionInfobox}}` call. */
export interface SetInfobox {
  /** Every key=value pair found in the infobox call, unparsed, for fields this type doesn't model yet. */
  raw: Record<string, string>;
  /** English card count ("encards") or, on a Japanese/regional article, "cards". */
  cardCount: number | null;
  /** English numeric release-order id ("ensetnum") or, on a Japanese/regional article, "setnum". */
  setNumber: string | null;
  /** English release date ("enrelease") or, on a Japanese/regional article, "release" (which can list multiple region dates on one line). */
  releaseDate: string | null;
  /** Japanese set name ("jasetname"), present on Japanese-article infoboxes. */
  japaneseName: string | null;
  /** Japanese numeric release-order id ("jasetnum"), present on an English article when a JA counterpart set exists. */
  japaneseSetNumber: string | null;
  /** Japanese release date ("jarelease"), present on an English article when a JA counterpart set exists. */
  japaneseReleaseDate: string | null;
  /** Previous set in the same release sequence ("prevset"). */
  previousSet: string | null;
  /** Next set in the same release sequence ("nextset"). */
  nextSet: string | null;
}

/** The full structured result of parsing one set article's wikitext. */
export interface ParsedSetPage {
  setInfo: SetInfobox;
  /** Rows from the set's main `==Card list==`/`==Set list==` table. */
  cardListRows: SetlistRow[];
  /** Rows from the optional "Additional Cards" promo-reprint table, when present. */
  additionalCardRows: SetlistRow[];
}
