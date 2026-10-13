import { describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { boosterRules, drawBooster } from '../packages/content/src/boosters';
import { emptyRewards, grantBooster, parseRewards } from '../apps/web/src/boosterRewards';

const cards = Object.values(registry.cards);

describe('five-card booster rewards', () => {
  it('draws five known cards, allowing duplicates even with a tiny catalogue', () => {
    const ids = drawBooster(cards, () => 0);
    expect(ids).toHaveLength(boosterRules.cardsPerPack);
    expect(ids.every(id => registry.cards[id])).toBe(true);
    expect(new Set(ids).size).toBe(1);
  });
  it('uses rarity weights per slot rather than per card', () => {
    for (const [roll, rarity] of [[0, 'common'], [.699, 'common'], [.7, 'rare'], [.949, 'rare'], [.95, 'legendary'], [.999, 'legendary']] as const) {
      expect(drawBooster(cards, () => roll).every(id => registry.cards[id].rarity === rarity)).toBe(true);
    }
  });
  it('renormalizes available rarities and rejects an empty pool or invalid randomness', () => {
    const rare = cards.filter(card => card.rarity === 'rare');
    expect(drawBooster(rare, () => .99).every(id => registry.cards[id].rarity === 'rare')).toBe(true);
    expect(() => drawBooster([])).toThrow('No cards');
    for (const value of [-1, 1, NaN]) expect(() => drawBooster(cards, () => value)).toThrow('randomness');
  });
  it('grants all copies once, tracks new cards and preserves the previous collection', () => {
    const original = emptyRewards();
    const ids = ['crown-recruit', 'crown-recruit', 'runeguard', 'cleansing-light', 'crown-recruit'];
    const first = grantBooster(original, ids);
    expect(first.collection.boostersOpened).toBe(1);
    expect(Object.values(first.collection.counts).reduce((a,b)=>a+b,0)).toBe(5);
    expect(first.collection.counts['crown-recruit']).toBe(3);
    expect(first.cards.map(card=>card.isNew)).toEqual([true, false, true, true, false]);
    expect(first.cards.map(card=>card.copies)).toEqual([1, 2, 1, 1, 3]);
    expect(original).toEqual(emptyRewards());
    const second = grantBooster(first.collection, ids);
    expect(second.collection.boostersOpened).toBe(2);
    expect(second.collection.counts['crown-recruit']).toBe(6);
    expect(second.cards.every(card=>!card.isNew)).toBe(true);
    expect(first.collection.counts['crown-recruit']).toBe(3);
    expect(parseRewards(JSON.stringify(second.collection))).toEqual(second.collection);
  });
  it('keeps retired rewards and safely handles missing or malformed storage', () => {
    const old = { version:1, boostersOpened:1, counts:{ 'retired-card':5 } };
    expect(parseRewards(JSON.stringify(old))).toEqual(old);
    for (const raw of [null, '{', '[]', JSON.stringify({...old, counts:{'bad':-2}}), JSON.stringify({...old, boostersOpened:'1'}), JSON.stringify({...old, version:2})]) {
      expect(parseRewards(raw)).toEqual(emptyRewards());
    }
  });
});

describe('faction booster packs', () => {
  it('draw only from their faction, and the general pack from everything', async () => {
    const { boosterPacks, packCards } = await import('../packages/content/src/boosters');
    const all = Object.values(registry.cards);
    for (const faction of ['crownlands','winter-league','neutral']) {
      const pack={id:faction,name:faction,blurb:'Legacy faction pool',faction};
      const pool = packCards(all, pack);
      expect(pool.length).toBeGreaterThan(0);
      const inPack = (card: { factions: readonly string[] }) => pack.faction === 'neutral' ? card.factions.length === 0 : card.factions.includes(pack.faction as never);
      expect(pool.every(inPack)).toBe(true);
      expect(drawBooster(pool).every(id => inPack(registry.cards[id]))).toBe(true);
    }
    expect(packCards(all, boosterPacks[0])).toHaveLength(all.length);
  });
});
