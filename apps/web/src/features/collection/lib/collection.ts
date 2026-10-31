import { deckRules, type CardDefinition, type GameState, type Registry } from "@realms/contracts";
import {
  boosterPacks,
  drawBooster,
  packCards,
  packIds,
  type BoosterPack,
} from "@realms/content/boosters";
import type { RewardCollection } from "../../boosters/lib/boosterRewards";
import { isAdventureExclusive } from "@realms/content/acquisition";
import { currentCardId } from "../../../lib/cardIds";
import { parseCardStyles, type CardStyleCollection } from "../../card-styles/lib/cardStyleState";

/** Copies belong to a logical card ID, independent of set labels or future artwork choices. Missing IDs mean zero owned. */
export type OwnedCopies = Readonly<Record<string, number>>;

export function ownedCopyCount(collection: OwnedCopies, id: string): number {
  const count = Object.hasOwn(collection, id) ? collection[id] : 0;
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** Provisional POC economy. Keep all tuning values here. */
export const collectionRules = {
  /** A new player starts with this many boosters of the pack that fits their starter deck. */
  startingBoosters: 5,
  /** Spread used when the starter's faction is unknown. */
  startingPacks: { [packIds.realms]: 5 },
  packCost: 100,
  /** Buying this many boosters at once is cheaper than buying them one by one. */
  packBundle: { count: 10, cost: 900 },
  victoryCrowns: 25,
  victoryBoosters: 1,
  /** Copies past the ownership limit are sold for crowns; a spare common is worth nothing. */
  duplicateCrowns: { common: 0, rare: 25, legendary: 100 },
  /** Buying a specific card costs far more than the roughly 20 crowns per card a booster works out to. */
  cardCrowns: { common: 50, rare: 150, legendary: 400 },
} as const;
export const collectionKey = "varhyr-collection-v1";
export type Collection = {
  version: 1;
  counts: Record<string, number>;
  crowns: number;
  packs: Record<string, number>;
  boostersOpened: number;
  rewardedMatches: string[];
  /** Cosmetic unlocks and selections, independent of card copies and game rules. */
  cardStyles?: CardStyleCollection;
  /** Adventure boosters already granted, keyed by run and payout, so each is applied exactly once. */
  adventurePayouts?: Record<string, true>;
  /** Faction draft runs already paid out, so a run is settled exactly once. */
  draftPayouts?: Record<string, true>;
};
export type CollectionCardReward = { id: string; isNew: boolean; copies: number; crowns: number };
export const emptyCollection = (): Collection => ({
  version: 1,
  counts: {},
  crowns: 0,
  packs: {},
  boostersOpened: 0,
  rewardedMatches: [],
});
export const ownershipLimit = (card: CardDefinition) =>
  card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;
export const packCount = (collection: Collection, id: string) =>
  ownedCopyCount(collection.packs, id);
export const totalPacks = (collection: Collection) =>
  Object.values(collection.packs).reduce((sum, count) => sum + count, 0);
export function missingDeckCopies(cards: string[], owned: OwnedCopies) {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].flatMap(([id, needed]) => {
    const have = ownedCopyCount(owned, id);
    return needed > have ? [{ id, needed, owned: have, missing: needed - have }] : [];
  });
}

export type DeckPurchasePlan = {
  cards: { id: string; copies: number; card: CardDefinition; crowns: number }[];
  copies: number;
  crowns: number;
  /** False for malformed or over-limit imported decks, which cannot be completed by buying cards. */
  complete: boolean;
  adventureOnly: number;
};

/** Price every copy the current deck lacks. This is deliberately a pure preview, so the builder can disable a purchase
 * before touching the collection. */
export function missingDeckPurchase(
  cards: string[],
  owned: OwnedCopies,
  content: Registry,
): DeckPurchasePlan {
  let complete = true;
  let adventureOnly = 0;
  const purchases = missingDeckCopies(cards, owned).flatMap((missing) => {
    const card = content.cards[missing.id];
    if (card && isAdventureExclusive(card)) {
      adventureOnly += missing.missing;
      complete = false;
      return [];
    }
    if (!card || missing.owned + missing.missing > ownershipLimit(card)) {
      complete = false;
      return [];
    }
    const crowns = cardPrice(card) * missing.missing;
    return [{ id: missing.id, copies: missing.missing, card, crowns }];
  });
  return {
    cards: purchases,
    copies: purchases.reduce((total, purchase) => total + purchase.copies, 0),
    crowns: purchases.reduce((total, purchase) => total + purchase.crowns, 0),
    complete,
    adventureOnly,
  };
}

