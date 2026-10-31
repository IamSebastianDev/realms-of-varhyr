import { boosterFor } from "@realms/content/boosters";
import type { Payout, RunState } from "@realms/adventure";
import type { Collection } from "../../collection/lib/collection";
import { grantCopies } from "../../collection/lib/collection";
import { registry } from "@realms/content";

const payoutKey = (run: RunState, payout: Payout) => `${run.id}|${payout.id}`;
/** Boosters the run has earned that the collection has not received yet. */
export const unpaidPayouts = (collection: Collection, run: RunState): Payout[] =>
  run.earned.filter((payout) => !collection.adventurePayouts?.[payoutKey(run, payout)]);

/**
 * Grants every earned booster that has no receipt yet. The receipt is written in the same collection write as the packs,
 * so a reload, a second tab or an interrupted save cannot pay a scene twice.
 */
export function applyPayouts(collection: Collection, run: RunState): Collection {
  const owed = unpaidPayouts(collection, run);
  const cards =
    run.stage === "over"
      ? (run.collected ?? []).filter(
          (id) =>
            registry.cards[id]?.legendary && !collection.adventurePayouts?.[`${run.id}|card:${id}`],
        )
      : [];
  if (!owed.length && !cards.length) return collection;
  const next = {
    ...collection,
    counts: { ...collection.counts },
    packs: { ...collection.packs },
    adventurePayouts: { ...collection.adventurePayouts },
  };
  const packs = next.packs,
    receipts = next.adventurePayouts!;
  for (const payout of owed) {
    const id = boosterFor(payout.pack).id;
    packs[id] = (packs[id] ?? 0) + payout.count;
    receipts[payoutKey(run, payout)] = true;
  }
  for (const id of new Set(cards)) {
    grantCopies(next, id, 1, registry);
    receipts[`${run.id}|card:${id}`] = true;
  }
  return next;
}
