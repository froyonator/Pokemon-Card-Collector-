// scripts/carddata/src/data/vmaxDex.test.ts
import { describe, expect, it } from 'vitest';
import { VMAX_DEX, VMAX_NAME_PATTERNS, isVmaxCardName, vmaxFormBySlug, vmaxFormsForDex } from './vmaxDex';

describe('VMAX_DEX', () => {
  it('has exactly 81 entries: 33 Gigantamax forms + 48 plain-Dynamax forms', () => {
    expect(VMAX_DEX).toHaveLength(81);
    expect(VMAX_DEX.filter((f) => f.hasGigantamax)).toHaveLength(33);
    expect(VMAX_DEX.filter((f) => !f.hasGigantamax)).toHaveLength(48);
  });

  it('has unique slugs', () => {
    const slugs = new Set(VMAX_DEX.map((f) => f.slug));
    expect(slugs.size).toBe(VMAX_DEX.length);
  });

  it('assigns a contiguous 1..81 order with no gaps or duplicates', () => {
    const orders = VMAX_DEX.map((f) => f.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 81 }, (_, i) => i + 1));
  });

  it('builds displayName as "Gigantamax "/"Dynamax " + speciesLabel depending on hasGigantamax', () => {
    for (const form of VMAX_DEX) {
      const prefix = form.hasGigantamax ? 'Gigantamax' : 'Dynamax';
      expect(form.displayName).toBe(`${prefix} ${form.speciesLabel}`);
    }
  });

  it('looks up a known Gigantamax slug', () => {
    expect(vmaxFormBySlug('charizard-gmax')).toMatchObject({
      baseDex: 6,
      displayName: 'Gigantamax Charizard',
      hasGigantamax: true,
    });
    expect(vmaxFormBySlug('does-not-exist')).toBeUndefined();
  });

  it('looks up a known plain-Dynamax slug', () => {
    expect(vmaxFormBySlug('rayquaza-dynamax')).toMatchObject({
      baseDex: 384,
      displayName: 'Dynamax Rayquaza',
      hasGigantamax: false,
    });
  });

  it('gives Urshifu two Gigantamax forms sharing one base dex, Single Strike first', () => {
    const forms = vmaxFormsForDex(892);
    expect(forms.map((f) => f.slug)).toEqual(['urshifu-single-strike-gmax', 'urshifu-rapid-strike-gmax']);
    expect(forms.every((f) => f.hasGigantamax)).toBe(true);
    expect(forms[0].order).toBeLessThan(forms[1].order);
  });

  it('gives Calyrex two plain-Dynamax forms sharing one base dex, Ice Rider first', () => {
    const forms = vmaxFormsForDex(898);
    expect(forms.map((f) => f.slug)).toEqual(['calyrex-ice-dynamax', 'calyrex-shadow-dynamax']);
    expect(forms.every((f) => !f.hasGigantamax)).toBe(true);
    expect(forms[0].order).toBeLessThan(forms[1].order);
  });

  it('includes Appletun as a Gigantamax entry despite having no VMAX card in any language database', () => {
    expect(vmaxFormBySlug('appletun-gmax')).toMatchObject({ baseDex: 842, hasGigantamax: true });
  });

  it('uses the real National Dex number for Inteleon (818), not the buggy 888 some VMAX card records carry', () => {
    expect(vmaxFormBySlug('inteleon-gmax')).toMatchObject({ baseDex: 818, hasGigantamax: true });
    expect(vmaxFormsForDex(888)).toHaveLength(0);
  });

  it('orders by first VMAX card release wave, National Dex as tiebreaker', () => {
    const venusaur = vmaxFormBySlug('venusaur-gmax'); // SWSH Black Star Promos (Nov 2019)
    const lapras = vmaxFormBySlug('lapras-gmax'); // Sword & Shield (Feb 2020)
    const rillaboom = vmaxFormBySlug('rillaboom-gmax'); // Rebel Clash (May 2020)
    const hatterene = vmaxFormBySlug('hatterene-gmax'); // Crown Zenith (Jan 2023), last wave
    expect(venusaur!.order).toBeLessThan(lapras!.order);
    expect(lapras!.order).toBeLessThan(rillaboom!.order);
    expect(rillaboom!.order).toBeLessThan(hatterene!.order);
    expect(hatterene!.order).toBe(81);
  });

  it('places Appletun immediately after Flapple (paired release wave, no card of its own)', () => {
    const flapple = vmaxFormBySlug('flapple-gmax')!;
    const appletun = vmaxFormBySlug('appletun-gmax')!;
    expect(appletun.order).toBe(flapple.order + 1);
  });
});

describe('VMAX_NAME_PATTERNS / isVmaxCardName', () => {
  // Fixture names pulled directly from public/data/cards/**/*.json during
  // the vmax-audit.md audit -- real card names, not invented examples.
  const shouldMatch = [
    // latin-vmax
    'Charizard VMAX',
    'Pikachu VMAX',
    'Flying Pikachu VMAX',
    'Surfing Pikachu VMAX',
    'Single Strike Urshifu VMAX',
    'Rapid Strike Urshifu VMAX',
    'Ice Rider Calyrex VMAX',
    'Shadow Rider Calyrex VMAX',
    'Galarian Darmanitan VMAX',
    'Galarian Slowking VMAX',
    'Darmanitan de Galar VMAX', // es/it/pt
    'Slowking de Galar VMAX', // es/pt
    'Pikachu Surfeur VMAX', // fr, space-separated
    'Pikachu Surfeur-VMAX', // fr, hyphen-separated real variant of the same card
    'Glurak VMAX', // de (Charizard)
    'Dracaufeu VMAX', // fr (Charizard)
    // cjk-fused-vmax (zh-tw)
    '夢幻VMAX', // Mew VMAX
    '衝浪皮卡丘VMAX', // Surfing Pikachu VMAX
    '飛翔皮卡丘VMAX', // Flying Pikachu VMAX
    '夢幻VMAX\n[極巨化/匯流]', // real SV-era promo reprint with an embedded footnote in the name field
  ];

  const shouldNotMatch = [
    // plain V / VSTAR -- neither contains the "VMAX" substring at all
    'Charizard V',
    'Charizard VSTAR',
    'Inteleon V',
    // plain cards, no VMAX tag
    'Charizard',
    'Charizard-GX',
    'Charizard EX',
    'Charizard ex',
    'M Charizard EX',
    'Mega Charizard X ex',
    'Charizard & Braixen GX',
    'Pikachu ex',
    // CJK non-VMAX prints of the same species (Mew)
    '夢幻',
    '夢幻ex',
    '夢幻V',
  ];

  for (const name of shouldMatch) {
    it(`matches ${JSON.stringify(name)}`, () => {
      expect(isVmaxCardName(name)).toBe(true);
    });
  }

  for (const name of shouldNotMatch) {
    it(`does not match ${JSON.stringify(name)}`, () => {
      expect(isVmaxCardName(name)).toBe(false);
    });
  }

  it('exposes one regex per documented pattern id', () => {
    const ids = VMAX_NAME_PATTERNS.map((p) => p.id);
    expect(ids).toEqual(['latin-vmax', 'cjk-fused-vmax']);
  });
});