function addNumber(a: number, b: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, a + b);
}
export function grantCopies(collection: Collection, id: string, amount: number, content: Registry) {
  const previous = ownedCopyCount(collection.counts, id),
    card = content.cards[id];
  // Preserve retired card IDs for later content restoration; they are not in booster pools.
  const limit = card ? ownershipLimit(card) : deckRules.copiesPerCard;
  const kept = Math.min(amount, Math.max(0, limit - previous));
  const crowns = (amount - kept) * collectionRules.duplicateCrowns[card?.rarity ?? "common"];
  collection.counts[id] = previous + kept;
  collection.crowns = addNumber(collection.crowns, crowns);
  return { id, isNew: previous === 0 && kept > 0, copies: collection.counts[id], crowns };
}

/** An empty account receives one starter and five general packs, once, when first persisted.
 * Import previous booster rewards as additional grants, dusting excess copies. Do not rewrite old storage.
 */
export function createCollection(
  content: Registry,
  starter: string[],
  legacy?: RewardCollection,
  starterFaction?: string,
): Collection {
  const collection = emptyCollection();
  for (const savedId of starter) {
    const id = currentCardId(savedId);
    if (content.cards[id]) grantCopies(collection, id, 1, content);
  }
  if (legacy) {
    for (const [id, count] of Object.entries(legacy.counts))
      grantCopies(collection, currentCardId(id), count, content);
    collection.boostersOpened = legacy.boostersOpened;
  }
  const home = starterFaction
    ? boosterPacks.find((pack) => pack.factions.includes(starterFaction))
    : undefined;
  if (home) collection.packs[home.id] = collectionRules.startingBoosters;
  else Object.assign(collection.packs, collectionRules.startingPacks);
  return collection;
}

const validCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const validCounts = (value: unknown): value is Record<string, number> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.entries(value).every(([id, count]) => id.length > 0 && validCount(count));
export function parseCollection(raw: string | null, content: Registry): Collection | null {
  try {
    const data = JSON.parse(raw ?? "null");
    // Saves from before the rename kept this balance under `dust`.
    if (data && data.crowns === undefined && data.dust !== undefined) data.crowns = data.dust;
    if (
      !data ||
      data.version !== 1 ||
      !validCounts(data.counts) ||
      !validCounts(data.packs) ||
      !validCount(data.crowns) ||
      !validCount(data.boostersOpened) ||
      !Array.isArray(data.rewardedMatches) ||
      !data.rewardedMatches.every((id: unknown) => typeof id === "string" && id.length > 0)
    )
      return null;
    const collection: Collection = {
      version: 1,
      counts: {},
      packs: { ...data.packs },
      crowns: data.crowns,
      boostersOpened: data.boostersOpened,
      rewardedMatches: [...new Set<string>(data.rewardedMatches)],
    };
    const cardStyles = parseCardStyles(data.cardStyles);
    if (cardStyles) collection.cardStyles = cardStyles;
    if (data.adventurePayouts !== undefined) {
      if (
        !data.adventurePayouts ||
        typeof data.adventurePayouts !== "object" ||
        Array.isArray(data.adventurePayouts) ||
        !Object.entries(data.adventurePayouts).every(
          ([id, value]) => id.length > 0 && value === true,
        )
      )
        return null;
      collection.adventurePayouts = data.adventurePayouts;
    }
    if (data.draftPayouts !== undefined) {
      if (
        !data.draftPayouts ||
        typeof data.draftPayouts !== "object" ||
        Array.isArray(data.draftPayouts) ||
        !Object.entries(data.draftPayouts).every(([id, value]) => id.length > 0 && value === true)
      )
        return null;
      collection.draftPayouts = data.draftPayouts;
    }
    // Packs that are no longer sold are shared out across the current ones, so saved rewards stay usable.
    // Removing their keys makes migration idempotent on subsequent reads/saves.
    const retired = Object.entries(collection.packs).filter(
      ([id]) => !boosterPacks.some((pack) => pack.id === id),
    );
    for (const [id, count] of retired) {
      delete collection.packs[id];
      boosterPacks.forEach((pack, index) => {
        const share =
          Math.floor(count / boosterPacks.length) + (index < count % boosterPacks.length ? 1 : 0);
        if (share) collection.packs[pack.id] = addNumber(collection.packs[pack.id] ?? 0, share);
      });
    }
    // If card content changes rarity/legendary status, convert surplus exactly once on the next save.
    for (const [id, count] of Object.entries<number>(data.counts))
      grantCopies(collection, currentCardId(id), count, content);
    return collection;
  } catch {
    return null;
  }
}

