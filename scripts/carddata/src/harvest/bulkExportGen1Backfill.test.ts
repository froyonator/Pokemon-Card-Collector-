import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeMissingSet } from './mergeHarvest';
import type { CardRecord } from '../augmentFromSupplemental';
import {
  buildBackfillSetResult,
  buildGen1BackfillCards,
  classifyAvailability,
  classifyJob,
  loadSetCards,
  resolveBackfillSetName,
  summarizeAvailability,
  type SetAvailabilityResult,
} from './bulkExportGen1Backfill';
import type { HarvestJob } from './harvestJobs';
import type { BulkExportCard } from '../bulkExportIngest';

// --- pure classification -----------------------------------------------

describe('classifyAvailability', () => {
  it('is wiki-needed when the set was not found in the bulk export at all', () => {
    const result: SetAvailabilityResult = { setId: 'x1', foundInBulkExport: false, totalCards: 0, availableCards: 0 };
    expect(classifyAvailability(result)).toBe('wiki-needed');
  });

  it('is bulk-export-sourced when the set is found with at least one card in the target language', () => {
    const result: SetAvailabilityResult = { setId: 'x1', foundInBulkExport: true, totalCards: 100, availableCards: 42 };
    expect(classifyAvailability(result)).toBe('bulk-export-sourced');
  });

  it('is not-printed when the set is found but zero cards carry the target language', () => {
    const result: SetAvailabilityResult = { setId: 'x1', foundInBulkExport: true, totalCards: 100, availableCards: 0 };
    expect(classifyAvailability(result)).toBe('not-printed');
  });
});

describe('summarizeAvailability', () => {
  const cards: BulkExportCard[] = [
    { name: { en: 'Bulbasaur', fr: 'Bulbizarre' }, set: { id: 's1', name: {}, serie: { id: 'se1', name: {} } } },
    { name: { en: 'Ivysaur' }, set: { id: 's1', name: {}, serie: { id: 'se1', name: {} } } },
  ];

  it('counts total and per-language-available cards', () => {
    expect(summarizeAvailability('s1', cards, 'en')).toEqual({
      setId: 's1',
      foundInBulkExport: true,
      totalCards: 2,
      availableCards: 2,
    });
    expect(summarizeAvailability('s1', cards, 'fr')).toEqual({
      setId: 's1',
      foundInBulkExport: true,
      totalCards: 2,
      availableCards: 1,
    });
    expect(summarizeAvailability('s1', cards, 'de')).toEqual({
      setId: 's1',
      foundInBulkExport: true,
      totalCards: 2,
      availableCards: 0,
    });
  });
});

// --- Gen1 backfill card conversion (pure) --------------------------------

describe('buildGen1BackfillCards', () => {
  const gen1Card: BulkExportCard = {
    name: { en: 'Bulbasaur', fr: 'Bulbizarre' },
    rarity: 'Common',
    dexId: [1],
    set: { id: 'base1', name: {}, serie: { id: 'base', name: {} } },
  };
  const gen2Card: BulkExportCard = {
    name: { en: 'Chikorita', fr: 'Germignon' },
    rarity: 'Common',
    dexId: [152],
    set: { id: 'base1', name: {}, serie: { id: 'base', name: {} } },
  };
  const notInFrCard: BulkExportCard = {
    name: { en: 'Squirtle' },
    rarity: 'Common',
    dexId: [7],
    set: { id: 'base1', name: {}, serie: { id: 'base', name: {} } },
  };
  const noDexCard: BulkExportCard = {
    name: { en: 'Potion', fr: 'Potion' },
    rarity: 'Common',
    set: { id: 'base1', name: {}, serie: { id: 'base', name: {} } },
  };

  it('keeps only Gen1-range (dex 1-151), in-language cards', () => {
    const cards = buildGen1BackfillCards(
      [
        { localId: '1', card: gen1Card },
        { localId: '2', card: gen2Card },
        { localId: '3', card: notInFrCard },
        { localId: '4', card: noDexCard },
      ],
      'fr',
      undefined,
      undefined
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ dexNumber: 1, name: 'Bulbizarre', localId: '1', cardNumber: '1' });
  });

  it('translates rarity via the supplied dictionary, falling back to the raw value', () => {
    const frDict = { rarity: { Common: 'Commune' } };
    const [translated] = buildGen1BackfillCards([{ localId: '1', card: gen1Card }], 'fr', frDict, undefined);
    expect(translated.rarity).toBe('Commune');

    const [untranslated] = buildGen1BackfillCards([{ localId: '1', card: gen1Card }], 'fr', undefined, undefined);
    expect(untranslated.rarity).toBe('Common');
  });

  it('resolves an image URL from the availability index and sets imageMissing accordingly', () => {
    const index = { fr: { base: { base1: { '1': 1 } } } };
    const [withImage] = buildGen1BackfillCards([{ localId: '1', card: gen1Card }], 'fr', undefined, index);
    expect(withImage.imageUrl).toBe('https://assets.tcgdex.net/fr/base/base1/1');
    expect(withImage.imageMissing).toBe(false);

    const [withoutImage] = buildGen1BackfillCards([{ localId: '1', card: gen1Card }], 'fr', undefined, undefined);
    expect(withoutImage.imageUrl).toBeNull();
    expect(withoutImage.imageMissing).toBe(true);
  });

  it('takes only the first qualifying dex number for a multi-dex card', () => {
    const multiDex: BulkExportCard = {
      name: { en: 'Multi', fr: 'Multi FR' },
      rarity: 'Rare',
      dexId: [3, 6, 9],
      set: { id: 'base1', name: {}, serie: { id: 'base', name: {} } },
    };
    const [card] = buildGen1BackfillCards([{ localId: '5', card: multiDex }], 'fr', undefined, undefined);
    expect(card.dexNumber).toBe(3);
  });
});

