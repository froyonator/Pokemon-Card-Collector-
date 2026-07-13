// scripts/carddata/src/harvest/mergeHarvest.test.ts
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { applyEnrichment, harvestedCardToRecord, mergeImages, mergeMissingSet } from './mergeHarvest';
import type { EnrichmentResult, HarvestedCard, ImageHarvestResult, SetHarvestResult } from './runHarvest';

function card(overrides: Partial<HarvestedCard> = {}): HarvestedCard {
  return {
    dexNumber: 25,
    name: 'Pikachu',
    cardArticleTitle: 'Pikachu (Test Set 1)',
    cardNumber: '001/012',
    localId: '001',
    rarity: 'Common',
    regulationMark: null,
    imageFileTitle: 'File:PikachuTestSet1.jpg',
    imageUrl: 'https://example.invalid/File:PikachuTestSet1.jpg',
    imageMissing: false,
    ...overrides,
  };
}

describe('harvestedCardToRecord', () => {
  it('builds a CardRecord with the wk-<lang>-<setId>-<localId> id scheme', () => {
    const record = harvestedCardToRecord(card(), 'en', 'm11', 'McDonald’s Collection 2011');
    expect(record).toMatchObject({
      id: 'wk-en-m11-001',
      dexNumber: 25,
      setId: 'm11',
      localId: '001',
      rarity: 'Common',
      language: 'en',
      hostedThumbUrl: 'https://example.invalid/File:PikachuTestSet1.jpg',
      hostedFullUrl: 'https://example.invalid/File:PikachuTestSet1.jpg',
    });
  });

  it('keeps a card with no resolved image, leaving hosted image fields absent for the image passes to fill', () => {
    const record = harvestedCardToRecord(card({ imageUrl: null, imageMissing: true }), 'en', 'm11', 'X');
    expect(record).not.toBeNull();
    expect(record?.hostedThumbUrl).toBeUndefined();
    expect(record?.hostedFullUrl).toBeUndefined();
  });

  it('falls back to Unknown rarity when the row had none', () => {
    const record = harvestedCardToRecord(card({ rarity: null }), 'en', 'm11', 'X');
    expect(record?.rarity).toBe('Unknown');
  });
});

function harvestResult(overrides: Partial<SetHarvestResult> = {}): SetHarvestResult {
  return {
    language: 'en',
    setId: 'm11',
    setName: "McDonald's Collection 2011",
    sourceArticleTitle: "McDonald's Collection 2011 (TCG)",
    harvestedAt: '2026-07-13T00:00:00.000Z',
    totalRows: 1,
    gen1Count: 1,
    imagesResolved: 1,
    cards: [card()],
    ...overrides,
  };
}

describe('mergeMissingSet', () => {
  it('adds a brand-new card that does not collide with anything held', () => {
    const existing: Record<string, CardRecord[]> = {};
    const outcome = mergeMissingSet(existing, harvestResult());
    expect(outcome.aborted).toBe(false);
    expect(outcome.added).toBe(1);
    expect(existing['25']).toHaveLength(1);
    expect(existing['25'][0].id).toBe('wk-en-m11-001');
  });

  it('dedups against an existing record with the same normalized setId + localId', () => {
    const existing: Record<string, CardRecord[]> = {
      '25': [
        {
          id: 'existing-1',
          name: 'Pikachu',
          dexNumber: 25,
          setId: 'M11',
          setName: "McDonald's Collection 2011",
          localId: '1',
          rarity: 'Common',
          imageBase: '',
          language: 'en',
        },
      ],
    };
    const outcome = mergeMissingSet(existing, harvestResult());
    expect(outcome.added).toBe(0);
    expect(outcome.skippedExisting).toBe(1);
    expect(existing['25']).toHaveLength(1);
  });

  it('merges a candidate row with no resolved image so a later image pass can fill it', () => {
    const existing: Record<string, CardRecord[]> = {};
    const outcome = mergeMissingSet(
      existing,
      harvestResult({ cards: [card({ imageUrl: null, imageMissing: true })] })
    );
    expect(outcome.added).toBe(1);
    expect(outcome.skippedNoImage).toBe(0);
    expect(outcome.candidateCount).toBe(1);
    const merged = existing['25']?.[0];
    expect(merged?.hostedThumbUrl).toBeUndefined();
  });

  it('aborts and writes nothing when overlap with existing data is implausibly high', () => {
    const existing: Record<string, CardRecord[]> = {};
    const cards: HarvestedCard[] = [];
    for (let i = 1; i <= 10; i++) {
      const localId = String(i).padStart(3, '0');
      cards.push(card({ localId, cardNumber: `${localId}/012` }));
      existing[String(25)] ??= [];
      existing['25'].push({
        id: `pre-${i}`,
        name: 'Pikachu',
        dexNumber: 25,
        setId: 'm11',
        setName: 'X',
        localId,
        rarity: 'Common',
        imageBase: '',
        language: 'en',
      });
    }
    const before = existing['25'].length;
    const outcome = mergeMissingSet(existing, harvestResult({ cards }));
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toMatch(/implausibly high/);
    expect(existing['25']).toHaveLength(before);
  });

  it('refuses a digital-only setId outright (this app tracks physical cards only), writing nothing', () => {
    const existing: Record<string, CardRecord[]> = {};
    const outcome = mergeMissingSet(existing, harvestResult({ setId: 'A1', setName: 'Genetic Apex' }));
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toMatch(/digital-only/);
    expect(outcome.added).toBe(0);
    expect(existing).toEqual({});
  });
});

