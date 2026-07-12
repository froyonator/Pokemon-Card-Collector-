import * as cheerio from 'cheerio';

export interface JapaneseFallbackSetLink {
  setId: string;
  name: string;
  url: string;
}

export interface JapaneseFallbackCardLink {
  sourceCardId: string;
  name: string;
  url: string;
}

export interface JapaneseFallbackRecord {
  sourceCardId: string;
  name: string;
  japaneseName: string | null;
  expansionId: string;
  expansionName: string;
  japaneseExpansionName: string | null;
  cardNumber: string;
  illustrators: string[];
  pokedexNumbers: number[];
  imageUrl: string;
}

const BASE = 'https://www.artofpkm.com';

// The app organizes everything by Pokedex number, so Trainer/Item cards
// (which link to no `/pokemon/{id}` page) have nothing to attach to and
// aren't worth harvesting.
export function isPokemonCard(record: JapaneseFallbackRecord): boolean {
  return record.pokedexNumbers.length > 0;
}

export function parseJapaneseFallbackSetList(html: string): JapaneseFallbackSetLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, JapaneseFallbackSetLink>();
  $('a.set[href^="/sets/"]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const match = href.match(/^\/sets\/(\d+)$/);
    if (match && !seen.has(match[1])) {
      seen.set(match[1], {
        setId: match[1],
        name: $(element).text().trim(),
        url: `${BASE}${href}`,
      });
    }
  });
  return [...seen.values()];
}

export function parseJapaneseFallbackSetPage(html: string, setId: string): JapaneseFallbackCardLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, JapaneseFallbackCardLink>();
  $('#cards-container a[data-lightbox-url]').each((_, element) => {
    const relativeUrl = $(element).attr('data-lightbox-url') ?? '';
    const match = relativeUrl.match(new RegExp(`^/sets/${setId}/card/(\\d+)$`));
    if (!match || seen.has(match[1])) return;
    const title = $(element).attr('data-lightbox-title') ?? '';
    seen.set(match[1], {
      sourceCardId: match[1],
      name: title.split(',')[0].trim(),
      url: `${BASE}${relativeUrl}`,
    });
  });
  // A multi-product "bundle" set page (e.g. a starter set combining several
  // decks) can reuse the identical /sets/{setId}/card/{n} lightbox URL for
  // more than one genuinely different card -- confirmed live on set 458
  // ("Starter Set VSTAR, Lucario"), where card/3 pointed at Scyther,
  // Meditite, AND Lucario V, distinguished only by a client-side lightbox
  // modal, not a real distinct URL. Fetching that one URL always returns
  // the same detail page regardless of which thumbnail linked to it, so
  // keeping every occurrence just meant re-fetching the identical page and
  // failing to write the same card directory a second/third time (EEXIST).
  // The other cards sharing an id aren't reachable through this site's
  // public URL scheme at all -- deduping (first occurrence wins, matching
  // parseJapaneseFallbackSetList's own dedup) stops the wasted duplicate-fetch/
  // error noise; it can't recover them.
  return [...seen.values()];
}

export function parseJapaneseFallbackDetail(html: string, sourceUrl: string): JapaneseFallbackRecord {
  const $ = cheerio.load(html);
  const pathMatch = new URL(sourceUrl).pathname.match(/^\/sets\/(\d+)\/card\/(\d+)$/);
  const mainImage = $('main img[data-card-image-loader-target="image"]').first();
  const setLink = $('main a[href^="/sets/"]').first();
  const setNames = setLink.find('div');
  // Anchored on this row's own structural class rather than the `h1` inside
  // it: Trainer/Item cards with no official English name (e.g. Japanese-only
  // flavor items) render this same row with just the `h3.ja` and no `h1` at
  // all, which would otherwise leave cardNumber/japaneseName unresolvable
  // too since they were derived by walking outward from `h1`.
  const nameRow = $('main .flex.flex-wrap.gap-x-2.items-baseline').first();

  return {
    sourceCardId: pathMatch?.[2] ?? '',
    name: nameRow.find('h1').first().text().trim(),
    japaneseName: nameRow.find('h3.ja').first().text().trim() || null,
    expansionId: pathMatch?.[1] ?? '',
    expansionName:
      setLink.find('.font-bold').first().text().trim() || setNames.not('.ja').first().text().trim(),
    japaneseExpansionName: setNames.filter('.ja').first().text().trim() || null,
    cardNumber: nameRow.prev().text().trim(),
    illustrators: $('main a[href^="/illustrators/"]')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean),
    pokedexNumbers: $('main a[href^="/pokemon/"]')
      .map((_, element) =>
        Number(
          $(element)
            .attr('href')
            ?.match(/\/pokemon\/(\d+)/)?.[1]
        )
      )
      .get()
      .filter((value) => Number.isInteger(value)),
    imageUrl: new URL(mainImage.attr('src') ?? '', BASE).toString(),
  };
}
