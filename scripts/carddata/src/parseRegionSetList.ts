import * as cheerio from 'cheerio';

export interface RegionSetLink {
  setId: string;
  setSlug: string;
}

const SET_PATH_PATTERN = /^\/sets\/(\d+)\/([a-z0-9-]+)\/?$/;

/**
 * Extracts canonical set identifiers from a rendered TCG Collector region
 * set-list page. This intentionally depends only on the public URL shape,
 * not on presentation classes or surrounding page structure.
 */
export function parseRegionSetList(html: string): RegionSetLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, RegionSetLink>();

  $('[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, 'https://www.tcgcollector.com');
    } catch {
      return;
    }

    if (url.hostname !== 'www.tcgcollector.com') return;

    const match = url.pathname.match(SET_PATH_PATTERN);
    if (!match) return;

    const [, setId, setSlug] = match;
    if (!seen.has(setId)) {
      seen.set(setId, { setId, setSlug });
    }
  });

  return Array.from(seen.values());
}
