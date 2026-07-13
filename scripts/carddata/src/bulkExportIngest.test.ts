import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rangesForGenerations } from './snapshotAllGens';
import {
  buildBulkExportRecord,
  buildSetIdIndex,
  convertRoot,
  dataFolderForLanguage,
  findCardFiles,
  findSetIndexFiles,
  imageUrlIfAvailable,
  isCardAvailableInLanguage,
  loadCardModule,
  loadSetModule,
  localIdFromFileName,
  parseIngestArguments,
  resolveLanguageText,
  translateField,
  type BulkExportCard,
  type LanguageIngestStats,
} from './bulkExportIngest';

// --- pure helpers ----------------------------------------------------------

describe('dataFolderForLanguage', () => {
  it('routes the Asian languages to data-asia', () => {
    for (const lang of ['ja', 'ko', 'zh-tw', 'id', 'th', 'zh-cn']) {
      expect(dataFolderForLanguage(lang)).toBe('data-asia');
    }
  });

  it('routes everything else (including en) to data', () => {
    for (const lang of ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru']) {
      expect(dataFolderForLanguage(lang)).toBe('data');
    }
  });
});

describe('isCardAvailableInLanguage', () => {
  const card = { name: { en: 'Chikorita', fr: 'Germignon' }, set: {} } as unknown as BulkExportCard;

  it('is true when the language has a name entry', () => {
    expect(isCardAvailableInLanguage(card, 'en')).toBe(true);
    expect(isCardAvailableInLanguage(card, 'fr')).toBe(true);
  });

  it('is false when the language has no name entry -- the source was never released in that language', () => {
    expect(isCardAvailableInLanguage(card, 'de')).toBe(false);
    expect(isCardAvailableInLanguage(card, 'ja')).toBe(false);
  });
});

describe('localIdFromFileName', () => {
  it('strips the .ts extension', () => {
    expect(localIdFromFileName('002.ts')).toBe('002');
    expect(localIdFromFileName('SV018.ts')).toBe('SV018');
  });

  it('leaves a name with no extension untouched', () => {
    expect(localIdFromFileName('SV018')).toBe('SV018');
  });
});

describe('resolveLanguageText', () => {
  it('returns the direct match when present', () => {
    expect(resolveLanguageText({ en: 'Base', fr: 'Base FR' }, 'fr')).toBe('Base FR');
  });

  it('falls back to a dash-prefixed entry when the plain code is absent', () => {
    expect(resolveLanguageText({ en: 'Base', 'pt-br': 'Base BR' }, 'pt')).toBe('Base BR');
  });

  it('does not apply the prefix fallback to a language code that itself contains a dash', () => {
    expect(resolveLanguageText({ en: 'Base' }, 'zh-tw')).toBe('Base'); // falls through to English, not a "zh"-prefixed key
  });

  it('falls back to English, then to whatever is first', () => {
    expect(resolveLanguageText({ en: 'Base', fr: 'Base FR' }, 'de')).toBe('Base');
    expect(resolveLanguageText({ ja: 'Base JA' }, 'de')).toBe('Base JA');
  });

  it('returns undefined for an empty/missing map', () => {
    expect(resolveLanguageText(undefined, 'en')).toBeUndefined();
    expect(resolveLanguageText({}, 'en')).toBeUndefined();
  });
});

describe('translateField', () => {
  const frDict = { rarity: { Common: 'Commune' }, category: { Pokemon: 'Pokémon' } };

  it('translates when a dictionary and matching key exist', () => {
    expect(translateField(frDict, 'rarity', 'Common')).toBe('Commune');
    expect(translateField(frDict, 'category', 'Pokemon')).toBe('Pokémon');
  });

  it('passes the raw value through when there is no dictionary at all (e.g. ja, ko, zh-tw)', () => {
    expect(translateField(undefined, 'rarity', 'Common')).toBe('Common');
  });

  it('passes the raw value through when the dictionary has no matching key', () => {
    expect(translateField(frDict, 'rarity', 'Some Future Rarity')).toBe('Some Future Rarity');
  });

  it('passes undefined through unchanged', () => {
    expect(translateField(frDict, 'rarity', undefined)).toBeUndefined();
  });
});