/** Opening is one transaction: consume the pack, grant five cards, and crowns overflow before revealing. */
export function openCollectionBooster(
  collection: Collection,
  pack: BoosterPack,
  content: Registry,
  random: () => number = Math.random,
) {
  if (!packCount(collection, pack.id)) throw new Error("You have no boosters of this kind.");
  const ids = drawBooster(packCards(Object.values(content.cards), pack), random);
  const next: Collection = {
    ...collection,
    counts: { ...collection.counts },
    packs: { ...collection.packs },
    boostersOpened: collection.boostersOpened + 1,
  };
  next.packs[pack.id]--;
  const cards: CollectionCardReward[] = ids.map((id) => grantCopies(next, id, 1, content));
  return { collection: next, cards, crowns: cards.reduce((sum, card) => sum + card.crowns, 0) };
}

/** What `count` boosters cost: the bundle size has its own price, any other number is paid one by one. */
export const boosterPrice = (count: number) =>
  count === collectionRules.packBundle.count
    ? collectionRules.packBundle.cost
    : count * collectionRules.packCost;
export function buyCollectionBooster(
  collection: Collection,
  pack: BoosterPack,
  count = 1,
): Collection {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("Choose how many boosters to buy.");
  const price = boosterPrice(count);
  if (collection.crowns < price)
    throw new Error(
      count === 1
        ? `A booster costs ${collectionRules.packCost} crowns.`
        : `${count} boosters cost ${price} crowns.`,
    );
  return {
    ...collection,
    crowns: collection.crowns - price,
    packs: { ...collection.packs, [pack.id]: addNumber(packCount(collection, pack.id), count) },
  };
}
export const cardPrice = (card: CardDefinition) => collectionRules.cardCrowns[card.rarity];
/** Buying one copy of a card is one transaction: the wallet and the card change together, never past the ownership limit. */
export function buyCollectionCard(collection: Collection, card: CardDefinition): Collection {
  if (isAdventureExclusive(card)) throw new Error("This card is earned through adventures.");
  const owned = ownedCopyCount(collection.counts, card.id),
    price = cardPrice(card);
  if (owned >= ownershipLimit(card)) throw new Error(`You already own every copy of ${card.name}.`);
  if (collection.crowns < price) throw new Error(`${card.name} costs ${price} crowns.`);
  return {
    ...collection,
    crowns: collection.crowns - price,
    counts: { ...collection.counts, [card.id]: owned + 1 },
  };
}

/** Complete a deck's missing collection copies together. Validation comes before any balance or ownership mutation. */
export function buyMissingDeckCards(
  collection: Collection,
  cards: string[],
  content: Registry,
): Collection {
  const purchase = missingDeckPurchase(cards, collection.counts, content);
  if (!purchase.complete) throw new Error("This deck has invalid card copies.");
  if (!purchase.copies) return collection;
  if (collection.crowns < purchase.crowns)
    throw new Error(`You need ${purchase.crowns} crowns to complete this deck.`);
  const counts = { ...collection.counts };
  for (const item of purchase.cards)
    counts[item.id] = ownedCopyCount(counts, item.id) + item.copies;
  return { ...collection, crowns: collection.crowns - purchase.crowns, counts };
}
export function gainDebugCrowns(collection: Collection): Collection {
  return { ...collection, crowns: addNumber(collection.crowns, 1000) };
}
/** Debug: owns the full playable number of copies of every card. Never lowers a count and leaves the wallet alone. */
export function ownsEveryCard(collection: Collection, content: Registry): boolean {
  return Object.values(content.cards).every(
    (card) => ownedCopyCount(collection.counts, card.id) >= ownershipLimit(card),
  );
}
export function unlockAllCards(collection: Collection, content: Registry): Collection {
  if (ownsEveryCard(collection, content)) return collection;
  const counts = { ...collection.counts };
  for (const card of Object.values(content.cards))
    counts[card.id] = Math.max(ownedCopyCount(counts, card.id), ownershipLimit(card));
  return { ...collection, counts };
}

/** Wins by the collection owner (p1) earn rewards. Replaying, reloading, or revisiting a result cannot grant twice. */
export function claimVictory(
  collection: Collection,
  matchId: string | undefined,
  outcome: GameState["outcome"],
  eligible: boolean,
): Collection {
  if (!eligible || !matchId || outcome !== "p1" || collection.rewardedMatches.includes(matchId))
    return collection;
  // Victory boosters rotate through the packs so no alignment is favoured.
  const reward = boosterPacks[collection.rewardedMatches.length % boosterPacks.length];
  return {
    ...collection,
    crowns: addNumber(collection.crowns, collectionRules.victoryCrowns),
    packs: {
      ...collection.packs,
      [reward.id]: addNumber(packCount(collection, reward.id), collectionRules.victoryBoosters),
    },
    rewardedMatches: [...collection.rewardedMatches, matchId],
  };
}
