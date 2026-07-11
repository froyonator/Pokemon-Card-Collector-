import * as cheerio from 'cheerio';

export interface ArtOfPkmSetLink {
  setId: string;
  name: string;
  url: string;
}

export interface ArtOfPkmCardLink {
  sourceCardId: string;
  name: string;
  url: string;
}

export interface ArtOfPkmRecord {
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
// aren't worth scraping.
export function isPokemonCard(record: ArtOfPkmRecord): boolean {
  return record.pokedexNumbers.length > 0;
}

export function parseArtOfPkmSetList(html: string): ArtOfPkmSetLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, ArtOfPkmSetLink>();
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

export function parseArtOfPkmSetPage(html: string, setId: string): ArtOfPkmCardLink[] {
  const $ = cheerio.load(html);
  return $('#cards-container a[data-lightbox-url]')
    .map((_, element) => {
      const relativeUrl = $(element).attr('data-lightbox-url') ?? '';
      const match = relativeUrl.match(new RegExp(`^/sets/${setId}/card/(\\d+)$`));
      if (!match) return null;
      const title = $(element).attr('data-lightbox-title') ?? '';
      return {
        sourceCardId: match[1],
        name: title.split(',')[0].trim(),
        url: `${BASE}${relativeUrl}`,
      };
    })
    .get()
    .filter((entry): entry is ArtOfPkmCardLink => entry !== null);
}

export function parseArtOfPkmDetail(html: string, sourceUrl: string): ArtOfPkmRecord {
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
