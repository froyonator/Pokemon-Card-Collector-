// scripts/carddata/src/harvest/setlistParser.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveSetNameFromArticleTitle, parseSetPageWikitext } from './setlistParser';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/harvest/${name}`, import.meta.url)), 'utf-8');
}

const surgingSparksCardList = fixture('surging-sparks-card-list.wikitext');
const battlePartnersSetList = fixture('battle-partners-set-list.wikitext');
const bondsOfDestinyCardList = fixture('bonds-of-destiny-card-list.wikitext');
const surgingSparksInfobox = fixture('surging-sparks-infobox.wikitext');
const battlePartnersInfobox = fixture('battle-partners-infobox.wikitext');

describe('parseSetPageWikitext - card list rows', () => {
  it('parses a normal {{TCG ID}} macro row deterministically, without resolving any link', () => {
    const { cardListRows } = parseSetPageWikitext(surgingSparksCardList);
    const exeggcute = cardListRows.find((row) => row.cardNumber === '001/191');
    expect(exeggcute).toEqual({
      cardNumber: '001/191',
      regulationMark: 'H',
      displayName: 'Exeggcute',
      cardArticleTitle: 'Exeggcute (Surging Sparks 1)',
      primaryType: 'Grass',
      secondaryField: null,
      rarity: 'Common',
      promoNote: null,
      nameSource: 'tcgIdMacro',
    });
  });

  it('takes the literal wikilink target for the ex/GX-style suffix branch, not a reconstructed title', () => {
    const { cardListRows } = parseSetPageWikitext(surgingSparksCardList);
    const pikachu57 = cardListRows.find((row) => row.cardNumber === '057/191');
    expect(pikachu57).toMatchObject({
      displayName: 'Pikachu',
      cardArticleTitle: 'Pikachu ex (Surging Sparks 57)',
      nameSource: 'wikilink',
      rarity: 'Double Rare',
    });

    // Same display name, different card number/rarity/article title -- the
    // hyper-rare reprint whose numerator exceeds the set's stated total.
    const pikachu247 = cardListRows.find((row) => row.cardNumber === '247/191');
    expect(pikachu247).toMatchObject({
      displayName: 'Pikachu',
      cardArticleTitle: 'Pikachu ex (Surging Sparks 247)',
      nameSource: 'wikilink',
      rarity: 'Hyper Rare',
    });
  });

  it('extracts the secondary field for an Energy card alongside its rarity', () => {
    const { cardListRows } = parseSetPageWikitext(surgingSparksCardList);
    const energy = cardListRows.find((row) => row.cardNumber === '191/191');
    expect(energy).toMatchObject({
      cardArticleTitle: 'Enriching Energy (Surging Sparks 191)',
      primaryType: 'Energy',
      secondaryField: 'Colorless',
      rarity: 'ACE SPEC Rare',
    });
  });

  it('extracts every row from a full set list, in order', () => {
    const { cardListRows } = parseSetPageWikitext(surgingSparksCardList);
    expect(cardListRows).toHaveLength(4);
    expect(cardListRows.map((row) => row.cardNumber)).toEqual([
      '001/191',
      '057/191',
      '191/191',
      '247/191',
    ]);
  });

  it('parses a Japanese set list, with single-letter rarity codes and a regulation mark other than H', () => {
    const { cardListRows } = parseSetPageWikitext(battlePartnersSetList);
    expect(cardListRows).toHaveLength(3);

    const caterpie = cardListRows.find((row) => row.cardNumber === '001/100');
    expect(caterpie).toMatchObject({
      regulationMark: 'I',
      cardArticleTitle: 'Caterpie (Battle Partners 1)',
      rarity: 'C',
      nameSource: 'tcgIdMacro',
    });

    const volcanion = cardListRows.find((row) => row.cardNumber === '017/100');
    expect(volcanion).toMatchObject({
      displayName: 'Volcanion',
      cardArticleTitle: 'Volcanion ex (Battle Partners 17)',
      rarity: 'RR',
      nameSource: 'wikilink',
    });

    const energy = cardListRows.find((row) => row.cardNumber === '132/100');
    expect(energy).toMatchObject({
      cardArticleTitle: 'Spiky Energy (Battle Partners 132)',
      rarity: 'UR',
    });
  });

  it('resolves a {{TCG ID}} macro with a 4th display-override param while still deriving the title from its own name param', () => {
    const { cardListRows } = parseSetPageWikitext(bondsOfDestinyCardList);
    const yanmega = cardListRows.find((row) => row.cardNumber === '007/139');
    expect(yanmega).toMatchObject({
      displayName: 'Yanmega',
      cardArticleTitle: 'Yanmega ex (Bonds of Destiny 7)',
      nameSource: 'tcgIdMacro',
      rarity: 'RR',
    });
  });

  it('skips a row with unbalanced braces (a missing closing }}) without losing the well-formed row after it', () => {
    // The first row's closing `}}` is missing entirely, so its brace depth
    // never returns to zero -- it can only be detected as malformed by
    // scanning to the end of the wikitext, at which point the second row's
    // own closing `}}` is consumed as part of the (still unbalanced)
    // first attempt. The row still parses out correctly on retry from the
    // next marker occurrence.
    const malformed = [
      '{{Setlist/entry|001/10|H|{{TCG ID|Test Set|Broken Card|1}}|Grass||Common',
      '{{Setlist/entry|002/10|H|{{TCG ID|Test Set|Fine Card|2}}|Grass||Common}}',
    ].join('\n');
    const { cardListRows } = parseSetPageWikitext(malformed);
    expect(cardListRows).toHaveLength(1);
    expect(cardListRows[0]).toMatchObject({
      cardNumber: '002/10',
      cardArticleTitle: 'Fine Card (Test Set 2)',
    });
  });
});

describe('parseSetPageWikitext - set infobox', () => {
  it('maps English-article infobox fields', () => {
    const { setInfo } = parseSetPageWikitext(surgingSparksInfobox);
    expect(setInfo.cardCount).toBe(191);
    expect(setInfo.setNumber).toBe('13');
    expect(setInfo.releaseDate).toBe('November 8, 2024');
    expect(setInfo.previousSet).toBe('Stellar Crown');
    expect(setInfo.nextSet).toBe('Journey Together');
    expect(setInfo.japaneseName).toBeNull();
  });

  it('maps Japanese-article infobox fields, including a multi-region release line', () => {
    const { setInfo } = parseSetPageWikitext(battlePartnersInfobox);
    expect(setInfo.cardCount).toBe(132);
    expect(setInfo.setNumber).toBe('96');
    expect(setInfo.japaneseName).toBe('バトルパートナーズ');
    expect(setInfo.releaseDate).toBe('Japan: January 24, 2025<br>Korea: March 21, 2025');
    expect(setInfo.previousSet).toBeNull();
  });
});

describe('deriveSetNameFromArticleTitle', () => {
  it('strips the (TCG) and (ATCG) disambiguation suffix', () => {
    expect(deriveSetNameFromArticleTitle('Surging Sparks (TCG)')).toBe('Surging Sparks');
    expect(deriveSetNameFromArticleTitle('Bonds of Destiny (ATCG)')).toBe('Bonds of Destiny');
  });
});
