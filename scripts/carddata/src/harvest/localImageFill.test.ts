// scripts/carddata/src/harvest/localImageFill.test.ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../augmentFromSupplemental';
import { bestSourceImage, fillLocalImages, hasNoImageAtAll, parseArgs, runLocalFill } from './localImageFill';

function card(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id: 'base1-44',
    name: 'Bulbasaur',
    dexNumber: 1,
    setId: 'base1',
    setName: 'Base Set',
    localId: '44',
    rarity: 'Common',
    imageBase: '',
    language: 'en',
    ...overrides,
  };
}

describe('hasNoImageAtAll', () => {
  it('is true when imageBase and both hosted fields are empty', () => {
    expect(hasNoImageAtAll(card({ imageBase: '', hostedThumbUrl: undefined, hostedFullUrl: undefined }))).toBe(true);
  });

  it('is false when imageBase is set', () => {
    expect(hasNoImageAtAll(card({ imageBase: 'https://example.invalid/base' }))).toBe(false);
  });

  it('is false when a hosted url is set even with no imageBase', () => {
    expect(hasNoImageAtAll(card({ hostedThumbUrl: 'https://example.invalid/thumb.webp' }))).toBe(false);
  });
});

describe('bestSourceImage', () => {
  it('prefers already-resolved hosted urls over deriving from imageBase', () => {
    const source = card({
      imageBase: 'https://assets.example.invalid/en/base/base1/44',
      hostedThumbUrl: 'https://raw.example.invalid/en/base1/base1-44/thumb.webp',
      hostedFullUrl: 'https://raw.example.invalid/en/base1/base1-44/original.webp',
    });
    expect(bestSourceImage(source)).toEqual({
      thumbUrl: 'https://raw.example.invalid/en/base1/base1-44/thumb.webp',
      fullUrl: 'https://raw.example.invalid/en/base1/base1-44/original.webp',
    });
  });

  it('derives a pcc-assets-a url from imageBase when no hosted url is set yet', () => {
    const source = card({ id: 'base1-44', language: 'en', setId: 'base1', imageBase: 'https://assets.example.invalid/en/base/base1/44' });
    const result = bestSourceImage(source);
    expect(result?.thumbUrl).toBe('https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/en/base1/base1-44/thumb.webp');
    expect(result?.fullUrl).toBe('https://raw.githubusercontent.com/froyonator/pcc-assets-a/main/en/base1/base1-44/original.webp');
  });

  it('returns null when the source card has no image at all', () => {
    expect(bestSourceImage(card({ imageBase: '' }))).toBeNull();
  });
});

describe('fillLocalImages', () => {
  it('fills a target card with no image from the same-print English card', () => {
    const en: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', hostedThumbUrl: 'https://en.example.invalid/thumb.webp', hostedFullUrl: 'https://en.example.invalid/original.webp' })],
    };
    const de: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', name: 'Bisasam', language: 'de', setName: 'Grundset', rarity: 'Häufig', imageBase: '' })],
    };

    const outcome = fillLocalImages(de, en, 'de', 'en');

    expect(outcome).toEqual({ targetLanguage: 'de', sourceLanguage: 'en', candidates: 1, filled: 1, stillMissing: 0 });
    expect(de['1'][0].hostedThumbUrl).toBe('https://en.example.invalid/thumb.webp');
    expect(de['1'][0].hostedFullUrl).toBe('https://en.example.invalid/original.webp');
    // imageBase must stay untouched -- this pass never claims the primary
    // source itself had an image for this card.
    expect(de['1'][0].imageBase).toBe('');
    // The target's own text fields are untouched.
    expect(de['1'][0].name).toBe('Bisasam');
    expect(de['1'][0].rarity).toBe('Häufig');
  });

  it('leaves a target card untouched when there is no English counterpart at that setId/localId', () => {
    const en: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', hostedThumbUrl: 'https://en.example.invalid/thumb.webp' })],
    };
    const de: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base2-99', setId: 'base2', localId: '99', language: 'de', imageBase: '' })],
    };

    const outcome = fillLocalImages(de, en, 'de', 'en');

    expect(outcome).toEqual({ targetLanguage: 'de', sourceLanguage: 'en', candidates: 1, filled: 0, stillMissing: 1 });
    expect(de['1'][0].hostedThumbUrl).toBeUndefined();
    expect(de['1'][0].hostedFullUrl).toBeUndefined();
  });

  it('leaves a target card untouched when the English counterpart is dark too', () => {
    const en: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', imageBase: '' })],
    };
    const de: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', language: 'de', imageBase: '' })],
    };

    const outcome = fillLocalImages(de, en, 'de', 'en');

    expect(outcome.filled).toBe(0);
    expect(outcome.stillMissing).toBe(1);
  });

  it('never touches a target card that already has an image', () => {
    const en: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', hostedThumbUrl: 'https://en.example.invalid/thumb.webp' })],
    };
    const de: Record<string, CardRecord[]> = {
      '1': [
        card({
          id: 'base1-44',
          language: 'de',
          imageBase: '',
          hostedThumbUrl: 'https://de.example.invalid/existing-thumb.webp',
          hostedFullUrl: 'https://de.example.invalid/existing-original.webp',
        }),
      ],
    };

    const outcome = fillLocalImages(de, en, 'de', 'en');

    expect(outcome.candidates).toBe(0);
    expect(outcome.filled).toBe(0);
    expect(de['1'][0].hostedThumbUrl).toBe('https://de.example.invalid/existing-thumb.webp');
  });

  it('matches setId case-insensitively and localId with leading zeros stripped (dedupKey normalization)', () => {
    const en: Record<string, CardRecord[]> = {
      '1': [card({ id: 'SV2A-001', setId: 'SV2A', localId: '001', hostedThumbUrl: 'https://en.example.invalid/thumb.webp' })],
    };
    const de: Record<string, CardRecord[]> = {
      '1': [card({ id: 'sv2a-1', setId: 'sv2a', localId: '1', language: 'de', imageBase: '' })],
    };

    const outcome = fillLocalImages(de, en, 'de', 'en');
    expect(outcome.filled).toBe(1);
    expect(de['1'][0].hostedThumbUrl).toBe('https://en.example.invalid/thumb.webp');
  });
});

