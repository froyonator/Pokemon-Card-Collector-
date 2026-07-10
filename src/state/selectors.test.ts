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

  it('includes a card via a manual override into an active group, even when its raw rarity would not match', () => {
    const set = activeRarities(groups, ['a']);
    const promoCard: CardRecord = { ...cards[1], id: '3', rarity: 'Promo' };
    const result = availableCardsForDex([...cards, promoCard], set, { '3': 'a' }, ['a']);
    expect(result.map((c) => c.id).sort()).toEqual(['1', '3']);
  });

  it('excludes a card via a manual override into a group that is not active, even when its raw rarity would match', () => {
    const set = activeRarities(groups, ['a']);
    // cards[0] has rarity 'Ultra Rare', which matches group 'a' (active).
    // The override reassigns it to group 'b', which is NOT active here.
    const result = availableCardsForDex(cards, set, { [cards[0].id]: 'b' }, ['a']);
    expect(result).toHaveLength(0);
  });

  it('falls back to raw rarity matching when no override is given', () => {
    const set = activeRarities(groups, ['a']);
    const result = availableCardsForDex(cards, set, {}, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

describe('computeTileState', () => {
  it('returns owned when the Pokemon has an owned record, regardless of availability', () => {
    expect(computeTileState(true, 0, false)).toBe('owned');
    expect(computeTileState(true, 3, false)).toBe('owned');
  });

  it('returns owned even while still loading, since ownership is known synchronously from the owned store, not from the async card-data fetch', () => {
    expect(computeTileState(true, 0, true)).toBe('owned');
  });

  it('returns loading when not owned and the dex number is still loading, regardless of availableCount', () => {
    expect(computeTileState(false, 0, true)).toBe('loading');
    expect(computeTileState(false, 5, true)).toBe('loading');
  });

  it('returns unavailable when not owned, not loading, and there are zero available cards', () => {
    expect(computeTileState(false, 0, false)).toBe('unavailable');
  });

  it('returns available when not owned, not loading, and there is at least one available card', () => {
    expect(computeTileState(false, 1, false)).toBe('available');
  });
});
