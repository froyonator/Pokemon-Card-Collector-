// scripts/carddata/src/data/regionalDex.test.ts
import { describe, expect, it } from 'vitest';
import {
  ALOLAN_DEX,
  GALARIAN_DEX,
  HISUIAN_DEX,
  PALDEAN_DEX,
  REGIONAL_DEX,
  REGIONAL_FAMILIES,
  isRegionalCardName,
  regionalFormBySlug,
  regionalFormsForDex,
} from './regionalDex';

describe('roster sizes', () => {
  it('Alolan has 19 forms, all with their own pokeapi variety', () => {
    expect(ALOLAN_DEX).toHaveLength(19);
    expect(ALOLAN_DEX.every((f) => f.hasOwnVariety)).toBe(true);
  });

  it('Galarian has 26 forms: 20 varieties + 6 exclusive evolutions', () => {
    expect(GALARIAN_DEX).toHaveLength(26);
    expect(GALARIAN_DEX.filter((f) => f.hasOwnVariety)).toHaveLength(20);
    expect(GALARIAN_DEX.filter((f) => !f.hasOwnVariety)).toHaveLength(6);
  });

  it('Hisuian has 19 forms: 16 varieties + 3 exclusive evolutions', () => {
    expect(HISUIAN_DEX).toHaveLength(19);
    expect(HISUIAN_DEX.filter((f) => f.hasOwnVariety)).toHaveLength(16);
    expect(HISUIAN_DEX.filter((f) => !f.hasOwnVariety)).toHaveLength(3);
  });

  it('Paldean has 5 forms: 4 varieties + 1 exclusive evolution', () => {
    expect(PALDEAN_DEX).toHaveLength(5);
    expect(PALDEAN_DEX.filter((f) => f.hasOwnVariety)).toHaveLength(4);
    expect(PALDEAN_DEX.filter((f) => !f.hasOwnVariety)).toHaveLength(1);
  });

  it('does NOT include Wyrdeer, Kleavor, or Ursaluna (no card in any language tags them Hisuian)', () => {
    expect(HISUIAN_DEX.find((f) => f.speciesLabel === 'Wyrdeer')).toBeUndefined();
    expect(HISUIAN_DEX.find((f) => f.speciesLabel === 'Kleavor')).toBeUndefined();
    expect(HISUIAN_DEX.find((f) => f.speciesLabel === 'Ursaluna')).toBeUndefined();
  });

  it('REGIONAL_DEX is the concatenation of all four families', () => {
    expect(REGIONAL_DEX).toHaveLength(ALOLAN_DEX.length + GALARIAN_DEX.length + HISUIAN_DEX.length + PALDEAN_DEX.length);
  });

  it('has unique slugs within each family', () => {
    for (const dex of [ALOLAN_DEX, GALARIAN_DEX, HISUIAN_DEX, PALDEAN_DEX]) {
      const slugs = new Set(dex.map((f) => f.slug));
      expect(slugs.size).toBe(dex.length);
    }
  });

  it('assigns a contiguous 1..N order with no gaps or duplicates within each family', () => {
    for (const dex of [ALOLAN_DEX, GALARIAN_DEX, HISUIAN_DEX, PALDEAN_DEX]) {
      const orders = dex.map((f) => f.order).sort((a, b) => a - b);
      expect(orders).toEqual(Array.from({ length: dex.length }, (_, i) => i + 1));
    }
  });

  it('REGIONAL_FAMILIES formCount matches each dex length', () => {
    const byFamily = Object.fromEntries(REGIONAL_FAMILIES.map((m) => [m.family, m.formCount]));
    expect(byFamily.alolan).toBe(ALOLAN_DEX.length);
    expect(byFamily.galarian).toBe(GALARIAN_DEX.length);
    expect(byFamily.hisuian).toBe(HISUIAN_DEX.length);
    expect(byFamily.paldean).toBe(PALDEAN_DEX.length);
  });
});

