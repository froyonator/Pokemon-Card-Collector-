// scripts/carddata/src/harvest/mergeHarvest.test.ts
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { applyEnrichment, harvestedCardToRecord, mergeMissingSet } from './mergeHarvest';
import type { EnrichmentResult, HarvestedCard, SetHarvestResult } from './runHarvest';

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

  it('returns null for a card with no resolved image', () => {
    expect(harvestedCardToRecord(card({ imageUrl: null, imageMissing: true }), 'en', 'm11', 'X')).toBeNull();
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

  it('skips a candidate row with no resolved image without counting it as existing', () => {
    const existing: Record<string, CardRecord[]> = {};
    const outcome = mergeMissingSet(
      existing,
      harvestResult({ cards: [card({ imageUrl: null, imageMissing: true })] })
    );
    expect(outcome.added).toBe(0);
    expect(outcome.skippedNoImage).toBe(1);
    expect(outcome.candidateCount).toBe(0);
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
