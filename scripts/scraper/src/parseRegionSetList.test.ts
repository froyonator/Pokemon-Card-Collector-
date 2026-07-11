import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRegionSetList } from './parseRegionSetList';

const capturedSetPageHtml = readFileSync(
  fileURLToPath(new URL('./fixtures/set-card-list.html', import.meta.url)),
  'utf-8'
);

describe('parseRegionSetList', () => {
  it('parses the canonical set URL shape present in the captured TCG Collector fixture', () => {
    expect(parseRegionSetList(capturedSetPageHtml)).toEqual([
      { setId: '11921', setSlug: 'shadowy-threats' },
    ]);
  });

  it('deduplicates links by set id and ignores region navigation and non-set URLs', () => {
    const html = [
      '<a href="/sets/id">Indonesia</a>',
      '<a href="/sets/11921/shadowy-threats?setCardCountMode=anyCardVariant">Shadowy Threats</a>',
      '<a href="https://www.tcgcollector.com/sets/11921/shadowy-threats">Shadowy Threats duplicate</a>',
      '<a href="/cards/70354/weedle-shadowy-threats-001-164">Weedle</a>',
      '<a href="https://example.com/sets/1/not-tcg-collector">External</a>',
    ].join('');

    expect(parseRegionSetList(html)).toEqual([{ setId: '11921', setSlug: 'shadowy-threats' }]);
  });
});
