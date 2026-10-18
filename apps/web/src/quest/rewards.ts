import type { Registry } from '../../../../packages/contracts/src';
import { payout, questRules, type RunState } from '../../../../packages/quest/src';
import { ownedCopyCount, ownershipLimit, type Collection, type QuestSettlement } from '../collection';

/** Legacy claims are read-only; all new claims live alongside their payment in the collection. */
export function paidQuestPacks(collection: Collection, day: string, legacy: readonly string[] = []): string[] {
  return [...new Set([...legacy, ...Object.values(collection.questSettlements ?? {})
    .filter(s => s.day === day && s.reward && s.reward !== 'claimed').map(s => s.pack)])];
}

/** Open the end-of-run shop and pay the boss bonus once, atomically with its receipt. */
export function settleQuest(collection: Collection, run: RunState, legacyPaid: readonly string[] = []): Collection {
  if (run.stage !== 'over' || !run.result) throw new Error('Finish the run before choosing cards.');
  if (collection.questSettlements?.[run.id]) return collection;
  const paid = paidQuestPacks(collection, run.day, legacyPaid), bonus = payout(run);
  const reward: QuestSettlement['reward'] = run.reward ?? (bonus
    ? paid.includes(run.pack) || paid.length >= questRules.dailyCap ? 'claimed'
      : { crowns: bonus.crowns, packs: Object.values(bonus.packs).reduce((sum, n) => sum + n, 0) }
    : null);
  // Older runs have already received run.reward; never pay that legacy summary twice.
  const pay = !run.reward && reward && reward !== 'claimed' ? reward : null;
  const cards: Record<string, number> = {};
  for (const id of run.deck) cards[id] = (cards[id] ?? 0) + 1;
  return { ...collection,
    crowns: collection.crowns + (pay?.crowns ?? 0),
    packs: pay ? { ...collection.packs, [run.pack]: (collection.packs[run.pack] ?? 0) + pay.packs } : collection.packs,
    questSettlements: { ...collection.questSettlements, [run.id]: {
      day: run.day, pack: run.pack, coins: run.gold, revision: 0, cards, purchased: {}, reward, closed: false,
    } },
  };
}

export const keepPrice = (card: Registry['cards'][string]) => questRules.keepPrice[card.rarity];
/** Losses go straight to the shop; existing purchases also imply the victory step was already passed. */
export const needsQuestRewardScreen = (run: RunState, receipt: QuestSettlement | undefined) => run.result === 'won'
  && !receipt?.closed && !receipt?.rewardPresented && !Object.values(receipt?.purchased ?? {}).some(count => count > 0);

export function acknowledgeQuestReward(collection: Collection, runId: string): Collection {
  const receipt = collection.questSettlements?.[runId];
  if (!receipt) throw new Error('The run rewards are not ready yet.');
  if (receipt.rewardPresented || receipt.closed) return collection;
  return { ...collection, questSettlements: { ...collection.questSettlements, [runId]: { ...receipt, rewardPresented: true } } };
}

/** Old receipts only counted purchases; treat those as the first copies in their row. */
export const purchasedQuestCopies = (receipt: QuestSettlement, id: string): readonly number[] =>
  receipt.purchasedCopies?.[id] ?? Array.from({ length: receipt.purchased[id] ?? 0 }, (_, index) => index);
export function availableQuestCopies(collection: Collection, receipt: QuestSettlement, content: Registry, id: string): number {
  const card = content.cards[id];
  if (!card || receipt.closed) return 0;
  return Math.max(0, Math.min((receipt.cards[id] ?? 0) - (receipt.purchased[id] ?? 0),
    ownershipLimit(card) - ownedCopyCount(collection.counts, id)));
}

/** Spend run coins and grant the whole selection in the same collection write; no overflow conversion. */
export function buyQuestCards(collection: Collection, runId: string, selection: Record<string, number>, content: Registry, expectedRevision: number, selectedCopies?: Record<string, number[]>): Collection {
  const receipt = collection.questSettlements?.[runId];
  if (!receipt || receipt.closed) throw new Error('This run is no longer open for purchases.');
  if (receipt.revision !== expectedRevision) throw new Error('The run rewards changed. Please choose again.');
  const entries = Object.entries(selection);
  const purchasedCopies = { ...receipt.purchasedCopies };
  let cost = 0;
  for (const [id, count] of entries) {
    if (!Number.isSafeInteger(count) || count < 0 || count > availableQuestCopies(collection, receipt, content, id))
      throw new Error('That selection exceeds the available copies.');
    if (count) {
      const previous = purchasedQuestCopies(receipt, id);
      const copies = selectedCopies?.[id] ?? Array.from({ length: receipt.cards[id] }, (_, index) => index).filter(index => !previous.includes(index)).slice(0, count);
      if (copies.length !== count || new Set(copies).size !== count || copies.some(index => !Number.isSafeInteger(index)
        || index < 0 || index >= receipt.cards[id] || previous.includes(index))) throw new Error('That selection exceeds the available copies.');
      purchasedCopies[id] = [...previous, ...copies];
      cost += keepPrice(content.cards[id]) * count;
    }
  }
  if (!cost) return collection;
  if (cost > receipt.coins) throw new Error('Not enough run coins.');
  const counts = { ...collection.counts }, purchased = { ...receipt.purchased };
  for (const [id, count] of entries) if (count) {
    counts[id] = ownedCopyCount(counts, id) + count;
    purchased[id] = (purchased[id] ?? 0) + count;
  }
  return { ...collection, counts, questSettlements: { ...collection.questSettlements,
    [runId]: { ...receipt, coins: receipt.coins - cost, revision: receipt.revision + 1, purchased, purchasedCopies } } };
}

export function closeQuestRewards(collection: Collection, runId: string): Collection {
  const receipt = collection.questSettlements?.[runId];
  if (!receipt) throw new Error('The run rewards are not ready yet.');
  if (receipt.closed) return collection;
  return { ...collection, questSettlements: { ...collection.questSettlements, [runId]: { ...receipt, closed: true } } };
}
