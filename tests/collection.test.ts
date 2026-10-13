import { describe, expect, it } from 'vitest';
import type { Registry } from '../packages/contracts/src';
import { defaultDeckId, registry as live, starterDefinitions } from '../packages/content/src';
import { boosterPacks } from '../packages/content/src/boosters';
import { collectionRules, emptyCollection, createCollection, parseCollection, openCollectionBooster,
  buyCollectionBooster, gainDebugCrowns, claimVictory, missingDeckCopies, packCount, totalPacks } from '../apps/web/src/collection';
import { addDeckCard } from '../apps/web/src/decks';
import { apply, decisionPlayer } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { startMatch } from '../apps/web/src/session';

const base = Object.values(live.cards)[0];
const common = { ...base, id: 'common', deckLimitKey: 'common', rarity: 'common' as const, legendary: false };
const rare = { ...common, id: 'rare', deckLimitKey: 'rare', rarity: 'rare' as const };
const legendary = { ...common, id: 'legendary', deckLimitKey: 'legendary', rarity: 'legendary' as const, legendary: true };
const content: Registry = { ...live, cards: { common, rare, legendary } };
const pack = boosterPacks[0];

describe('collection progression', () => {
  it('starts empty, then grants only one starter and five general boosters', () => {
    expect(emptyCollection()).toMatchObject({ counts: {}, crowns: 0, packs: {} });
    const starter = starterDefinitions.find(deck => deck.id === defaultDeckId)!;
    const collection = createCollection(live, starter.cards);
    expect(Object.values(collection.counts).reduce((sum, count) => sum + count, 0)).toBe(starter.cards.length);
    expect(missingDeckCopies(starter.cards, collection.counts)).toEqual([]);
    expect(collection.packs).toEqual({ bounty: 5 });
    expect(collection.crowns).toBe(0);
    const other = Object.keys(live.cards).find(id => !starter.cards.includes(id))!;
    expect(collection.counts[other]).toBeUndefined();
    expect(addDeckCard([], other, live, collection.counts)).toEqual([]);
    expect(parseCollection(JSON.stringify(collection), live)).toEqual(collection);
  });
  it('migrates old earned copies, dusts surplus and leaves the original rewards unchanged', () => {
    const legacy = { version: 1 as const, counts: { common: 4, legendary: 2, retired: 1 }, boostersOpened: 2 };
    const collection = createCollection(content, ['common', 'common', 'common', 'legendary'], legacy);
    expect(collection.counts).toEqual({ common: 3, legendary: 1, retired: 1 });
    expect(collection.crowns).toBe(4 * 10 + 2 * 100);
    expect(collection.boostersOpened).toBe(2);
    expect(totalPacks(collection)).toBe(5);
    expect(legacy.counts).toEqual({ common: 4, legendary: 2, retired: 1 });
    // Reading persisted state never repeats the welcome grant or migration crowns.
    expect(parseCollection(JSON.stringify(collection), content)).toEqual(collection);
  });
  it('caps each rarity and dusts duplicates within the same five-card pack', () => {
    for (const [roll, id, limit, value] of [[0, 'common', 3, 10], [.7, 'rare', 3, 25], [.95, 'legendary', 1, 100]] as const) {
      const original = createCollection(content, []);
      const opened = openCollectionBooster(original, pack, content, () => roll);
      expect(opened.cards).toHaveLength(5);
      expect(opened.collection.counts[id]).toBe(limit);
      expect(opened.cards.filter(card => card.isNew)).toHaveLength(1);
      expect(opened.cards.filter(card => card.crowns)).toHaveLength(5 - limit);
      expect(opened.crowns).toBe((5 - limit) * value);
      expect(opened.collection.crowns).toBe(opened.crowns);
      expect(packCount(opened.collection, pack.id)).toBe(4);
      expect(opened.collection.boostersOpened).toBe(1);
      expect(original.counts).toEqual({});
      expect(original.crowns).toBe(0);
      expect(totalPacks(original)).toBe(5);
    }
  });
  it('cannot open nonexistent packs or consume one on a failed draw', () => {
    const empty = emptyCollection();
    expect(() => openCollectionBooster(empty, pack, content)).toThrow('no boosters');
    const collection = createCollection(content, []);
    expect(() => openCollectionBooster(collection, pack, content, () => 1)).toThrow('randomness');
    expect(() => openCollectionBooster(collection, pack, { ...content, cards: {} })).toThrow('No cards');
    expect(totalPacks(collection)).toBe(5);
    let current = collection;
    for (let i = 0; i < 5; i++) current = openCollectionBooster(current, pack, content, () => 0).collection;
    expect(totalPacks(current)).toBe(0);
    expect(() => openCollectionBooster(current, pack, content)).toThrow('no boosters');
  });
  it('buys the chosen pack, charges exactly once and rejects an insufficient balance', () => {
    const original = emptyCollection();
    expect(() => buyCollectionBooster(original, boosterPacks[1])).toThrow('100 crowns');
    const debug = gainDebugCrowns(original);
    expect(debug.crowns).toBe(1000);
    const purchased = buyCollectionBooster(debug, boosterPacks[1]);
    expect(purchased.crowns).toBe(900);
    expect(purchased.packs).toEqual({ foundations: 1 });
    expect(debug.packs).toEqual({});
    expect(original.crowns).toBe(0);
  });
  it('rewards an eligible win once, including after saving, reloading and reviewing it', () => {
    const original = emptyCollection();
    for (const [outcome, eligible] of [['p2', true], ['draw', true], [null, true], ['p1', false]] as const) {
      expect(claimVictory(original, 'match', outcome, eligible)).toBe(original);
    }
    expect(claimVictory(original, undefined, 'p1', true)).toBe(original);
    const won = claimVictory(original, 'match-1', 'p1', true);
    expect(won.crowns).toBe(collectionRules.victoryCrowns);
    expect(won.packs).toEqual({ bounty: 1 });
    expect(claimVictory(won, 'match-1', 'p1', true)).toBe(won);
    const restored = parseCollection(JSON.stringify(won), content)!;
    expect(claimVictory(restored, 'match-1', 'p1', true)).toBe(restored);
    // Different games with the same shuffle seed are still independently rewardable.
    expect(claimVictory(restored, 'match-2', 'p1', true)).toMatchObject({ crowns: 50, packs: { bounty: 2 }, rewardedMatches: ['match-1', 'match-2'] });
  });
  it('converts retired faction packs into all-card boosters exactly once without losing inventory',()=>{
    const original={...emptyCollection(),counts:{common:2},crowns:175,packs:{bounty:2,crown:3,neutral:1,winter:4,foundations:2,retiredPack:1}};
    const restored=parseCollection(JSON.stringify(original),content)!;
    expect(restored.packs).toEqual({bounty:10,foundations:2,retiredPack:1});
    expect(totalPacks(restored)).toBe(totalPacks(original));
    expect(restored.counts).toEqual(original.counts);expect(restored.crowns).toBe(original.crowns);
    expect(parseCollection(JSON.stringify(restored),content)).toEqual(restored);
    expect(original.packs.crown).toBe(3);
  });
  it('validates storage, preserves retired IDs, and normalizes content changes without repeated crowns', () => {
    const original = { ...emptyCollection(), counts: { common: 5, legendary: 3, retired: 1 }, packs: { retiredPack: 1 } };
    const restored = parseCollection(JSON.stringify(original), content)!;
    expect(restored).toMatchObject({ counts: { common: 3, legendary: 1, retired: 1 }, crowns: 220, packs: { retiredPack: 1 } });
    expect(parseCollection(JSON.stringify(restored), content)).toEqual(restored);
    for (const raw of [null, '{', '[]', JSON.stringify({ ...original, crowns: -1 }), JSON.stringify({ ...original, packs: { bounty: 1.5 } }), JSON.stringify({ ...original, rewardedMatches: [1] }), JSON.stringify({ ...original, counts: { common: Infinity } })]) {
      expect(parseCollection(raw, content)).toBeNull();
    }
    expect(missingDeckCopies(['common', 'common', 'legendary'], { common: 1 })).toEqual([{ id: 'common', needed: 2, owned: 1, missing: 1 }, { id: 'legendary', needed: 1, owned: 0, missing: 1 }]);
  });
  it('awards a real completed engine match and keeps its reward after a collection round trip', () => {
    let winningState;
    const starter = starterDefinitions.find(deck => deck.id === defaultDeckId)!;
    for (let seed = 1; seed <= 12 && !winningState; seed++) {
      let state = startMatch(seed, defaultDeckId, false, undefined, undefined, starter);
      for (let move = 0; move < 1200 && !state.outcome; move++) {
        const result = apply(state, { actor: decisionPlayer(state), expectedRevision: state.revision, command: botCommand(state, live) }, live);
        expect(result.error).toBeUndefined();
        state = result.state;
      }
      if (state.outcome === 'p1') winningState = state;
    }
    expect(winningState?.outcome).toBe('p1');
    const initial = createCollection(live, starter.cards);
    const won = claimVictory(initial, 'engine-match', winningState!.outcome, true);
    expect(won.crowns - initial.crowns).toBe(25);
    expect(totalPacks(won) - totalPacks(initial)).toBe(1);
    expect(parseCollection(JSON.stringify(won), live)).toEqual(won);
  });
  it('reads saves written before dust became crowns', () => {
    const old = JSON.stringify({ version: 1, counts: {}, dust: 140, packs: {}, boostersOpened: 2, rewardedMatches: [] });
    expect(parseCollection(old, content)?.crowns).toBe(140);
  });
});
