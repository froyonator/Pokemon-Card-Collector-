import { describe, expect, it } from 'vitest';
import { activeRarities, availableCardsForDex, computeTileState } from './selectors';
import type { CardRecord, RarityGroup } from '../types';

const groups: RarityGroup[] = [
  { id: 'a', name: 'A', rarities: ['Ultra Rare'] },
  { id: 'b', name: 'B', rarities: ['Secret Rare'] },
];

const cards: CardRecord[] = [
  {
    id: '1',
    name: 'Card 1',
    dexNumber: 6,
    setId: 's1',
    setName: 'Set 1',
    localId: '1',
    rarity: 'Ultra Rare',
    imageBase: 'https://x/1',
    language: 'en',
  },
  {
    id: '2',
    name: 'Card 2',
    dexNumber: 6,
    setId: 's2',
    setName: 'Set 2',
    localId: '2',
    rarity: 'Secret Rare',
    imageBase: 'https://x/2',
    language: 'en',
  },
];

describe('activeRarities', () => {
  it('collects rarities only from active groups', () => {
    const set = activeRarities(groups, ['a']);
    expect(set.has('Ultra Rare')).toBe(true);
    expect(set.has('Secret Rare')).toBe(false);
  });
});

describe('availableCardsForDex', () => {
  it('filters cards to only those in the active rarity set', () => {
    const set = activeRarities(groups, ['a']);
    const result = availableCardsForDex(cards, set);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

describe('computeTileState', () => {
  it('returns owned when the Pokemon has an owned record, regardless of availability', () => {
    expect(computeTileState(true, 0)).toBe('owned');
    expect(computeTileState(true, 3)).toBe('owned');
  });

  it('returns unavailable when not owned and there are zero available cards', () => {
    expect(computeTileState(false, 0)).toBe('unavailable');
  });

  it('returns available when not owned and there is at least one available card', () => {
    expect(computeTileState(false, 1)).toBe('available');
  });
});