describe('imageUrlIfAvailable', () => {
  // Keyed by the card's own LOCAL id ("002"), not its global id
  // ("neo1-002") -- verified against the primary source's own compiler
  // (server/compiler/utils/cardUtil.ts's getCardPictures is always called
  // with the local id) and live (en's basep-29 -- localId "29" -- has
  // image URL ".../base/basep/29", not ".../base/basep/basep-29").
  const index = { ja: { neo: { neo1: { '002': 1 } } } };

  it('builds the assets host URL (ending in the local id) when the index confirms existence', () => {
    expect(imageUrlIfAvailable(index, 'ja', 'neo', 'neo1', '002')).toBe(
      'https://assets.tcgdex.net/ja/neo/neo1/002'
    );
  });

  it('returns undefined when the index does not confirm existence', () => {
    expect(imageUrlIfAvailable(index, 'ja', 'neo', 'neo1', '999')).toBeUndefined();
    expect(imageUrlIfAvailable(index, 'fr', 'neo', 'neo1', '002')).toBeUndefined();
  });

  it('returns undefined when no index is available at all', () => {
    expect(imageUrlIfAvailable(undefined, 'ja', 'neo', 'neo1', '002')).toBeUndefined();
  });
});

describe('buildBulkExportRecord', () => {
  const card: BulkExportCard = {
    name: { en: 'Chikorita', fr: 'Germignon' },
    rarity: 'Common',
    category: 'Pokemon',
    illustrator: 'Someone',
    hp: 50,
    dexId: [152],
    set: { id: 'neo1', name: { en: 'Neo Genesis', fr: 'Neo Genesis' }, serie: { id: 'neo', name: { en: 'Neo' } } },
  };

  it('produces the record.json shape buildStaticDatabase.ts consumes', () => {
    const record = buildBulkExportRecord(card, '2', 'en', undefined, undefined, '2026-01-01T00:00:00.000Z');
    expect(record).toEqual({
      id: 'neo1-2',
      localId: '2',
      name: 'Chikorita',
      rarity: 'Common',
      category: 'Pokemon',
      set: { id: 'neo1', name: 'Neo Genesis' },
      dexId: [152],
      image: undefined,
      illustrator: 'Someone',
      hp: 50,
      types: undefined,
      stage: undefined,
      retreat: undefined,
      language: 'en',
      imageStatus: 'skipped',
      imageFile: null,
      source: 'bulk-export',
      convertedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('translates rarity/category when a dictionary is supplied', () => {
    const frDict = { rarity: { Common: 'Commune' }, category: { Pokemon: 'Pokémon' } };
    const record = buildBulkExportRecord(card, '2', 'fr', frDict, undefined, '2026-01-01T00:00:00.000Z');
    expect(record?.rarity).toBe('Commune');
    expect(record?.category).toBe('Pokémon');
    expect(record?.name).toBe('Germignon');
  });

  it('returns undefined when the card has no name for the requested language', () => {
    expect(buildBulkExportRecord(card, '2', 'de', undefined, undefined, '2026-01-01T00:00:00.000Z')).toBeUndefined();
  });

  it('includes an image URL only when the availability index confirms it, keyed and ending in the local id', () => {
    const index = { en: { neo: { neo1: { '2': 1 } } } };
    const record = buildBulkExportRecord(card, '2', 'en', undefined, index, '2026-01-01T00:00:00.000Z');
    expect(record?.image).toBe('https://assets.tcgdex.net/en/neo/neo1/2');
  });
});

describe('parseIngestArguments', () => {
  it('parses langs and gens', () => {
    expect(parseIngestArguments(['--langs', 'ja,fr', '--gens', '2,3'])).toEqual({
      languages: ['ja', 'fr'],
      generations: [2, 3],
      limit: undefined,
    });
  });

  it('defaults generations to 2-9 when omitted', () => {
    expect(parseIngestArguments(['--langs', 'ja']).generations).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('parses --limit', () => {
    expect(parseIngestArguments(['--langs', 'ja', '--limit', '5']).limit).toBe(5);
  });

  it('rejects an unsupported language', () => {
    expect(() => parseIngestArguments(['--langs', 'xx'])).toThrow();
  });

  it('refuses en -- the live API snapshot owns it', () => {
    expect(() => parseIngestArguments(['--langs', 'en'])).toThrow(/live API snapshot/);
  });

  it('requires --langs', () => {
    expect(() => parseIngestArguments([])).toThrow();
  });
});

// --- filesystem-backed integration tests ------------------------------------

/**
 * Builds a small fixture tree that mimics the real bulk export's own layout
 * closely enough to exercise findCardFiles + loadCardModule + convertRoot
 * end to end: a western `data/` root (one serie, one set, three cards: one
 * Gen2 Pokemon available in en+fr, one Gen1 Pokemon available only in en, one
 * Trainer with no dexId) and an Asian `data-asia/` root (one serie, one set,
 * one Gen2 Pokemon available only in ja) -- matching the real repo's
 * completely independent western/Asian file trees that merely share set ids
 * as strings.
 */
async function writeFixtureTree(root: string): Promise<void> {
  const western = path.join(root, 'data', 'TestSerie', 'TestSet');
  const asian = path.join(root, 'data-asia', 'TestSerieJa', 'TestSetJa');
  await mkdir(western, { recursive: true });
  await mkdir(asian, { recursive: true });

  await writeFile(
    path.join(root, 'data', 'TestSerie.ts'),
    `export default { id: 'testserie', name: { en: 'Test Serie', fr: 'Test Serie FR' } };\n`,
    'utf8'
  );
  await writeFile(
    path.join(root, 'data', 'TestSerie', 'TestSet.ts'),
    `import serie from '../TestSerie';\nexport default { id: 'ts1', name: { en: 'Test Set', fr: 'Set de Test' }, serie, cardCount: { official: 3 } };\n`,
    'utf8'
  );
  await writeFile(
    path.join(western, '1.ts'),
    `import set from '../TestSet';\nexport default { name: { en: 'Chikorita', fr: 'Germignon' }, rarity: 'Common', category: 'Pokemon', set, dexId: [152], hp: 50 };\n`,
    'utf8'
  );
  await writeFile(
    path.join(western, '2.ts'),
    `import set from '../TestSet';\nexport default { name: { en: 'Bulbasaur' }, rarity: 'Rare', category: 'Pokemon', set, dexId: [1] };\n`,
    'utf8'
  );
  await writeFile(
    path.join(western, '3.ts'),
    `import set from '../TestSet';\nexport default { name: { en: 'Potion', fr: 'Potion' }, rarity: 'Common', category: 'Trainer', set };\n`,
    'utf8'
  );

  await writeFile(
    path.join(root, 'data-asia', 'TestSerieJa.ts'),
    `export default { id: 'testserieja', name: { ja: 'テストシリーズ' } };\n`,
    'utf8'
  );
  await writeFile(
    path.join(root, 'data-asia', 'TestSerieJa', 'TestSetJa.ts'),
    `import serie from '../TestSerieJa';\nexport default { id: 'tsj1', name: { ja: 'テストセット' }, serie };\n`,
    'utf8'
  );
  await writeFile(
    path.join(asian, '001.ts'),
    `import set from '../TestSetJa';\nexport default { name: { ja: 'チコリータ' }, rarity: 'Common', category: 'Pokemon', set, dexId: [152] };\n`,
    'utf8'
  );
}

describe('findCardFiles', () => {
  it('finds only the depth-3 card files, not serie/set index files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const western = await findCardFiles(path.join(root, 'data'));
    expect(western.sort()).toEqual(
      [
        path.join(root, 'data', 'TestSerie', 'TestSet', '1.ts'),
        path.join(root, 'data', 'TestSerie', 'TestSet', '2.ts'),
        path.join(root, 'data', 'TestSerie', 'TestSet', '3.ts'),
      ].sort()
    );

    const asian = await findCardFiles(path.join(root, 'data-asia'));
    expect(asian).toEqual([path.join(root, 'data-asia', 'TestSerieJa', 'TestSetJa', '001.ts')]);
  });
});

describe('loadCardModule', () => {
  it('dynamically imports a card file and resolves its relative Set/Serie imports', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const card = await loadCardModule(path.join(root, 'data', 'TestSerie', 'TestSet', '1.ts'));
    expect(card?.name).toEqual({ en: 'Chikorita', fr: 'Germignon' });
    expect(card?.set.id).toBe('ts1');
    expect(card?.set.serie.id).toBe('testserie');
    expect(card?.dexId).toEqual([152]);
  });
});

describe('findSetIndexFiles', () => {
  it('finds only the depth-1 set index files, not serie index or card files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const western = await findSetIndexFiles(path.join(root, 'data'));
    expect(western).toEqual([path.join(root, 'data', 'TestSerie', 'TestSet.ts')]);

    const asian = await findSetIndexFiles(path.join(root, 'data-asia'));
    expect(asian).toEqual([path.join(root, 'data-asia', 'TestSerieJa', 'TestSetJa.ts')]);
  });
});

describe('loadSetModule', () => {
  it('dynamically imports a Set index file and returns its id + name map', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const set = await loadSetModule(path.join(root, 'data', 'TestSerie', 'TestSet.ts'));
    expect(set).toEqual({ id: 'ts1', name: { en: 'Test Set', fr: 'Set de Test' } });
  });

  it('returns undefined for a card file (has a `set` field, not a Set object)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const notASet = await loadSetModule(path.join(root, 'data', 'TestSerie', 'TestSet', '1.ts'));
    expect(notASet).toBeUndefined();
  });
});

describe('buildSetIdIndex', () => {
  it('maps setId -> {cardDir, name} for every set found under the root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const index = await buildSetIdIndex(path.join(root, 'data'));
    expect(index.size).toBe(1);
    expect(index.get('ts1')).toEqual({
      cardDir: path.join(root, 'data', 'TestSerie', 'TestSet'),
      name: { en: 'Test Set', fr: 'Set de Test' },
    });
  });

  it('returns an empty index for an unknown setId lookup, without throwing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);

    const index = await buildSetIdIndex(path.join(root, 'data'));
    expect(index.get('doesnotexist')).toBeUndefined();
  });
});