describe('parseArgs', () => {
  it('defaults to dry-run with no language filter', () => {
    expect(parseArgs([])).toEqual({ write: false, onlyLanguage: undefined });
  });

  it('parses --write and --lang', () => {
    expect(parseArgs(['--write', '--lang', 'de'])).toEqual({ write: true, onlyLanguage: 'de' });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
  });
});

describe('runLocalFill (dry-run vs --write)', () => {
  async function makeCardsDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'carddata-local-fill-'));
    const en: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', hostedThumbUrl: 'https://en.example.invalid/thumb.webp', hostedFullUrl: 'https://en.example.invalid/original.webp' })],
    };
    const de: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', name: 'Bisasam', language: 'de', imageBase: '' })],
    };
    await writeFile(path.join(dir, 'en.json'), JSON.stringify(en), 'utf8');
    await writeFile(path.join(dir, 'de.json'), JSON.stringify(de), 'utf8');
    return dir;
  }

  it('dry-run reports the fill but does not write the target file', async () => {
    const dir = await makeCardsDir();
    const before = await readFile(path.join(dir, 'de.json'), 'utf8');

    const outcomes = await runLocalFill(dir, [{ targetLanguage: 'de', sourceLanguage: 'en' }], false);

    expect(outcomes[0]).toMatchObject({ filled: 1, candidates: 1 });
    const after = await readFile(path.join(dir, 'de.json'), 'utf8');
    expect(after).toBe(before);
    expect(after).not.toContain('hostedThumbUrl');
  });

  it('--write persists the filled hosted urls to the target file', async () => {
    const dir = await makeCardsDir();

    const outcomes = await runLocalFill(dir, [{ targetLanguage: 'de', sourceLanguage: 'en' }], true);

    expect(outcomes[0]).toMatchObject({ filled: 1, candidates: 1 });
    const after = JSON.parse(await readFile(path.join(dir, 'de.json'), 'utf8')) as Record<string, CardRecord[]>;
    expect(after['1'][0].hostedThumbUrl).toBe('https://en.example.invalid/thumb.webp');
    expect(after['1'][0].hostedFullUrl).toBe('https://en.example.invalid/original.webp');
  });

  it('--write does not rewrite a target file when nothing was filled', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'carddata-local-fill-'));
    const en: Record<string, CardRecord[]> = { '1': [card({ id: 'other-set-1', setId: 'other', imageBase: '' })] };
    const de: Record<string, CardRecord[]> = {
      '1': [card({ id: 'base1-44', language: 'de', imageBase: '', hostedThumbUrl: 'https://de.example.invalid/already.webp' })],
    };
    await writeFile(path.join(dir, 'en.json'), JSON.stringify(en), 'utf8');
    const deBefore = JSON.stringify(de);
    await writeFile(path.join(dir, 'de.json'), deBefore, 'utf8');

    const outcomes = await runLocalFill(dir, [{ targetLanguage: 'de', sourceLanguage: 'en' }], true);

    expect(outcomes[0].filled).toBe(0);
    const after = await readFile(path.join(dir, 'de.json'), 'utf8');
    expect(after).toBe(deBefore);
  });
});
