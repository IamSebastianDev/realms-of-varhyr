import type { CardDefinition } from "@realms/contracts";
import type { CardAppearance, CardFinish, CardStyles } from "@realms/renderer/CardStyles";
import { includesStandardFoil, defaultCardAppearance } from "@realms/renderer/cardFinishes";
import type { Collection } from "../../collection/lib/collection";
import { ownedCopyCount } from "../../collection/lib/collection";

/** Per logical card, per finish. */
export const finishPrice = 150;
export const hasFinish = (collection: Collection, card: CardDefinition, finish: CardFinish) =>
  (finish === "foil" && includesStandardFoil(card)) ||
  (collection.cardStyles?.unlocked[finish]?.includes(card.deckLimitKey) ?? false);

/** Grants are reusable by quests and achievements; they never grant or consume a card copy. */
export function grantFinish(
  collection: Collection,
  identity: string,
  finish: CardFinish,
): Collection {
  if (collection.cardStyles?.unlocked[finish]?.includes(identity)) return collection;
  const styles = collection.cardStyles;
  return {
    ...collection,
    cardStyles: {
      unlocked: { ...styles?.unlocked, [finish]: [...(styles?.unlocked[finish] ?? []), identity] },
      equipped: styles?.equipped ?? {},
    },
  };
}

/** Wallet, entitlement and initial selection are committed together by updateCollection. */
export function unlockFinish(
  collection: Collection,
  card: CardDefinition,
  finish: CardFinish,
): Collection {
  if (hasFinish(collection, card, finish)) return collection;
  if (!ownedCopyCount(collection.counts, card.id))
    throw new Error("Own this card to unlock its finishes.");
  if (collection.crowns < finishPrice) throw new Error("Not enough crowns.");
  return equipFinish(
    grantFinish(
      { ...collection, crowns: collection.crowns - finishPrice },
      card.deckLimitKey,
      finish,
    ),
    card,
    finish,
  );
}

export function equipFinish(
  collection: Collection,
  card: CardDefinition,
  appearance: CardAppearance,
): Collection {
  if (appearance !== "original" && !hasFinish(collection, card, appearance))
    throw new Error("Unlock this finish first.");
  const current = collection.cardStyles;
  if (!current && appearance === defaultCardAppearance(card)) return collection;
  const equipped = { ...current?.equipped };
  delete equipped[card.deckLimitKey];
  if (appearance !== defaultCardAppearance(card)) equipped[card.deckLimitKey] = appearance;
  return { ...collection, cardStyles: { unlocked: current?.unlocked ?? {}, equipped } };
}

export function selectedCardStyles(collection: Collection): CardStyles {
  const styles = collection.cardStyles;
  return Object.fromEntries(
    Object.entries(styles?.equipped ?? {}).filter(
      ([id, finish]) => finish === "original" || styles?.unlocked[finish]?.includes(id),
    ),
  );
}
