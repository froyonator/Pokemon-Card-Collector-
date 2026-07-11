// scripts/scraper/src/parseSetCardList.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSetCardList } from './parseSetCardList';

const fixtureHtml = readFileSync(
  fileURLToPath(new URL('./fixtures/set-card-list.html', import.meta.url)),
  'utf-8'
);

describe('parseSetCardList', () => {
  it('extracts every card id/slug link on the page, deduplicated', () => {
    const cards = parseSetCardList(fixtureHtml);
    expect(cards).toHaveLength(238);
    const ids = cards.map((c) => c.cardId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it('extracts the known first card correctly', () => {
    const cards = parseSetCardList(fixtureHtml);
    const weedle = cards.find((c) => c.cardId === '70354');
    expect(weedle).toEqual({ cardId: '70354', cardSlug: 'weedle-shadowy-threats-001-164' });
  });
});