describe('multi-form species', () => {
  it('gives Paldean Tauros three breed entries sharing one baseDex', () => {
    const forms = regionalFormsForDex(128).filter((f) => f.family === 'paldean');
    expect(forms.map((f) => f.slug).sort()).toEqual([
      'tauros-paldea-aqua-breed',
      'tauros-paldea-blaze-breed',
      'tauros-paldea-combat-breed',
    ]);
    expect(forms.every((f) => f.speciesLabel === 'Tauros')).toBe(true);
  });

  it('gives Galarian Darmanitan two mode entries sharing one baseDex', () => {
    const forms = regionalFormsForDex(555).filter((f) => f.family === 'galarian');
    expect(forms.map((f) => f.slug).sort()).toEqual(['darmanitan-galar-standard', 'darmanitan-galar-zen']);
    expect(forms.every((f) => f.speciesLabel === 'Darmanitan')).toBe(true);
  });

  it('gives Alolan Raticate a plain form and a Totem form sharing one baseDex', () => {
    const forms = regionalFormsForDex(20).filter((f) => f.family === 'alolan');
    expect(forms.map((f) => f.slug).sort()).toEqual(['raticate-alola', 'raticate-totem-alola']);
  });
});

describe('lookups', () => {
  it('looks up a known slug', () => {
    expect(regionalFormBySlug('vulpix-alola')).toMatchObject({ baseDex: 37, displayName: 'Alolan Vulpix' });
    expect(regionalFormBySlug('obstagoon')).toMatchObject({ baseDex: 862, displayName: 'Galarian Obstagoon', hasOwnVariety: false });
    expect(regionalFormBySlug('does-not-exist')).toBeUndefined();
  });
});

