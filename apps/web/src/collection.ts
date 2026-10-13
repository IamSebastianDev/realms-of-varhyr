import { deckRules, type CardDefinition, type GameState, type Registry } from '../../../packages/contracts/src';
import { drawBooster, packCards, type BoosterPack } from '../../../packages/content/src/boosters';
import type { RewardCollection } from './boosterRewards';

/** Copies belong to a logical card ID, independent of set labels or future artwork choices. Missing IDs mean zero owned. */
export type OwnedCopies = Readonly<Record<string, number>>;

export function ownedCopyCount(collection: OwnedCopies, id: string): number {
  const count = Object.hasOwn(collection, id) ? collection[id] : 0;
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** Provisional POC economy. Keep all tuning values here. */
export const collectionRules = {
  startingBoosters: 5,
  starterPack: 'bounty',
  packCost: 100,
  victoryCrowns: 25,
  victoryBoosters: 1,
  duplicateCrowns: { common: 10, rare: 25, legendary: 100 },
} as const;
export const collectionKey = 'varhyr-collection-v1';
export type Collection = {
  version: 1;
  counts: Record<string, number>;
  crowns: number;
  packs: Record<string, number>;
  boostersOpened: number;
  rewardedMatches: string[];
};
export type CollectionCardReward = { id: string; isNew: boolean; copies: number; crowns: number };
export const emptyCollection = (): Collection => ({ version: 1, counts: {}, crowns: 0, packs: {}, boostersOpened: 0, rewardedMatches: [] });
export const ownershipLimit = (card: CardDefinition) => card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;
export const packCount = (collection: Collection, id: string) => ownedCopyCount(collection.packs, id);
export const totalPacks = (collection: Collection) => Object.values(collection.packs).reduce((sum, count) => sum + count, 0);
export function missingDeckCopies(cards: string[], owned: OwnedCopies) {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].flatMap(([id, needed]) => {
    const have = ownedCopyCount(owned, id);
    return needed > have ? [{ id, needed, owned: have, missing: needed - have }] : [];
  });
}

function addNumber(a: number, b: number) { return Math.min(Number.MAX_SAFE_INTEGER, a + b); }
function grantCopies(collection: Collection, id: string, amount: number, content: Registry) {
  const previous = ownedCopyCount(collection.counts, id), card = content.cards[id];
  // Preserve retired card IDs for later content restoration; they are not in booster pools.
  const limit = card ? ownershipLimit(card) : deckRules.copiesPerCard;
  const kept = Math.min(amount, Math.max(0, limit - previous));
  const crowns = (amount - kept) * collectionRules.duplicateCrowns[card?.rarity ?? 'common'];
  collection.counts[id] = previous + kept;
  collection.crowns = addNumber(collection.crowns, crowns);
  return { id, isNew: previous === 0 && kept > 0, copies: collection.counts[id], crowns };
}

/** An empty account receives one starter and five general packs, once, when first persisted.
 * Import previous booster rewards as additional grants, dusting excess copies. Do not rewrite old storage.
 */
export function createCollection(content: Registry, starter: string[], legacy?: RewardCollection): Collection {
  const collection = emptyCollection();
  for (const id of starter) if (content.cards[id]) grantCopies(collection, id, 1, content);
  if (legacy) {
    for (const [id, count] of Object.entries(legacy.counts)) grantCopies(collection, id, count, content);
    collection.boostersOpened = legacy.boostersOpened;
  }
  collection.packs[collectionRules.starterPack] = collectionRules.startingBoosters;
  return collection;
}

const validCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const validCounts = (value: unknown): value is Record<string, number> => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.entries(value).every(([id, count]) => id.length > 0 && validCount(count));

export function parseCollection(raw: string | null, content: Registry): Collection | null {
  try {
    const data = JSON.parse(raw ?? 'null');
    // Saves from before the rename kept this balance under `dust`.
    if (data && data.crowns === undefined && data.dust !== undefined) data.crowns = data.dust;
    if (!data || data.version !== 1 || !validCounts(data.counts) || !validCounts(data.packs)
      || !validCount(data.crowns) || !validCount(data.boostersOpened) || !Array.isArray(data.rewardedMatches)
      || !data.rewardedMatches.every((id: unknown) => typeof id === 'string' && id.length > 0)) return null;
    const collection: Collection = { version: 1, counts: {}, packs: { ...data.packs }, crowns: data.crowns,
      boostersOpened: data.boostersOpened, rewardedMatches: [...new Set<string>(data.rewardedMatches)] };
    // Retired faction packs become all-card packs, so saved rewards remain usable.
    // Removing their keys makes migration idempotent on subsequent reads/saves.
    for (const id of ['crown','neutral','winter']) {
      const count=collection.packs[id];
      if(count)collection.packs.bounty=addNumber(collection.packs.bounty??0,count);
      delete collection.packs[id];
    }
    // If card content changes rarity/legendary status, convert surplus exactly once on the next save.
    for (const [id, count] of Object.entries<number>(data.counts)) grantCopies(collection, id, count, content);
    return collection;
  } catch { return null; }
}

/** Opening is one transaction: consume the pack, grant five cards, and crowns overflow before revealing. */
export function openCollectionBooster(collection: Collection, pack: BoosterPack, content: Registry, random: () => number = Math.random) {
  if (!packCount(collection, pack.id)) throw new Error('You have no boosters of this kind.');
  const ids = drawBooster(packCards(Object.values(content.cards), pack), random);
  const next: Collection = { ...collection, counts: { ...collection.counts }, packs: { ...collection.packs }, boostersOpened: collection.boostersOpened + 1 };
  next.packs[pack.id]--;
  const cards: CollectionCardReward[] = ids.map(id => grantCopies(next, id, 1, content));
  return { collection: next, cards, crowns: cards.reduce((sum, card) => sum + card.crowns, 0) };
}

export function buyCollectionBooster(collection: Collection, pack: BoosterPack): Collection {
  if (collection.crowns < collectionRules.packCost) throw new Error(`A booster costs ${collectionRules.packCost} crowns.`);
  return { ...collection, crowns: collection.crowns - collectionRules.packCost,
    packs: { ...collection.packs, [pack.id]: addNumber(packCount(collection, pack.id), 1) } };
}
export function gainDebugCrowns(collection: Collection): Collection {
  return { ...collection, crowns: addNumber(collection.crowns, 1000) };
}

/** Wins by the collection owner (p1) earn rewards. Replaying, reloading, or revisiting a result cannot grant twice. */
export function claimVictory(collection: Collection, matchId: string | undefined, outcome: GameState['outcome'], eligible: boolean): Collection {
  if (!eligible || !matchId || outcome !== 'p1' || collection.rewardedMatches.includes(matchId)) return collection;
  return { ...collection, crowns: addNumber(collection.crowns, collectionRules.victoryCrowns),
    packs: { ...collection.packs, [collectionRules.starterPack]: addNumber(packCount(collection, collectionRules.starterPack), collectionRules.victoryBoosters) },
    rewardedMatches: [...collection.rewardedMatches, matchId] };
}