describe('applyEnrichment', () => {
  function db(): Record<string, CardRecord[]> {
    return {
      '25': [
        {
          id: 'held-1',
          name: 'Pikachu',
          dexNumber: 25,
          setId: 'SV2a',
          setName: 'SV2a',
          localId: '166',
          rarity: 'Unknown',
          imageBase: '',
          language: 'ja',
        },
        {
          id: 'held-2',
          name: 'Raichu',
          dexNumber: 26,
          setId: 'SV2a',
          setName: 'SV2a',
          localId: '167',
          rarity: 'Rare',
          imageBase: '',
          language: 'ja',
        },
      ],
    };
  }

  function enrichment(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
    return {
      language: 'ja',
      setId: 'SV2a',
      sourceArticleTitle: 'Pokemon Card 151 (TCG)',
      realSetName: 'Pokemon Card 151',
      harvestedAt: '2026-07-13T00:00:00.000Z',
      requestedCount: 1,
      resolvedCount: 1,
      fills: [{ cardId: 'held-1', rarity: 'Common', setName: 'Pokemon Card 151' }],
      ...overrides,
    };
  }

  it('fills rarity only when the held record is missing/Unknown', () => {
    const existing = db();
    const outcome = applyEnrichment(existing, enrichment());
    expect(outcome.rarityFilled).toBe(1);
    expect(existing['25'][0].rarity).toBe('Common');
  });

  it('never overwrites a rarity we already trust', () => {
    const existing = db();
    const outcome = applyEnrichment(
      existing,
      enrichment({ fills: [{ cardId: 'held-2', rarity: 'Ultra Rare', setName: null }] })
    );
    expect(outcome.rarityFilled).toBe(0);
    expect(existing['25'][1].rarity).toBe('Rare');
  });

  it('replaces a bare-code setName with the real one', () => {
    const existing = db();
    const outcome = applyEnrichment(
      existing,
      enrichment({ fills: [{ cardId: 'held-2', rarity: null, setName: 'Pokemon Card 151' }] })
    );
    expect(outcome.setNameFilled).toBe(1);
    expect(existing['25'][1].setName).toBe('Pokemon Card 151');
  });

  it('counts a fill for a card id that is not actually held', () => {
    const existing = db();
    const outcome = applyEnrichment(
      existing,
      enrichment({ fills: [{ cardId: 'not-held', rarity: 'Common', setName: null }] })
    );
    expect(outcome.notFound).toBe(1);
    expect(outcome.rarityFilled).toBe(0);
  });

  it('never creates a new record', () => {
    const existing = db();
    const before = existing['25'].length;
    applyEnrichment(existing, enrichment({ fills: [{ cardId: 'not-held', rarity: 'Common', setName: null }] }));
    expect(existing['25']).toHaveLength(before);
  });
});