describe('isRegionalCardName', () => {
  // Real fixture names pulled from public/data/cards/**/*.json during the
  // regional-audit.md audit -- see regionalDex.ts's own header comment for
  // per-language marker evidence.
  const matchCases: Array<[string, string, string, string]> = [
    // family, speciesToken, cardName, note
    ['alolan', 'Vulpix', 'Alolan Vulpix', 'en prefix'],
    ['alolan', 'Vulpix', 'Alolan Vulpix V', 'en prefix + suffix'],
    ['alolan', 'Raichu', 'Raichu & Alolan Raichu GX', 'en fusion, marker mid-string'],
    ['alolan', 'Exeggutor', 'Rowlet & Alolan Exeggutor GX', 'en fusion'],
    ['alolan', 'Vulpix', 'Alola-Vulpix', 'de hyphen prefix'],
    ['alolan', 'Vulpix', 'Alola Vulpix-V', 'de space prefix'],
    ['alolan', 'Vulpix', 'Vulpix de Alola', 'es/pt suffix'],
    ['alolan', 'Vulpix', 'Vulpix di Alola', 'it suffix'],
    ['alolan', 'Vulpix', "Vulpix d'Alola", 'fr suffix, straight apostrophe'],
    ['alolan', 'Vulpix', 'Vulpix d’Alola', 'fr suffix, curly apostrophe'],
    ['alolan', 'コラッタ', 'アローラ コラッタ', 'ja prefix'],
    ['alolan', '小拉達', '阿羅拉 小拉達', 'zh-tw prefix'],
    ['alolan', '小拳石', '阿羅拉  小拳石', 'zh-tw prefix, doubled space'],
    ['alolan', '地鼠', '阿羅拉 地鼠', 'zh-cn prefix (traditional-char token)'],
    ['alolan', 'Raichu', 'Raichu & Alolan Raichu', 'id fusion, borrowed English word'],

    ['galarian', 'Ponyta', 'Galarian Ponyta', 'en prefix'],
    ['galarian', 'Mauzi', 'Galar-Mauzi', 'de hyphen prefix (Mauzi is German for Meowth)'],
    ['galarian', 'Ponyta', 'Ponyta de Galar', 'es/pt/fr suffix'],
    ['galarian', 'Ponyta', 'Ponyta di Galar', 'it suffix'],
    ['galarian', 'ポニータ', 'ガラル ポニータ', 'ja prefix'],
    ['galarian', '喵喵', '伽勒爾 喵喵', 'zh-tw prefix'],
    ['galarian', 'เนียส', 'กาลาร์ เนียส', 'th prefix'],
    ['galarian', 'Obstagoon', 'Galarian Obstagoon', 'en, exclusive-evolution species'],

    ['hisuian', 'Growlithe', 'Hisuian Growlithe', 'en prefix'],
    ['hisuian', 'Fukano', 'Hisui-Fukano', 'de hyphen prefix'],
    ['hisuian', 'Voltobal', 'Hisui Voltobal', 'de space prefix'],
    ['hisuian', 'Growlithe', 'Growlithe de Hisui', 'es/pt/fr suffix'],
    ['hisuian', 'Growlithe', 'Growlithe di Hisui', 'it suffix'],
    ['hisuian', 'ガーディ', 'ヒスイ ガーディ', 'ja prefix'],
    ['hisuian', '卡蒂狗', '洗翠 卡蒂狗', 'zh-tw prefix'],
    ['hisuian', 'การ์ดี', 'ฮิซุย การ์ดี', 'th prefix'],
    ['hisuian', 'Basculegion', 'Hisuian Basculegion', 'en, exclusive-evolution species'],
    ['hisuian', 'Sneasler', 'Hisuian Sneasler', 'en, exclusive-evolution species'],
    ['hisuian', 'Overqwil', 'Hisuian Overqwil', 'en, exclusive-evolution species'],

    ['paldean', 'Tauros', 'Paldean Tauros', 'en prefix'],
    ['paldean', 'Tauros', 'Paldea-Tauros', 'de hyphen prefix'],
    ['paldean', 'Tauros', 'Tauros de Paldea', 'es/pt/fr suffix'],
    ['paldean', 'Tauros', 'Tauros di Paldea', 'it suffix'],
    ['paldean', 'ケンタロス', 'パルデア ケンタロス', 'ja prefix'],
    ['paldean', '肯泰羅', '帕底亞 肯泰羅', 'zh-tw/zh-cn prefix'],
    ['paldean', 'เคนเทารอส', 'พัลเดีย เคนเทารอส', 'th prefix'],
    ['paldean', 'Tauros', 'Paldean Tauros', 'id prefix'],
    ['paldean', 'Clodsire', 'Paldean Clodsire ex', 'en, exclusive-evolution species + suffix'],
  ];

  for (const [family, token, name, note] of matchCases) {
    it(`matches ${family}/"${token}" against "${name}" (${note})`, () => {
      expect(isRegionalCardName(family as never, token, name)).toBe(true);
    });
  }

  const nonMatchCases: Array<[string, string, string, string]> = [
    ['alolan', 'Vulpix', 'Vulpix', 'plain species, no tag at all'],
    ['alolan', 'Vulpix', 'Vulpix V', 'plain species with suffix, no tag'],
    ['alolan', 'Slowpoke', 'Galarian Slowpoke', 'wrong family for this species'],
    ['galarian', 'Vulpix', 'Alolan Vulpix', 'wrong family, and wrong species token'],
    ['galarian', 'Slowpoke', 'Galarian Ponyta', 'right family, wrong species token'],
    ['alolan', 'Ponyta', 'Galarian Ponyta', 'right-looking name but wrong family requested'],
    ['galarian', 'Wyrdeer', 'Wyrdeer', 'exclusive evolution the TCG never tags Hisuian, let alone Galarian'],
    ['hisuian', 'Wyrdeer', 'Wyrdeer V', 'no Hisuian tag exists for this card in any language'],
    ['hisuian', 'Wyrdeer', 'Wyrdeer VSTAR', 'no Hisuian tag exists for this card in any language'],
    ['hisuian', 'Ursaluna', 'Bloodmoon Ursaluna ex', 'Bloodmoon is an unrelated alt-form tag, not Hisuian'],
    ['galarian', 'Meowth', 'Meowth', 'plain species, no tag'],
    ['paldean', 'Wooper', 'Wooper', 'plain species, no tag (Paldean Wooper cards do carry the tag; bare Wooper does not)'],
  ];

  for (const [family, token, name, note] of nonMatchCases) {
    it(`does not match ${family}/"${token}" against "${name}" (${note})`, () => {
      expect(isRegionalCardName(family as never, token, name)).toBe(false);
    });
  }
});
