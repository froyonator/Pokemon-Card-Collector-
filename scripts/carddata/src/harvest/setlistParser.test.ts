// scripts/carddata/src/harvest/setlistParser.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deriveSetNameFromArticleTitle,
  extractCsCode,
  extractWikitextSection,
  parseSetPageWikitext,
} from './setlistParser';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/harvest/${name}`, import.meta.url)), 'utf-8');
}

const surgingSparksCardList = fixture('surging-sparks-card-list.wikitext');
const battlePartnersSetList = fixture('battle-partners-set-list.wikitext');
const bondsOfDestinyCardList = fixture('bonds-of-destiny-card-list.wikitext');
const surgingSparksInfobox = fixture('surging-sparks-infobox.wikitext');
const battlePartnersInfobox = fixture('battle-partners-infobox.wikitext');
const trickOrTrade2022CardList = fixture('trick-or-trade-2022-card-list.wikitext');
const zhCnGallantGalaxyInfobox = fixture('zh-cn-gallant-galaxy-infobox.wikitext');
const zhCnGallantGalaxySetList = fixture('zh-cn-gallant-galaxy-set-list.wikitext');
const zhCnScorchingSkiesInfobox = fixture('zh-cn-scorching-skies-infobox.wikitext');

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
      originSetName: null,
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

describe('parseSetPageWikitext - reprint rows (origin-set symbol in the number cell)', () => {
  it('strips a leading [[Image:...|link=...]] origin-set symbol from the number cell and records the origin set name', () => {
    const { cardListRows } = parseSetPageWikitext(trickOrTrade2022CardList);
    const cubone = cardListRows.find((row) => row.displayName === 'Cubone');
    expect(cubone).toMatchObject({
      cardNumber: '069/163',
      cardArticleTitle: 'Cubone (Battle Styles 69)',
      originSetName: 'Battle Styles',
    });
  });

  it('handles the [[File:...]] variant of the origin-set symbol the same way', () => {
    const { cardListRows } = parseSetPageWikitext(trickOrTrade2022CardList);
    const gastly = cardListRows.find((row) => row.displayName === 'Gastly');
    expect(gastly).toMatchObject({
      cardNumber: '055/198',
      cardArticleTitle: 'Gastly (Chilling Reign 55)',
      originSetName: 'Chilling Reign',
    });
  });

  it('leaves an ordinary row (no origin-set symbol) with a null originSetName and an unchanged number', () => {
    const { cardListRows } = parseSetPageWikitext(trickOrTrade2022CardList);
    const trainer = cardListRows.find((row) => row.cardNumber === '012/030');
    expect(trainer).toMatchObject({
      cardArticleTitle: 'Some Trainer (Trick or Trade 2022 12)',
      originSetName: null,
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

describe('parseSetPageWikitext - zh-cn (ATCG) namespace', () => {
  it('parses a {{TCGExpansionInfobox}} zh-cn article the same as any other region', () => {
    const { setInfo } = parseSetPageWikitext(zhCnGallantGalaxyInfobox);
    expect(setInfo.cardCount).toBe(354);
    expect(setInfo.setNumber).toBe('7');
    expect(setInfo.releaseDate).toBe('June 18, 2024');
  });

  it('parses a {{TCGPromoInfobox}} enhancement-pack article, falling back to "date" for releaseDate', () => {
    const { setInfo } = parseSetPageWikitext(zhCnScorchingSkiesInfobox);
    expect(setInfo.cardCount).toBe(90);
    expect(setInfo.releaseDate).toBe('January 5, 2024');
    expect(setInfo.setNumber).toBeNull();
  });

  it('extracts the Gen1 and non-Gen1 rows and the Energy row from a zh-cn set list, English names intact', () => {
    const { cardListRows } = parseSetPageWikitext(zhCnGallantGalaxySetList);
    expect(cardListRows).toHaveLength(4);

    const charmander = cardListRows.find((row) => row.cardNumber === '001/127');
    expect(charmander).toMatchObject({
      regulationMark: 'F',
      cardArticleTitle: 'Charmander (Gallant Galaxy Charm 1)',
      rarity: 'C',
      nameSource: 'tcgIdMacro',
    });

    const miraidon = cardListRows.find((row) => row.cardNumber === '095/127');
    expect(miraidon).toMatchObject({
      displayName: 'Miraidon',
      cardArticleTitle: 'Miraidon ex (Gallant Galaxy Charm 95)',
      rarity: 'RR',
      nameSource: 'wikilink',
    });

    const energy = cardListRows.find((row) => row.cardNumber === '127/127');
    expect(energy).toMatchObject({
      cardArticleTitle: 'Fire Energy (Gallant Galaxy Charm 127)',
      primaryType: 'Energy',
      secondaryField: 'Fire',
    });
  });
});

describe('section targeting (a job requesting only one named list section)', () => {
  const sharedArticle = [
    '{{TCGExpansionInfobox|encards=1|ensetnum=1}}',
    '==Card list==',
    '{{Setlist/header|title=EN Half}}',
    '{{Setlist/entry|001/100|H|{{TCG ID|EN Half|Bulbasaur|1}}|Grass||Common}}',
    '{{Setlist/footer}}',
    '==Set list==',
    '{{Setlist/header|title=JP Half}}',
    '{{Setlist/entry|001/100|I|{{TCG ID|JP Half|Charmander|1}}|Fire||C}}',
    '{{Setlist/footer}}',
    '==Gallery==',
    'Some unrelated trailing prose.',
  ].join('\n');

  it('with no sectionTitle, parses every row on the page regardless of section', () => {
    const { cardListRows } = parseSetPageWikitext(sharedArticle);
    expect(cardListRows.map((r) => r.displayName).sort()).toEqual(['Bulbasaur', 'Charmander']);
  });

  it('with a sectionTitle, only returns rows from that named section', () => {
    const { cardListRows } = parseSetPageWikitext(sharedArticle, { sectionTitle: 'Set list' });
    expect(cardListRows).toHaveLength(1);
    expect(cardListRows[0].displayName).toBe('Charmander');
  });

  it('section matching is case- and whitespace-insensitive', () => {
    const { cardListRows } = parseSetPageWikitext(sharedArticle, { sectionTitle: '  SET LIST  ' });
    expect(cardListRows[0].displayName).toBe('Charmander');
  });

  it('still reads the infobox from the full page even when a section is requested', () => {
    const { setInfo } = parseSetPageWikitext(sharedArticle, { sectionTitle: 'Set list' });
    expect(setInfo.cardCount).toBe(1);
  });

  it('falls back to the whole page when the requested section heading is not found', () => {
    const { cardListRows } = parseSetPageWikitext(sharedArticle, { sectionTitle: 'Nonexistent Section' });
    expect(cardListRows).toHaveLength(2);
  });

  it('extractWikitextSection stops a section at the next heading of the same or shallower level', () => {
    const text = '==A==\nrow-a\n===A1===\nrow-a1\n==B==\nrow-b';
    expect(extractWikitextSection(text, 'A').trim()).toBe('row-a\n===A1===\nrow-a1');
    expect(extractWikitextSection(text, 'A1').trim()).toBe('row-a1');
    expect(extractWikitextSection(text, 'B').trim()).toBe('row-b');
  });
});

describe('extractSetlistRows is tolerant of a template-name capitalization variant', () => {
  it('matches a lowercase {{setlist/entry}} marker the same as the canonical casing', () => {
    const wikitext = '{{setlist/entry|001/10|H|{{TCG ID|Test Set|Lower Card|1}}|Grass||Common}}';
    const { cardListRows } = parseSetPageWikitext(wikitext);
    expect(cardListRows).toHaveLength(1);
    expect(cardListRows[0].cardArticleTitle).toBe('Lower Card (Test Set 1)');
  });
});

describe('extractSetlistRows covers a card list split across multiple subset sections on one page', () => {
  it('collects rows from every {{Setlist/header}}...{{Setlist/footer}} block on the page, not just the first', () => {
    // Mirrors the recon-confirmed Gallant Galaxy shape (two CS5a/CS5b
    // subsets on one article) -- this is already handled by scanning the
    // whole page for every entry marker rather than pairing with one
    // specific header/footer, so this test documents/locks in that
    // existing behavior rather than changing anything.
    const wikitext = [
      '{{Setlist/header|title=Charm}}',
      '{{Setlist/entry|001/127|F|{{TCG ID|Charm|Charmander|1}}|Fire||C}}',
      '{{Setlist/footer}}',
      'some prose between subsets',
      '{{Setlist/header|title=Brave}}',
      '{{Setlist/entry|001/139|F|{{TCG ID|Brave|Squirtle|1}}|Water||C}}',
      '{{Setlist/footer}}',
    ].join('\n');
    const { cardListRows } = parseSetPageWikitext(wikitext);
    expect(cardListRows.map((r) => r.displayName).sort()).toEqual(['Charmander', 'Squirtle']);
  });
});

describe('extractCsCode', () => {
  it('extracts a CS-series code embedded in an infobox image/logo filename', () => {
    const { setInfo } = parseSetPageWikitext(zhCnScorchingSkiesInfobox);
    expect(extractCsCode(setInfo)).toBe('CS35');
  });

  it('extracts a lettered sub-code the same way', () => {
    const { setInfo } = parseSetPageWikitext(zhCnGallantGalaxyInfobox);
    expect(extractCsCode(setInfo)).toBe('CS5a');
  });

  it('returns null when the infobox carries no CS code', () => {
    const { setInfo } = parseSetPageWikitext(surgingSparksInfobox);
    expect(extractCsCode(setInfo)).toBeNull();
  });
});