describe('mergeImages', () => {
  function db(overrides: Partial<CardRecord> = {}): Record<string, CardRecord[]> {
    return {
      '1': [
        {
          id: 'base1-44',
          name: 'Bisasam',
          dexNumber: 1,
          setId: 'base1',
          setName: 'Grundset',
          localId: '44',
          rarity: 'Häufig',
          imageBase: '',
          language: 'de',
          ...overrides,
        },
      ],
    };
  }

  function imagesResult(overrides: Partial<ImageHarvestResult> = {}): ImageHarvestResult {
    return {
      language: 'de',
      setId: 'base1',
      setName: 'Grundset',
      harvestedAt: '2026-07-13T00:00:00.000Z',
      totalCards: 1,
      imagesResolved: 1,
      cards: [
        {
          cardId: 'base1-44',
          dexNumber: 1,
          localId: '44',
          imageFileTitle: 'File:BisasamGrundset44.jpg',
          imageUrl: 'https://example.invalid/File:BisasamGrundset44.jpg',
          imageMissing: false,
        },
      ],
      ...overrides,
    };
  }

  it('fills hostedThumbUrl/hostedFullUrl on a held record with no image yet', () => {
    const existing = db();
    const outcome = mergeImages(existing, imagesResult());
    expect(outcome).toEqual({ setId: 'base1', requested: 1, filled: 1, alreadyHad: 0, notResolved: 0, notFound: 0 });
    expect(existing['1'][0].hostedThumbUrl).toBe('https://example.invalid/File:BisasamGrundset44.jpg');
    expect(existing['1'][0].hostedFullUrl).toBe('https://example.invalid/File:BisasamGrundset44.jpg');
    // imageBase is never touched by an images merge.
    expect(existing['1'][0].imageBase).toBe('');
  });

  it('never overwrites an existing hosted url', () => {
    const existing = db({ hostedThumbUrl: 'https://example.invalid/existing-thumb.webp', hostedFullUrl: 'https://example.invalid/existing-original.webp' });
    const outcome = mergeImages(existing, imagesResult());
    expect(outcome.filled).toBe(0);
    expect(outcome.alreadyHad).toBe(1);
    expect(existing['1'][0].hostedThumbUrl).toBe('https://example.invalid/existing-thumb.webp');
  });

  it('counts a card that never resolved an image as notResolved, without touching the record', () => {
    const existing = db();
    const outcome = mergeImages(
      existing,
      imagesResult({ cards: [{ cardId: 'base1-44', dexNumber: 1, localId: '44', imageFileTitle: null, imageUrl: null, imageMissing: true }] })
    );
    expect(outcome.notResolved).toBe(1);
    expect(outcome.filled).toBe(0);
    expect(existing['1'][0].hostedThumbUrl).toBeUndefined();
  });

  it('counts a cardId that is not actually held as notFound and never creates a record', () => {
    const existing: Record<string, CardRecord[]> = { '1': [] };
    const outcome = mergeImages(existing, imagesResult());
    expect(outcome.notFound).toBe(1);
    expect(outcome.filled).toBe(0);
    expect(existing['1']).toHaveLength(0);
  });

  it('fills a record held in a non-Gen1 generation file via the combined multi-generation view, in place through shared bucket references', () => {
    // Mirrors exactly how main() builds its combined view for images files:
    // per-generation objects keep their own identity, the combined object
    // just aliases their bucket arrays under "<generation>:<dex>" keys.
    const gen1Db: Record<string, CardRecord[]> = { '1': [] };
    const gen5Db: Record<string, CardRecord[]> = {
      '501': [
        {
          id: 'wk-de-bw1-1',
          name: 'Serpifeu',
          dexNumber: 501,
          setId: 'bw1',
          setName: 'Schwarz & Weiss',
          localId: '1',
          rarity: 'Common',
          imageBase: '',
          language: 'de',
        },
      ],
    };
    const combined: Record<string, CardRecord[]> = { '1:1': gen1Db['1'], '5:501': gen5Db['501'] };

    const outcome = mergeImages(
      combined,
      imagesResult({
        cards: [
          { cardId: 'wk-de-bw1-1', dexNumber: 501, localId: '1', imageFileTitle: 'File:X.jpg', imageUrl: 'https://example.invalid/X.jpg', imageMissing: false },
        ],
      })
    );

    expect(outcome.filled).toBe(1);
    expect(outcome.notFound).toBe(0);
    // The fill landed in the ORIGINAL gen5 object, not a copy.
    expect(gen5Db['501'][0].hostedThumbUrl).toBe('https://example.invalid/X.jpg');
  });

  it('accepts an images-deep chunk output unchanged -- same required shape as a plain images job plus ignored diagnostics fields', () => {
    // Simulates exactly what runHarvest.ts's --job images-deep writes to
    // data/harvest/<lang>/images-deep-<chunk>.json and what mergeHarvest.ts's
    // main() reads back via JSON.parse -- a real round trip through
    // JSON.stringify/JSON.parse, not just a same-process object literal, so
    // a field this test forgot to serialize would actually be caught.
    const deepChunkJson = JSON.stringify({
      language: 'de',
      setId: 'images-deep-chunk-0',
      setName: 'Deep image resolution chunk 0',
      harvestedAt: '2026-07-13T00:00:00.000Z',
      totalCards: 1,
      imagesResolved: 1,
      cards: [
        {
          cardId: 'base1-44',
          dexNumber: 1,
          localId: '44',
          imageFileTitle: 'File:BisasamGrundset44.jpg',
          imageUrl: 'https://example.invalid/File:BisasamGrundset44.jpg',
          imageMissing: false,
          method: 'article-search',
          skipReason: null,
        },
      ],
      // Extra fields --job images-deep writes for diagnostics only; mergeImages must ignore them, not choke on them.
      skipped: [],
      chunkIndex: 0,
    });

    const existing = db();
    const outcome = mergeImages(existing, JSON.parse(deepChunkJson) as ImageHarvestResult);
    expect(outcome).toEqual({ setId: 'images-deep-chunk-0', requested: 1, filled: 1, alreadyHad: 0, notResolved: 0, notFound: 0 });
    expect(existing['1'][0].hostedThumbUrl).toBe('https://example.invalid/File:BisasamGrundset44.jpg');
  });
});
