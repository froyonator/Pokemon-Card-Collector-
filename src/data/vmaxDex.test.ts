import { describe, expect, it } from 'vitest';
import {
  VMAX_DEX_BASE,
  VMAX_DEX_ENTRIES,
  VMAX_NAME_PATTERNS,
  cardMatchesVmaxEntry,
  cardsForVmaxEntry,
  isVmaxCardName,
  isVmaxDexNumber,
  vmaxDexEntryByNumber,
  vmaxDexEntriesForBaseDex,
} from './vmaxDex';

describe('VMAX_DEX_ENTRIES', () => {
  it('has exactly 81 forms, matching the pipeline roster', () => {
    expect(VMAX_DEX_ENTRIES).toHaveLength(81);
  });

  it('assigns synthetic numbers as VMAX_DEX_BASE + release order, contiguous with no gaps or duplicates', () => {
    const numbers = VMAX_DEX_ENTRIES.map((e) => e.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 81 }, (_, i) => VMAX_DEX_BASE + i + 1));
  });

  it('assigns a contiguous 1..81 order with no gaps or duplicates', () => {
    const orders = VMAX_DEX_ENTRIES.map((e) => e.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 81 }, (_, i) => i + 1));
  });

  it('has unique slugs and synthetic numbers', () => {
    expect(new Set(VMAX_DEX_ENTRIES.map((e) => e.slug)).size).toBe(81);
    expect(new Set(VMAX_DEX_ENTRIES.map((e) => e.number)).size).toBe(81);
  });

  it('sets spriteSlug equal to slug', () => {
    for (const entry of VMAX_DEX_ENTRIES) {
      expect(entry.spriteSlug).toBe(entry.slug);
    }
  });

  it('builds display name as "Gigantamax "/"Dynamax " + species label', () => {
    const charizard = VMAX_DEX_ENTRIES.find((e) => e.slug === 'charizard-gmax');
    expect(charizard?.name).toBe('Gigantamax Charizard');
    expect(charizard?.hasGigantamax).toBe(true);
    const vaporeon = VMAX_DEX_ENTRIES.find((e) => e.slug === 'vaporeon-dynamax');
    expect(vaporeon?.name).toBe('Dynamax Vaporeon');
    expect(vaporeon?.hasGigantamax).toBe(false);
  });

  it('includes Appletun with hasGigantamax true and no card evidence needed', () => {
    const appletun = VMAX_DEX_ENTRIES.find((e) => e.slug === 'appletun-gmax');
    expect(appletun?.hasGigantamax).toBe(true);
    expect(appletun?.baseDexNumber).toBe(842);
  });

  it('includes Urshifu Single/Rapid Strike and Calyrex Ice/Shadow Rider as separate entries sharing one base dex', () => {
    expect(vmaxDexEntriesForBaseDex(892).map((e) => e.slug).sort()).toEqual([
      'urshifu-rapid-strike-gmax',
      'urshifu-single-strike-gmax',
    ]);
    expect(vmaxDexEntriesForBaseDex(898).map((e) => e.slug).sort()).toEqual([
      'calyrex-ice-dynamax',
      'calyrex-shadow-dynamax',
    ]);
  });

  it('fixes the Inteleon dex number to the real 818, not the buggy 888 some records carry', () => {
    const inteleon = VMAX_DEX_ENTRIES.find((e) => e.slug === 'inteleon-gmax');
    expect(inteleon?.baseDexNumber).toBe(818);
  });
});

describe('isVmaxDexNumber / vmaxDexEntryByNumber', () => {
  it('recognizes every real entry number and rejects a real national dex number', () => {
    for (const entry of VMAX_DEX_ENTRIES) {
      expect(isVmaxDexNumber(entry.number)).toBe(true);
      expect(vmaxDexEntryByNumber(entry.number)).toBe(entry);
    }
    expect(isVmaxDexNumber(6)).toBe(false);
    expect(vmaxDexEntryByNumber(6)).toBeUndefined();
  });
});

describe('VMAX_NAME_PATTERNS / isVmaxCardName', () => {
  it('matches the Western space/hyphen-separated VMAX family', () => {
    expect(isVmaxCardName('Charizard VMAX')).toBe(true);
    expect(isVmaxCardName('Pikachu Surfeur-VMAX')).toBe(true);
  });

  it('matches the CJK fused family', () => {
    expect(isVmaxCardName('夢幻VMAX')).toBe(true);
    expect(isVmaxCardName('夢幻VMAX\n[極巨化/匯流]')).toBe(true);
  });

  it('does not match V or VSTAR cards', () => {
    expect(isVmaxCardName('Charizard V')).toBe(false);
    expect(isVmaxCardName('Charizard VSTAR')).toBe(false);
  });

  it('has exactly the two documented pattern ids', () => {
    expect(VMAX_NAME_PATTERNS.map((p) => p.id).sort()).toEqual(['cjk-fused-vmax', 'latin-vmax']);
  });
});

describe('cardMatchesVmaxEntry / cardsForVmaxEntry', () => {
  const single = VMAX_DEX_ENTRIES.find((e) => e.slug === 'urshifu-single-strike-gmax')!;
  const rapid = VMAX_DEX_ENTRIES.find((e) => e.slug === 'urshifu-rapid-strike-gmax')!;
  const iceRider = VMAX_DEX_ENTRIES.find((e) => e.slug === 'calyrex-ice-dynamax')!;
  const shadowRider = VMAX_DEX_ENTRIES.find((e) => e.slug === 'calyrex-shadow-dynamax')!;
  const charizard = VMAX_DEX_ENTRIES.find((e) => e.slug === 'charizard-gmax')!;

  it('splits Urshifu VMAX prints onto the matching Style-specific tile only, using real card names', () => {
    const cards = [
      { name: 'Single Strike Urshifu VMAX' },
      { name: 'Rapid Strike Urshifu VMAX' },
      { name: 'Single Strike Urshifu V' },
      { name: 'Single Strike Urshifu' },
    ];
    expect(cardsForVmaxEntry(cards, single).map((c) => c.name)).toEqual(['Single Strike Urshifu VMAX']);
    expect(cardsForVmaxEntry(cards, rapid).map((c) => c.name)).toEqual(['Rapid Strike Urshifu VMAX']);
  });

  it('splits Calyrex VMAX prints onto the matching Rider-specific tile only, using real card names', () => {
    const cards = [{ name: 'Ice Rider Calyrex VMAX' }, { name: 'Shadow Rider Calyrex VMAX' }];
    expect(cardsForVmaxEntry(cards, iceRider).map((c) => c.name)).toEqual(['Ice Rider Calyrex VMAX']);
    expect(cardsForVmaxEntry(cards, shadowRider).map((c) => c.name)).toEqual(['Shadow Rider Calyrex VMAX']);
  });

  it('matches every VMAX print for a species with no sibling split needed (Charizard)', () => {
    const cards = [{ name: 'Charizard VMAX' }, { name: 'Charizard V' }, { name: 'Charizard' }];
    expect(cardMatchesVmaxEntry('Charizard VMAX', charizard)).toBe(true);
    expect(cardsForVmaxEntry(cards, charizard).map((c) => c.name)).toEqual(['Charizard VMAX']);
  });
});
