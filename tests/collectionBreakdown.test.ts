import { describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { collectionStats, cardCost } from '../apps/web/src/collectionBreakdown';
import { ownershipLimit } from '../apps/web/src/collection';

const cards = Object.values(registry.cards);
describe('collection statistics', () => {
  it('counts nothing for an empty collection', () => {
    const stats = collectionStats({}, registry);
    expect(stats.unique).toBe(0);
    expect(stats.uniqueTotal).toBe(cards.length);
    expect(stats.copies).toBe(0);
    expect(stats.playsets).toBe(0);
    expect(stats.missing).toHaveLength(cards.length);
  });
  it('counts a complete collection and caps copies at the ownership limit', () => {
    const owned = Object.fromEntries(cards.map(card => [card.id, ownershipLimit(card) + 5]));
    const stats = collectionStats(owned, registry);
    expect(stats.unique).toBe(cards.length);
    expect(stats.copies).toBe(stats.copiesTotal);
    expect(stats.playsets).toBe(cards.length);
    expect(stats.missing).toEqual([]);
  });
  it('breaks the totals down consistently', () => {
    const [first, second] = cards;
    const stats = collectionStats({ [first.id]: 1, [second.id]: 2, 'not-a-card': 9 }, registry);
    expect(stats.unique).toBe(2);
    expect(stats.copies).toBe(Math.min(1, ownershipLimit(first)) + Math.min(2, ownershipLimit(second)));
    for (const group of [stats.byRarity, stats.byType]) {
      expect(group.reduce((sum, slice) => sum + slice.unique, 0)).toBe(2);
      expect(group.reduce((sum, slice) => sum + slice.uniqueTotal, 0)).toBe(cards.length);
    }
    expect(stats.curve.reduce((sum, bucket) => sum + bucket.unique, 0)).toBe(2);
    expect(stats.curve.reduce((sum, bucket) => sum + bucket.uniqueTotal, 0)).toBe(cards.length);
    expect(stats.curve.at(-1)!.cost).toBe(Math.max(...cards.map(cardCost)));
    // A card shared by two factions counts toward both, so faction totals can exceed the card count.
    expect(stats.byFaction.reduce((sum, slice) => sum + slice.uniqueTotal, 0)).toBe(cards.reduce((sum, card) => sum + (card.factions.length || 1), 0));
    expect(stats.byFaction.map(slice => slice.id)).toContain('neutral');
  });
  it('lists missing cards rarest first', () => {
    const missing = collectionStats({}, registry).missing;
    expect(missing[0].rarity).toBe('legendary');
    expect(missing.at(-1)!.rarity).toBe('common');
  });
});
