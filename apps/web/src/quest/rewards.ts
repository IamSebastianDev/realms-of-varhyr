import type { Registry } from "@realms/contracts";
import { keepPriceOf, questRules, type Payout, type RunState } from "@realms/quest";
import {
  ownedCopyCount,
  ownershipLimit,
  type Collection,
  type QuestSettlement,
} from "../collection";

const payoutKey = (run: RunState, payout: Payout) => `${run.id}|${payout.id}`;
/** Payouts the run has earned that the collection has not received yet. */
export const unpaidPayouts = (collection: Collection, run: RunState): Payout[] =>
  run.earned.filter((payout) => !collection.questPayouts?.[payoutKey(run, payout)]);

/**
 * Grants every earned boss and quest payout that has no receipt yet. Each payout is granted once: the receipt is written
 * in the same collection write as the packs and crowns, so a reload or an interrupted save cannot pay it twice.
 */
export function applyPayouts(collection: Collection, run: RunState): Collection {
  const owed = unpaidPayouts(collection, run);
  if (!owed.length) return collection;
  const packs = { ...collection.packs },
    receipts = { ...collection.questPayouts };
  let crowns = collection.crowns;
  for (const payout of owed) {
    for (const [pack, count] of Object.entries(payout.packs))
      packs[pack] = (packs[pack] ?? 0) + count;
    crowns += payout.crowns;
    receipts[payoutKey(run, payout)] = true;
  }
  return { ...collection, crowns, packs, questPayouts: receipts };
}

const dayOf = (time: number) => new Date(time || Date.now()).toISOString().slice(0, 10);

/** Open the end-of-expedition purchase screen. Boss and quest payouts are separate receipts and are not part of it. */
export function settleQuest(collection: Collection, run: RunState): Collection {
  if (run.stage !== "over" || !run.result)
    throw new Error("Finish the expedition before choosing cards.");
  if (collection.questSettlements?.[run.id]) return collection;
  const cards: Record<string, number> = {};
  for (const id of run.deck) cards[id] = (cards[id] ?? 0) + 1;
  return {
    ...collection,
    questSettlements: {
      ...collection.questSettlements,
      [run.id]: {
        day: dayOf(run.startedAt),
        pack: run.pack,
        coins: run.silver,
        revision: 0,
        cards,
        purchased: {},
        reward: null,
        closed: false,
      },
    },
  };
}

export const keepPrice = (card: Registry["cards"][string]) => questRules.keepPrice[card.rarity];
export { keepPriceOf };

/** Old receipts only counted purchases; treat those as the first copies in their row. */
export const purchasedQuestCopies = (receipt: QuestSettlement, id: string): readonly number[] =>
  receipt.purchasedCopies?.[id] ??
  Array.from({ length: receipt.purchased[id] ?? 0 }, (_, index) => index);
export function availableQuestCopies(
  collection: Collection,
  receipt: QuestSettlement,
  content: Registry,
  id: string,
): number {
  const card = content.cards[id];
  if (!card || receipt.closed) return 0;
  return Math.max(
    0,
    Math.min(
      (receipt.cards[id] ?? 0) - (receipt.purchased[id] ?? 0),
      ownershipLimit(card) - ownedCopyCount(collection.counts, id),
    ),
  );
}

/** Spend silver and grant the whole selection in the same collection write; no overflow conversion. */
export function buyQuestCards(
  collection: Collection,
  runId: string,
  selection: Record<string, number>,
  content: Registry,
  expectedRevision: number,
  selectedCopies?: Record<string, number[]>,
): Collection {
  const receipt = collection.questSettlements?.[runId];
  if (!receipt || receipt.closed)
    throw new Error("This expedition is no longer open for purchases.");
  if (receipt.revision !== expectedRevision)
    throw new Error("The expedition changed. Please choose again.");
  const entries = Object.entries(selection);
  const purchasedCopies = { ...receipt.purchasedCopies };
  let cost = 0;
  for (const [id, count] of entries) {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > availableQuestCopies(collection, receipt, content, id)
    )
      throw new Error("That selection exceeds the available copies.");
    if (count) {
      const previous = purchasedQuestCopies(receipt, id);
      const copies =
        selectedCopies?.[id] ??
        Array.from({ length: receipt.cards[id] }, (_, index) => index)
          .filter((index) => !previous.includes(index))
          .slice(0, count);
      if (
        copies.length !== count ||
        new Set(copies).size !== count ||
        copies.some(
          (index) =>
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= receipt.cards[id] ||
            previous.includes(index),
        )
      )
        throw new Error("That selection exceeds the available copies.");
      purchasedCopies[id] = [...previous, ...copies];
      cost += keepPrice(content.cards[id]) * count;
    }
  }
  if (!cost) return collection;
  if (cost > receipt.coins) throw new Error("Not enough silver.");
  const counts = { ...collection.counts },
    purchased = { ...receipt.purchased };
  for (const [id, count] of entries)
    if (count) {
      counts[id] = ownedCopyCount(counts, id) + count;
      purchased[id] = (purchased[id] ?? 0) + count;
    }
  return {
    ...collection,
    counts,
    questSettlements: {
      ...collection.questSettlements,
      [runId]: {
        ...receipt,
        coins: receipt.coins - cost,
        revision: receipt.revision + 1,
        purchased,
        purchasedCopies,
      },
    },
  };
}

export function closeQuestRewards(collection: Collection, runId: string): Collection {
  const receipt = collection.questSettlements?.[runId];
  if (!receipt) throw new Error("The expedition is not ready yet.");
  if (receipt.closed) return collection;
  return {
    ...collection,
    questSettlements: { ...collection.questSettlements, [runId]: { ...receipt, closed: true } },
  };
}
