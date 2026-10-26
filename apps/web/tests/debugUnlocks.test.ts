import { expect, it } from "vitest";

import { registry } from "@realms/content";
import {
  emptyCollection,
  ownedCopyCount,
  ownershipLimit,
  ownsEveryCard,
  unlockAllCards,
} from "../src/features/collection/lib/collection";

it("unlocks every card up to its copy limit without touching crowns or packs", () => {
  const start = { ...emptyCollection(), crowns: 7, packs: { good: 2 } };
  expect(ownsEveryCard(start, registry)).toBe(false);
  const all = unlockAllCards(start, registry);
  for (const card of Object.values(registry.cards))
    expect(ownedCopyCount(all.counts, card.id), card.id).toBe(ownershipLimit(card));
  expect(all.crowns).toBe(7);
  expect(all.packs).toEqual({ good: 2 });
  expect(ownsEveryCard(all, registry)).toBe(true);
  expect(unlockAllCards(all, registry)).toBe(all);
});

it("never lowers a count that is already above the limit", () => {
  const first = Object.values(registry.cards)[0];
  const rich = { ...emptyCollection(), counts: { [first.id]: ownershipLimit(first) + 5 } };
  expect(ownedCopyCount(unlockAllCards(rich, registry).counts, first.id)).toBe(
    ownershipLimit(first) + 5,
  );
});