// --- setName resolution ---------------------------------------------------

describe('resolveBackfillSetName', () => {
  const job: HarvestJob = {
    language: 'fr',
    setName: 'Expedition Base Set (TCG)',
    proposedSetId: 'ecard1',
    cardCount: 99,
    releaseDate: null,
  };

  it('prefers the bulk export set object\'s own localized name when present', () => {
    expect(resolveBackfillSetName({ en: 'Expedition Base Set', fr: 'Expedition' }, 'fr', job)).toBe('Expedition');
  });

  it('falls back to the English name derived from the job article title when the language is absent', () => {
    expect(resolveBackfillSetName({ en: 'Expedition Base Set' }, 'fr', job)).toBe('Expedition Base Set');
  });

  it('falls back the same way when no set name map was found at all', () => {
    expect(resolveBackfillSetName(null, 'fr', job)).toBe('Expedition Base Set');
  });
});

// --- buildBackfillSetResult (pure) -----------------------------------------

describe('buildBackfillSetResult', () => {
  it('wraps cards into the SetHarvestResult shape with derived totals', () => {
    const cards = [
      { dexNumber: 1, name: 'A', cardArticleTitle: 'A', cardNumber: '1', localId: '1', rarity: 'Common', regulationMark: null, imageFileTitle: null, imageUrl: 'https://x/1', imageMissing: false },
      { dexNumber: 2, name: 'B', cardArticleTitle: 'B', cardNumber: '2', localId: '2', rarity: 'Common', regulationMark: null, imageFileTitle: null, imageUrl: null, imageMissing: true },
    ];
    const result = buildBackfillSetResult('fr', 'base1', 'Base Set', cards, '2026-01-01T00:00:00.000Z');
    expect(result).toEqual({
      language: 'fr',
      setId: 'base1',
      setName: 'Base Set',
      sourceArticleTitle: 'bulk-export-backfill',
      sourceArticleTitles: [],
      harvestedAt: '2026-01-01T00:00:00.000Z',
      totalRows: 2,
      gen1Count: 2,
      imagesResolved: 1,
      cards,
    });
  });
});

// --- dedupKey compatibility with mergeHarvest -------------------------------

describe('backfill output merges cleanly through mergeMissingSet (dedupKey compatibility)', () => {
  it('adds a new card and skips one already held by localId', () => {
    const cards = [
      { dexNumber: 1, name: 'Bulbizarre', cardArticleTitle: 'Bulbizarre', cardNumber: '1', localId: '1', rarity: 'Commune', regulationMark: null, imageFileTitle: null, imageUrl: 'https://assets.tcgdex.net/fr/base/base1/1', imageMissing: false },
      { dexNumber: 4, name: 'Salameche', cardArticleTitle: 'Salameche', cardNumber: '4', localId: '4', rarity: 'Rare', regulationMark: null, imageFileTitle: null, imageUrl: 'https://assets.tcgdex.net/fr/base/base1/4', imageMissing: false },
    ];
    const harvested = buildBackfillSetResult('fr', 'base1', 'Base Set', cards, '2026-01-01T00:00:00.000Z');

    const existing: Record<string, CardRecord[]> = {
      '1': [
        {
          id: 'wk-fr-base1-1',
          name: 'Bulbizarre (already held)',
          dexNumber: 1,
          setId: 'base1',
          setName: 'Base Set',
          localId: '1',
          rarity: 'Commune',
          imageBase: '',
          language: 'fr',
        },
      ],
    };

    const outcome = mergeMissingSet(existing, harvested);
    expect(outcome.aborted).toBe(false);
    expect(outcome.skippedExisting).toBe(1);
    expect(outcome.added).toBe(1);
    expect(existing['4']?.[0]?.name).toBe('Salameche');
  });
});

// --- filesystem-backed integration: loadSetCards + classifyJob -------------