describe('convertRoot (end to end against the fixture tree)', () => {
  it('writes only in-range, in-language records to the exact snapshot-all-gens layout', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-output-'));

    const ranges = rangesForGenerations([2]);
    const statsByLanguage = new Map<string, LanguageIngestStats>([
      ['en', { language: 'en', filesScanned: 0, cardsWritten: 0, distinctDexNumbers: 0 }],
      ['fr', { language: 'fr', filesScanned: 0, cardsWritten: 0, distinctDexNumbers: 0 }],
    ]);

    await convertRoot(
      path.join(root, 'data'),
      ['en', 'fr'],
      ranges,
      new Map(),
      undefined,
      undefined,
      statsByLanguage,
      outputRoot
    );

    // Gen2 card (Chikorita, dex 152) available in both en and fr.
    const enRecord = JSON.parse(
      await readFile(path.join(outputRoot, 'en', 'ts1', 'ts1-1', 'record.json'), 'utf8')
    );
    expect(enRecord.name).toBe('Chikorita');
    expect(enRecord.dexId).toEqual([152]);
    expect(enRecord.imageStatus).toBe('skipped');
    expect(enRecord.imageFile).toBeNull();

    const frRecord = JSON.parse(
      await readFile(path.join(outputRoot, 'fr', 'ts1', 'ts1-1', 'record.json'), 'utf8')
    );
    expect(frRecord.name).toBe('Germignon');

    // Gen1 card (Bulbasaur, dex 1) is out of the requested [2] range -- must not be written.
    await expect(readFile(path.join(outputRoot, 'en', 'ts1', 'ts1-2', 'record.json'), 'utf8')).rejects.toThrow();

    // Trainer card has no dexId -- must not be written for either language.
    await expect(readFile(path.join(outputRoot, 'en', 'ts1', 'ts1-3', 'record.json'), 'utf8')).rejects.toThrow();

    expect(statsByLanguage.get('en')?.cardsWritten).toBe(1);
    expect(statsByLanguage.get('fr')?.cardsWritten).toBe(1);
    expect(statsByLanguage.get('en')?.distinctDexNumbers).toBe(1);
  });

  it('scopes a language to its own data root -- a ja-only card never leaks into an en/fr run and vice versa', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-output-'));

    const ranges = rangesForGenerations([2]);
    const statsByLanguage = new Map<string, LanguageIngestStats>([
      ['ja', { language: 'ja', filesScanned: 0, cardsWritten: 0, distinctDexNumbers: 0 }],
    ]);

    await convertRoot(
      path.join(root, 'data-asia'),
      ['ja'],
      ranges,
      new Map(),
      undefined,
      undefined,
      statsByLanguage,
      outputRoot
    );

    const jaRecord = JSON.parse(
      await readFile(path.join(outputRoot, 'ja', 'tsj1', 'tsj1-001', 'record.json'), 'utf8')
    );
    expect(jaRecord.name).toBe('チコリータ');
    expect(jaRecord.set).toEqual({ id: 'tsj1', name: 'テストセット' });
  });

  it('respects --limit as a per-language cap on distinct captured dex numbers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-fixture-'));
    await writeFixtureTree(root);
    // Add a second Gen2 card (dex 153) so there's something for --limit 1 to actually cap.
    await writeFile(
      path.join(root, 'data', 'TestSerie', 'TestSet', '4.ts'),
      `import set from '../TestSet';\nexport default { name: { en: 'Bayleef' }, rarity: 'Common', category: 'Pokemon', set, dexId: [153] };\n`,
      'utf8'
    );
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'carddata-bulk-output-'));

    const ranges = rangesForGenerations([2]);
    const statsByLanguage = new Map<string, LanguageIngestStats>([
      ['en', { language: 'en', filesScanned: 0, cardsWritten: 0, distinctDexNumbers: 0 }],
    ]);

    await convertRoot(path.join(root, 'data'), ['en'], ranges, new Map(), undefined, 1, statsByLanguage, outputRoot);

    expect(statsByLanguage.get('en')?.distinctDexNumbers).toBe(1);
    expect(statsByLanguage.get('en')?.cardsWritten).toBe(1);
  });
});
