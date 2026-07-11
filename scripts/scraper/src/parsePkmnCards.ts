import * as cheerio from 'cheerio';

export interface PkmnCardsSetLink {
  setSlug: string;
  name: string;
  code: string | null;
  url: string;
}

export interface PkmnCardsCardLink {
  cardSlug: string;
  url: string;
}

export interface PkmnCardsRecord {
  sourceCardSlug: string;
  name: string;
  supertype: string;
  hp: number | null;
  energyTypes: string[];
  stage: string | null;
  pokemon: string[];
  attacks: Array<{ name: string; damage: string; description: string; cost: string[] }>;
  weakness: { type: string; multiplier: string } | null;
  resistance: { type: string; multiplier: string } | null;
  retreatCost: number;
  expansionName: string;
  expansionCode: string;
  cardNumber: string;
  printedTotal: string | null;
  rarity: string | null;
  illustrators: string[];
  releaseDate: string | null;
  imageUrl: string;
}

function absolutePkmnCardsUrl(value: string): string {
  return new URL(value, 'https://pkmncards.com').toString();
}

export function isPokemonCard(record: PkmnCardsRecord): boolean {
  return record.supertype === 'Pokémon';
}

export function parsePkmnCardsSetList(html: string): PkmnCardsSetLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, PkmnCardsSetLink>();
  $('a[href*="/set/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const url = new URL(href, 'https://pkmncards.com');
    if (url.hostname !== 'pkmncards.com') return;
    const match = url.pathname.match(/^\/set\/([a-z0-9-]+)\/$/);
    if (!match || seen.has(match[1])) return;
    const text = $(element).text().trim();
    const codeMatch = text.match(/\s+\(([^()]+)\)$/);
    seen.set(match[1], {
      setSlug: match[1],
      name: codeMatch ? text.slice(0, codeMatch.index).trim() : text,
      code: codeMatch?.[1] ?? null,
      url: url.toString(),
    });
  });
  return [...seen.values()];
}

export function parsePkmnCardsSetPage(html: string): PkmnCardsCardLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, PkmnCardsCardLink>();
  $('a[href*="/card/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const url = new URL(href, 'https://pkmncards.com');
    if (url.hostname !== 'pkmncards.com') return;
    const match = url.pathname.match(/^\/card\/([a-z0-9-]+)\/$/);
    if (match && !seen.has(match[1])) {
      seen.set(match[1], { cardSlug: match[1], url: url.toString() });
    }
  });
  return [...seen.values()];
}

function typeAmount(
  $: cheerio.CheerioAPI,
  selector: string
): { type: string; multiplier: string } | null {
  const entry = $(selector).first();
  const type = entry.find('abbr.ptcg-symbol-name').attr('title');
  if (!type) return null;
  const multiplier = entry.find('[title$="Modifier"]').text().trim();
  return { type, multiplier };
}

export function parsePkmnCardsDetail(html: string, sourceUrl: string): PkmnCardsRecord {
  const $ = cheerio.load(html);
  const sourceCardSlug = new URL(sourceUrl).pathname.match(/^\/card\/([a-z0-9-]+)\/$/)?.[1] ?? '';
  const hpText = $('.name-hp-color .hp').first().text();
  const hpMatch = hpText.match(/\d+/);

  const attacks = $('.tab.text > .text > p')
    .map((_, element) => {
      const attack = $(element);
      const name = attack.children('span').not('.vh').first().text().trim();
      const cost = attack
        .children('abbr.ptcg-symbol-name')
        .map((_index, symbol) => $(symbol).attr('title') ?? '')
        .get()
        .filter(Boolean);
      const [firstLineHtml, ...descriptionHtml] = (attack.html() ?? '').split(/<br\s*\/?>/i);
      const firstLine = cheerio.load(firstLineHtml).text().replace(/\s+/g, ' ').trim();
      const afterName = name ? firstLine.slice(firstLine.indexOf(name) + name.length) : firstLine;
      const damage = afterName.match(/^\s*:\s*([^ ]+)/)?.[1] ?? '';
      const description = descriptionHtml.length
        ? cheerio.load(descriptionHtml.join(' ')).text().replace(/\s+/g, ' ').trim()
        : '';
      return { name, damage, description, cost };
    })
    .get();

  const releaseMeta = $('.release-meta').first();
  const imageUrl =
    $('.card-image-link').first().attr('href') || $('.card-image').first().attr('src') || '';
  const retreat = $('.weak-resist-retreat .retreat abbr').first();
  const retreatVisible = Number(retreat.text().match(/\d+/)?.[0] ?? Number.NaN);
  const retreatSymbols = (retreat.attr('title')?.match(/\{C\}/g) ?? []).length;

  return {
    sourceCardSlug,
    name: $('.name-hp-color .name').first().text().trim(),
    supertype: $('.type-evolves-is .type').first().text().trim(),
    hp: hpMatch ? Number(hpMatch[0]) : null,
    energyTypes: $('.name-hp-color .color abbr[title]')
      .map((_, element) => $(element).attr('title') ?? '')
      .get()
      .filter(Boolean),
    stage: $('.type-evolves-is .stage').first().text().trim() || null,
    pokemon: $('.type-evolves-is .pokemon')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean),
    attacks,
    weakness: typeAmount($, '.weak-resist-retreat .weak'),
    resistance: typeAmount($, '.weak-resist-retreat .resist'),
    retreatCost: Number.isFinite(retreatVisible) ? retreatVisible : retreatSymbols,
    expansionName: releaseMeta.find('[title="Set"] a').first().text().trim(),
    expansionCode: releaseMeta.find('[title="Set Abbreviation"]').first().text().trim(),
    cardNumber: releaseMeta.find('.number a[title="Number"]').first().text().trim(),
    printedTotal:
      releaseMeta.find('.out-of[title="Out Of"]').first().text().trim().replace(/^\//, '') || null,
    rarity:
      releaseMeta.find('.rarity abbr').first().attr('title') ||
      releaseMeta.find('.rarity').first().text().trim() ||
      null,
    illustrators: $('.illus a[title="Illustrator"]')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean),
    releaseDate: releaseMeta.find('.date').first().text().replace(/^↘\s*/, '').trim() || null,
    imageUrl: imageUrl ? absolutePkmnCardsUrl(imageUrl) : '',
  };
}