// Deliberately no spaces in any directory/file name here -- vitest routes
// dynamic import() through Vite's own dev transform pipeline for these
// fixture-backed tests, which (unlike the real tsx CLI runtime this module
// actually ships on) does not reliably resolve on-disk paths containing
// spaces on Windows. bulkExportIngest.test.ts's own fixture tree made the
// same choice for the same reason.
async function writeAvailabilityFixture(root: string): Promise<void> {
  const setDir = path.join(root, 'data', 'BaseSerie', 'BaseSet');
  await mkdir(setDir, { recursive: true });
  await writeFile(
    path.join(root, 'data', 'BaseSerie.ts'),
    `export default { id: 'base', name: { en: 'Base' } };\n`,
    'utf8'
  );
  await writeFile(
    path.join(root, 'data', 'BaseSerie', 'BaseSet.ts'),
    `import serie from '../BaseSerie';\nexport default { id: 'base1', name: { en: 'Base Set' }, serie };\n`,
    'utf8'
  );
  await writeFile(
    path.join(setDir, '1.ts'),
    `import set from '../BaseSet';\nexport default { name: { en: 'Bulbasaur', fr: 'Bulbizarre' }, rarity: 'Common', set, dexId: [1] };\n`,
    'utf8'
  );
  await writeFile(
    path.join(setDir, '2.ts'),
    `import set from '../BaseSet';\nexport default { name: { en: 'Ivysaur' }, rarity: 'Uncommon', set, dexId: [2] };\n`,
    'utf8'
  );

  // A second set that exists in the bulk export but carries NO fr names at all (not-printed).
  const neverPrintedDir = path.join(root, 'data', 'BaseSerie', 'NeverPrintedFr');
  await mkdir(neverPrintedDir, { recursive: true });
  await writeFile(
    path.join(root, 'data', 'BaseSerie', 'NeverPrintedFr.ts'),
    `import serie from '../BaseSerie';\nexport default { id: 'neverfr', name: { en: 'Never Printed FR' }, serie };\n`,
    'utf8'
  );
  await writeFile(
    path.join(neverPrintedDir, '1.ts'),
    `import set from '../NeverPrintedFr';\nexport default { name: { en: 'Only En' }, rarity: 'Common', set, dexId: [3] };\n`,
    'utf8'
  );
}

describe('loadSetCards', () => {
  it('loads every card file directly inside a set directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-eu-fixture-'));
    await writeAvailabilityFixture(root);

    const cards = await loadSetCards(path.join(root, 'data', 'BaseSerie', 'BaseSet'));
    expect(cards.map((c) => c.localId).sort()).toEqual(['1', '2']);
  });

  it('returns an empty list for a directory that does not exist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-eu-fixture-'));
    await writeAvailabilityFixture(root);

    const cards = await loadSetCards(path.join(root, 'data', 'BaseSerie', 'Nonexistent'));
    expect(cards).toEqual([]);
  });
});

describe('classifyJob (end to end against a fixture bulk export tree)', () => {
  const baseJob: HarvestJob = {
    language: 'fr',
    setName: 'Base Set (TCG)',
    proposedSetId: 'base1',
    cardCount: 2,
    releaseDate: null,
  };

  it('classifies a set with in-language cards as bulk-export-sourced', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-eu-fixture-'));
    await writeAvailabilityFixture(root);
    const { buildSetIdIndex } = await import('../bulkExportIngest');
    const index = await buildSetIdIndex(path.join(root, 'data'));

    const classification = await classifyJob(index, baseJob, 'fr');
    expect(classification.bucket).toBe('bulk-export-sourced');
    expect(classification.availability).toEqual({ setId: 'base1', foundInBulkExport: true, totalCards: 2, availableCards: 1 });
    expect(classification.cards).toHaveLength(2);
  });

  it('classifies a set present in the bulk export with zero fr cards as not-printed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-eu-fixture-'));
    await writeAvailabilityFixture(root);
    const { buildSetIdIndex } = await import('../bulkExportIngest');
    const index = await buildSetIdIndex(path.join(root, 'data'));

    const job: HarvestJob = { ...baseJob, proposedSetId: 'neverfr', setName: 'Never Printed FR (TCG)' };
    const classification = await classifyJob(index, job, 'fr');
    expect(classification.bucket).toBe('not-printed');
    expect(classification.cards).toEqual([]);
  });

  it('classifies a setId absent from the bulk export entirely as wiki-needed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'carddata-eu-fixture-'));
    await writeAvailabilityFixture(root);
    const { buildSetIdIndex } = await import('../bulkExportIngest');
    const index = await buildSetIdIndex(path.join(root, 'data'));

    const job: HarvestJob = { ...baseJob, proposedSetId: 'doesnotexist', setName: 'Does Not Exist (TCG)' };
    const classification = await classifyJob(index, job, 'fr');
    expect(classification.bucket).toBe('wiki-needed');
    expect(classification.availability.foundInBulkExport).toBe(false);
  });
});
