// scripts/carddata/src/parseCardDetail.ts
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export interface CardAttack {
  name: string;
  damage: string;
  description: string;
  cost: string[];
}

export interface CardTypeAmount {
  type: string;
  multiplier: string;
}

export interface CardRecord {
  cardId: string;
  name: string;
  supertype: string; // "Pokémon" | "Trainer" | "Energy"
  hp: number | null;
  energyTypes: string[];
  stage: string | null;
  attacks: CardAttack[];
  weakness: CardTypeAmount | null;
  resistance: CardTypeAmount | null;
  retreatCost: number;
  expansionName: string;
  expansionCode: string;
  expansionId: string | null;
  cardNumber: string;
  rarity: string | null;
  illustrators: string[];
  pokedexNumber: number | null;
  imageUrl: string;
}

// Picks the highest-resolution candidate out of an <img>'s srcset (a
// space-separated "url widthw, url widthw, ..." list) rather than its
// plain `src`, which tcgcollector serves at a smaller default size intended
// for the page's own inline display, not for archival.
function highestResolutionSrc($img: cheerio.Cheerio<AnyNode>): string {
  const srcset = $img.attr('srcset');
  const src = $img.attr('src') ?? '';
  if (!srcset) return src;
  const candidates = srcset.split(',').map((entry) => {
    const [url, width] = entry.trim().split(/\s+/);
    return { url, width: parseInt(width, 10) || 0 };
  });
  candidates.sort((a, b) => b.width - a.width);
  return candidates[0]?.url ?? src;
}

function footerItemText($: cheerio.CheerioAPI, title: string): cheerio.Cheerio<AnyNode> | null {
  const item = $('.card-info-footer-item')
    .filter((_, el) => $(el).find('.card-info-footer-item-title').text().trim() === title)
    .first();
  return item.length ? item : null;
}

export function parseCardDetail(html: string, context: { cardId: string }): CardRecord {
  const $ = cheerio.load(html);

  const name = $('#card-info-title a').text().trim();
  const supertype = $('.card-type-container').first().text().trim();
  const hpText = $('#card-hit-points-value').text().trim();
  const hp = hpText ? parseInt(hpText, 10) : null;
  const energyTypes = $('#card-hit-points-energy-types .energy-type-symbol')
    .map((_, el) => $(el).attr('alt') ?? '')
    .get()
    .filter(Boolean);
  const stageText = $('#card-evolution-status a').first().text().trim();
  const stage = stageText || null;
  const imageUrl = highestResolutionSrc($('#card-image-container img').first());

  const attacks: CardAttack[] = $('.card-attack')
    .map((_, el) => {
      const $attack = $(el);
      const cost = $attack
        .find('.card-attack-energies .energy-type-symbol')
        .map((_i, img) => $(img).attr('alt') ?? '')
        .get()
        .filter(Boolean);
      return {
        name: $attack.find('.card-attack-name').text().trim(),
        damage: $attack.find('.card-attack-damage').text().trim(),
        description: $attack.find('.card-attack-description').text().trim(),
        cost,
      };
    })
    .get();

  function parseTypeAmount(title: string): CardTypeAmount | null {
    const item = footerItemText($, title);
    if (!item) return null;
    const type = item.find('.energy-type-symbol').first().attr('alt');
    const multiplier = item.find('.card-info-footer-item-entry-text').first().text().trim();
    if (!type) return null; // "—" (none) renders with no energy-type-symbol at all
    return { type, multiplier };
  }

  const weakness = parseTypeAmount('Weakness');
  const resistance = parseTypeAmount('Resistance');
  const retreatCost = footerItemText($, 'Retreat Cost')?.find('.card-info-footer-item-entry').length ?? 0;

  const expansionItem = footerItemText($, 'Expansion');
  const expansionName = expansionItem?.find('#card-info-footer-item-text-expansion-name').text().trim() ?? '';
  const expansionCode = expansionItem?.find('#card-info-footer-item-text-expansion-code').text().trim() ?? '';
  const expansionHref = expansionItem?.find('a[href^="/sets/"]').attr('href') ?? '';
  const expansionIdMatch = expansionHref.match(/^\/sets\/(\d+)\//);
  const expansionId = expansionIdMatch ? expansionIdMatch[1] : null;

  const cardNumber = footerItemText($, 'Card number')?.find('.card-info-footer-item-text').text().trim() ?? '';

  const rarityItem = footerItemText($, 'Rarity');
  const rarity = rarityItem?.find('.card-info-footer-item-text').first().text().trim() || null;

  const illustrators = (footerItemText($, 'Illustrators')?.find('.card-info-footer-item-text a') ?? $())
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const pokedexHref = footerItemText($, 'Pokédex')?.find('a[href^="/pokedex/"]').attr('href') ?? '';
  const pokedexMatch = pokedexHref.match(/^\/pokedex\/(\d+)\//);
  const pokedexNumber = pokedexMatch ? parseInt(pokedexMatch[1], 10) : null;

  return {
    cardId: context.cardId,
    name,
    supertype,
    hp,
    energyTypes,
    stage,
    attacks,
    weakness,
    resistance,
    retreatCost,
    expansionName,
    expansionCode: expansionCode.trim(),
    expansionId,
    cardNumber,
    rarity,
    illustrators,
    pokedexNumber,
    imageUrl,
  };
}
