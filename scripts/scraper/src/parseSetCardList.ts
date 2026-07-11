// scripts/scraper/src/parseSetCardList.ts
import * as cheerio from 'cheerio';

export interface SetCardLink {
  cardId: string;
  cardSlug: string;
}

// A set's card-list page (fetched with ?displayAs=list) renders every card
// in the set as one <a href="/cards/{id}/{slug}"> link, unpaginated -- this
// is what makes a single page load enough to enumerate an entire set,
// confirmed live against set 11921 ("Shadowy Threats") during design
// research, where this pattern matched the set's own reported card count
// exactly.
export function parseSetCardList(html: string): SetCardLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, SetCardLink>();

  $('a[href^="/cards/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const match = href.match(/^\/cards\/(\d+)\/([a-z0-9-]+)/);
    if (!match) return;
    const [, cardId, cardSlug] = match;
    if (!seen.has(cardId)) {
      seen.set(cardId, { cardId, cardSlug });
    }
  });

  return Array.from(seen.values());
}
