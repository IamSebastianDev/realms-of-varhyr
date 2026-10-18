import { afterEach, describe, expect, it, vi } from 'vitest';
import { registry } from '../packages/content/src';
import type { RunState } from '../packages/quest/src';
import { questRules } from '../packages/quest/src';
import { collectionKey, emptyCollection, ownershipLimit, parseCollection } from '../apps/web/src/collection';
import { acknowledgeQuestReward, availableQuestCopies, buyQuestCards, closeQuestRewards, needsQuestRewardScreen, paidQuestPacks, purchasedQuestCopies, settleQuest } from '../apps/web/src/quest/rewards';

const cards = Object.values(registry.cards);
const common = cards.find(card => card.rarity === 'common' && !card.legendary)!;
const rare = cards.find(card => card.rarity === 'rare' && !card.legendary)!;
const legendary = cards.find(card => card.legendary)!;
// Only the immutable end-of-run data is relevant to settlement, independent of map content and deck balance.
const run = (changes: Partial<RunState> = {}): RunState => ({
  version: 1, id: 'run-1', day: '2026-10-18', pack: 'hearth-and-crown', faction: 'crownlands',
  seed: 7, step: 30, startedAt: 1, stage: 'over', result: 'won',
  deck: [common.id, common.id, rare.id, legendary.id], life: 4, gold: 200, drafted: 15,
  position: 'boss', visited: [], revealed: [], beacons: [], world: {}, targetFound: true,
  quest: { id: 'quest', day: '2026-10-18', pack: 'hearth-and-crown', packName: 'Good', factions: ['crownlands'],
    target: 'boss', bossName: 'Boss', bossFaction: 'black-host', hint: { x: 0, y: 0, r: 1 }, starts: { crownlands: 'start' } },
  offer: null, encounter: null, fight: null, bounties: {}, stats: { fights: 2, goldEarned: 50 }, ...changes,
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('quest reward settlement', () => {
  it('presents victory rewards before card shopping, remembers continuing, and skips that step after losses', () => {
    const won = run();
    expect(needsQuestRewardScreen(won, undefined)).toBe(true);
    const settled = settleQuest(emptyCollection(), won);
    expect(needsQuestRewardScreen(won, settled.questSettlements![won.id])).toBe(true);
    const continued = acknowledgeQuestReward(settled, won.id);
    expect(continued.counts).toEqual(settled.counts);
    expect(continued.crowns).toBe(settled.crowns);
    expect(continued.packs).toEqual(settled.packs);
    expect(acknowledgeQuestReward(continued, won.id)).toBe(continued);
    const reloaded = parseCollection(JSON.stringify(continued), registry)!;
    expect(needsQuestRewardScreen(won, reloaded.questSettlements![won.id])).toBe(false);
    expect(settleQuest(reloaded, won)).toBe(reloaded);
    const legacyBought = buyQuestCards(settled, won.id, { [common.id]: 1 }, registry, 0);
    expect(needsQuestRewardScreen(won, legacyBought.questSettlements![won.id])).toBe(false);
    expect(needsQuestRewardScreen(won, closeQuestRewards(settled, won.id).questSettlements![won.id])).toBe(false);
    for (const result of ['dead', 'expired', 'abandoned'] as const) expect(needsQuestRewardScreen(run({ result }), undefined)).toBe(false);
  });

  it('keeps the exact selected copy across reloads, and never sells that copy twice', () => {
    const settled = settleQuest(emptyCollection(), run());
    const bought = buyQuestCards(settled, 'run-1', { [common.id]: 1 }, registry, 0, { [common.id]: [1] });
    const reloaded = parseCollection(JSON.stringify(bought), registry)!;
    expect(purchasedQuestCopies(reloaded.questSettlements!['run-1'], common.id)).toEqual([1]);
    expect(() => buyQuestCards(reloaded, 'run-1', { [common.id]: 1 }, registry, 1, { [common.id]: [1] })).toThrow(/available/);
    const second = buyQuestCards(reloaded, 'run-1', { [common.id]: 1 }, registry, 1, { [common.id]: [0] });
    expect(purchasedQuestCopies(second.questSettlements!['run-1'], common.id)).toEqual([1, 0]);
    expect(second.counts[common.id]).toBe(2);
    expect(() => buyQuestCards(settled, 'run-1', { [common.id]: 2 }, registry, 0, { [common.id]: [0, 0] })).toThrow(/available/);
    expect(() => buyQuestCards(settled, 'run-1', { [common.id]: 1 }, registry, 0, { [common.id]: [2] })).toThrow(/available/);
  });

  it('reads older counted purchases as individual copies and respects remaining collection capacity', () => {
    const settled = settleQuest({ ...emptyCollection(), counts: { [common.id]: ownershipLimit(common) - 1 } }, run());
    const bought = buyQuestCards(settled, 'run-1', { [common.id]: 1 }, registry, 0);
    delete bought.questSettlements!['run-1'].purchasedCopies;
    const reloaded = parseCollection(JSON.stringify(bought), registry)!;
    expect(purchasedQuestCopies(reloaded.questSettlements!['run-1'], common.id)).toEqual([0]);
    expect(availableQuestCopies(reloaded, reloaded.questSettlements!['run-1'], registry, common.id)).toBe(0);
    expect(() => buyQuestCards(reloaded, 'run-1', { [common.id]: 1 }, registry, 1, { [common.id]: [1] })).toThrow(/available/);
  });

  it('pays victory once, then keeps purchases and their run budget across reloads', () => {
    const completed = run(), empty = emptyCollection();
    const settled = settleQuest(empty, completed);
    expect(settled.crowns).toBe(questRules.rewardCrowns);
    expect(settled.packs[completed.pack]).toBe(questRules.rewardPacks);
    expect(settleQuest(settled, completed)).toBe(settled);
    const bought = buyQuestCards(settled, completed.id, { [common.id]: 2, [legendary.id]: 1 }, registry, 0);
    expect(bought.counts[common.id]).toBe(2);
    expect(bought.counts[legendary.id]).toBe(1);
    expect(bought.crowns).toBe(settled.crowns);
    expect(bought.questSettlements![completed.id].coins).toBe(200 - 2 * questRules.keepPrice.common - questRules.keepPrice.legendary);
    expect(settled.counts).toEqual({});
    const reloaded = parseCollection(JSON.stringify(bought), registry)!;
    expect(reloaded).toEqual(bought);
    expect(settleQuest(reloaded, completed)).toBe(reloaded);
    expect(availableQuestCopies(reloaded, reloaded.questSettlements![completed.id], registry, legendary.id)).toBe(0);
    expect(() => buyQuestCards(reloaded, completed.id, { [common.id]: 1 }, registry, 0)).toThrow(/changed/);
    const more = buyQuestCards(reloaded, completed.id, { [rare.id]: 1 }, registry, 1);
    expect(more.counts[rare.id]).toBe(1);
  });

  it.each(['dead', 'expired', 'abandoned'] as const)('allows purchases after %s without a boss bonus', result => {
    const completed = run({ result, gold: questRules.keepPrice.rare });
    const settled = settleQuest(emptyCollection(), completed);
    expect(settled.crowns).toBe(0); expect(settled.packs).toEqual({});
    expect(settled.questSettlements![completed.id].reward).toBeNull();
    const bought = buyQuestCards(settled, completed.id, { [rare.id]: 1 }, registry, 0);
    expect(bought.counts[rare.id]).toBe(1);
    expect(bought.questSettlements![completed.id].coins).toBe(0);
  });

  it('rejects unaffordable, unavailable, malformed and over-cap selections without charging', () => {
    const collection = settleQuest({ ...emptyCollection(), counts: { [common.id]: ownershipLimit(common) - 1, [legendary.id]: 1 } }, run({ gold: 20 }));
    const before = JSON.stringify(collection), receipt = collection.questSettlements!['run-1'];
    expect(availableQuestCopies(collection, receipt, registry, common.id)).toBe(1);
    expect(availableQuestCopies(collection, receipt, registry, legendary.id)).toBe(0);
    for (const selection of [{ [common.id]: 2 }, { [legendary.id]: 1 }, { missing: 1 }, { [common.id]: -1 }, { [common.id]: 0.5 }])
      expect(() => buyQuestCards(collection, 'run-1', selection, registry, 0)).toThrow();
    expect(() => buyQuestCards(collection, 'run-1', { [rare.id]: 1 }, registry, 0)).toThrow(/coins/);
    expect(JSON.stringify(collection)).toBe(before);
    const bought = buyQuestCards(collection, 'run-1', { [common.id]: 1 }, registry, 0);
    expect(bought.counts[common.id]).toBe(ownershipLimit(common));
    expect(bought.crowns).toBe(collection.crowns); // Never convert already-owned cards into account currency.
  });

  it('keeps daily claims across days and permits repeat runs only for card purchases', () => {
    let collection = settleQuest(emptyCollection(), run());
    collection = settleQuest(collection, run({ id: 'tomorrow', day: '2026-10-19' }));
    collection = settleQuest(collection, run({ id: 'repeat', day: '2026-10-18' }));
    expect(collection.crowns).toBe(2 * questRules.rewardCrowns);
    expect(collection.questSettlements!.repeat.reward).toBe('claimed');
    expect(collection.questSettlements!.repeat.coins).toBe(200);
    expect(paidQuestPacks(collection, '2026-10-18')).toEqual(['hearth-and-crown']);
    collection = settleQuest(collection, run({ id: 'neutral', pack: 'wanderers-road' }));
    collection = settleQuest(collection, run({ id: 'evil', pack: 'gathering-dark' }));
    const capped = settleQuest(collection, run({ id: 'fourth', pack: 'future-pack' }));
    expect(capped.crowns).toBe(collection.crowns);
    expect(capped.questSettlements!.fourth.reward).toBe('claimed');
  });

  it('migrates legacy payments without paying them again, and keeps their purchase shop available', () => {
    const alreadyPaid = settleQuest(emptyCollection(), run({ reward: { crowns: 150, packs: 3 } }));
    expect(alreadyPaid.crowns).toBe(0); expect(alreadyPaid.packs).toEqual({});
    expect(paidQuestPacks(alreadyPaid, '2026-10-18')).toEqual(['hearth-and-crown']);
    const legacy = settleQuest(emptyCollection(), run(), ['hearth-and-crown']);
    expect(legacy.crowns).toBe(0);
    expect(legacy.questSettlements!['run-1'].reward).toBe('claimed');
    expect(buyQuestCards(legacy, 'run-1', { [common.id]: 1 }, registry, 0).counts[common.id]).toBe(1);
  });

  it('closes purchases permanently without reopening or paying the same run', () => {
    const settled = settleQuest(emptyCollection(), run());
    const closed = closeQuestRewards(settled, 'run-1');
    expect(closeQuestRewards(closed, 'run-1')).toBe(closed);
    expect(settleQuest(closed, run())).toBe(closed);
    expect(() => buyQuestCards(closed, 'run-1', { [common.id]: 1 }, registry, 0)).toThrow(/no longer/);
    expect(availableQuestCopies(closed, closed.questSettlements!['run-1'], registry, common.id)).toBe(0);
    expect(() => settleQuest(emptyCollection(), run({ stage: 'map', result: null }))).toThrow(/Finish/);
  });

  it('leaves receipts and ownership untouched on storage failure, then retries exactly once', async () => {
    vi.resetModules();
    const storage = new Map([[collectionKey, JSON.stringify(emptyCollection())]]);
    let fail = false;
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { if (fail) throw new Error('Full'); storage.set(key, value); } });
    const { updateCollection } = await import('../apps/web/src/collectionStore');
    updateCollection(current => current);
    fail = true;
    expect(() => updateCollection(current => settleQuest(current, run()), { requireSave: true })).toThrow(/save/);
    expect(JSON.parse(storage.get(collectionKey)!).crowns).toBe(0);
    fail = false;
    const settled = updateCollection(current => settleQuest(current, run()), { requireSave: true }).collection;
    fail = true;
    expect(() => updateCollection(current => buyQuestCards(current, 'run-1', { [rare.id]: 1 }, registry, 0), { requireSave: true })).toThrow(/save/);
    expect(parseCollection(storage.get(collectionKey)!, registry)).toEqual(settled);
    fail = false;
    const bought = updateCollection(current => buyQuestCards(current, 'run-1', { [rare.id]: 1 }, registry, 0), { requireSave: true }).collection;
    expect(bought.counts[rare.id]).toBe(1);
    vi.resetModules();
    const reloaded = await import('../apps/web/src/collectionStore');
    expect(reloaded.updateCollection(current => settleQuest(current, run()), { requireSave: true }).collection).toEqual(bought);
  });

  it('retains a fight report until its outcome is durably saved, including the completion time', async () => {
    vi.resetModules();
    const active = run({ stage: 'map', result: null, fight: { node: 'boss', seed: 7,
      enemy: { name: 'Boss', faction: 'black-host', deck: [], life: 15 } } });
    const storage = new Map<string, string>();
    let fail = false;
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => { if (fail) throw new Error('Full'); storage.set(key, value); } });
    const store = await import('../apps/web/src/quest/questStore');
    store.saveRun(active);
    const report = { run: active.id, node: 'boss', won: true, life: 4, finishedAt: 5_000 };
    store.reportFight(report);
    expect(store.readFightReport(active)).toEqual(report);
    expect(store.readFightReport(active)).toEqual(report); // Reading is not acknowledgment.
    fail = true;
    expect(store.saveRun(run())).toBe(false);
    vi.resetModules();
    const reloaded = await import('../apps/web/src/quest/questStore');
    expect(reloaded.readRun()!.stage).toBe('map');
    expect(reloaded.readFightReport(active)).toEqual(report);
    fail = false;
    expect(reloaded.saveRun(run())).toBe(true);
    reloaded.clearFightReport(report);
    expect(reloaded.readFightReport(active)).toBeNull();
  });
});
