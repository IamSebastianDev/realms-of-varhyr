import { deckRules, type CardDefinition } from "@realms/contracts";
import type { QuestContent } from "./content";
import type { Rng } from "./rng";
import { questRules } from "./rules";

const rarityOrder = { common: 0, rare: 1, legendary: 2 } as const;
const limitOf = (card: CardDefinition) =>
  card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;
export const isProducer = (card: CardDefinition) => !!card.stats?.energyOutputs.length;
const totalCost = (card: CardDefinition) =>
  card.cost.generic + Object.values(card.cost.factions).reduce((sum, n) => sum + n, 0);
const byOrder = (a: CardDefinition, b: CardDefinition) =>
  rarityOrder[a.rarity] - rarityOrder[b.rarity] ||
  totalCost(a) - totalCost(b) ||
  (a.id < b.id ? -1 : 1);

/** A faction's quest pool: its own cards plus the unaligned ones. Cards of two factions belong to either. */
export function poolFor(content: QuestContent, faction: string): CardDefinition[] {
  return Object.values(content.cards)
    .filter((card) => card.factions.length === 0 || card.factions.includes(faction))
    .sort(byOrder);
}

/** How many legal cards the pool can fill: the deck limits apply, so a thin faction cannot field a full deck. */
export function capacity(content: QuestContent, faction: string): number {
  const limits = new Map<string, number>();
  for (const card of poolFor(content, faction)) limits.set(card.deckLimitKey, limitOf(card));
  return [...limits.values()].reduce((sum, n) => sum + n, 0);
}
/** A faction can run a quest once its cards can make a legal deck with a few producers to pay for it. */
export function isPlayable(content: QuestContent, faction: string): boolean {
  const pool = poolFor(content, faction);
  return (
    capacity(content, faction) >= deckRules.minimumCards && pool.filter(isProducer).length >= 3
  );
}
export const playableFactions = (content: QuestContent) =>
  [...new Set(content.packs.flatMap((pack) => pack.factions))].filter((faction) =>
    isPlayable(content, faction),
  );

/** Copies of this card, counted across artwork variants the way the deck rules count them. */
export function copiesOf(
  content: QuestContent,
  deck: readonly string[],
  card: CardDefinition,
): number {
  return deck.filter((id) => content.cards[id]?.deckLimitKey === card.deckLimitKey).length;
}
export const canAdd = (content: QuestContent, deck: readonly string[], id: string): boolean => {
  const card = content.cards[id];
  return !!card && copiesOf(content, deck, card) < limitOf(card);
};

/** Spreads copies over the cards in turn, so a deck gets variety before it gets triples. */
function spread(
  cards: CardDefinition[],
  count: number,
  deck: string[],
  content: QuestContent,
): string[] {
  const out: string[] = [];
  for (let pass = 0; out.length < count && pass < deckRules.copiesPerCard; pass++) {
    for (const card of cards) {
      if (out.length >= count) break;
      if (canAdd(content, [...deck, ...out], card.id)) out.push(card.id);
    }
  }
  return out;
}

/** Fills a deck card by card, a few copies of each, so the start is a plan and not one of everything. */
function stack(
  cards: CardDefinition[],
  count: number,
  deck: string[],
  content: QuestContent,
  perCard: number,
): string[] {
  const out: string[] = [];
  for (const card of cards) {
    for (let copy = 0; copy < perCard && out.length < count; copy++)
      if (canAdd(content, [...deck, ...out], card.id)) out.push(card.id);
  }
  return out;
}

/** The faction's fixed 15 cards: eight producers (two copies each) and a handful of cheap singles. Legendaries are earned, not given. */
export function baseDeck(content: QuestContent, faction: string): string[] {
  const own = poolFor(content, faction).filter((card) => !card.legendary);
  const cost = (card: CardDefinition) =>
    card.cost.generic + Object.values(card.cost.factions).reduce((sum, amount) => sum + amount, 0);
  const cheapest = (list: CardDefinition[]) =>
    [...list].sort((x, y) => cost(x) - cost(y) || x.name.localeCompare(y.name));
  const producers = own.filter(isProducer),
    core = own.filter((card) => !isProducer(card));
  const ordered = [
    ...cheapest(producers.filter((card) => card.factions.length)),
    ...cheapest(producers.filter((card) => !card.factions.length)),
  ];
  // Two copies of each producer, the faction's own first; then assorted singles of the cheapest core cards.
  const deck = stack(ordered, questRules.baseProducers, [], content, 2);
  deck.push(...stack(cheapest(core), questRules.baseDeck - deck.length, deck, content, 1));
  if (deck.length < questRules.baseDeck)
    deck.push(...spread(ordered, questRules.baseDeck - deck.length, deck, content));
  return deck;
}

/** Candidates for an offer: cards of the pool that the deck can still take. */
export function candidates(
  content: QuestContent,
  faction: string,
  deck: readonly string[],
  rarities?: readonly CardDefinition["rarity"][],
): CardDefinition[] {
  return poolFor(content, faction).filter(
    (card) => canAdd(content, deck, card.id) && (!rarities || rarities.includes(card.rarity)),
  );
}

/** A pick pack x/y: x distinct cards drawn by rarity weight, from which the player takes y. */
export function offerPack(
  content: QuestContent,
  faction: string,
  deck: readonly string[],
  rng: Rng,
  size: number = questRules.packSize,
  rarities?: readonly CardDefinition["rarity"][],
): string[] {
  const pool = candidates(content, faction, deck, rarities);
  const chosen: CardDefinition[] = [];
  for (let i = 0; i < size && chosen.length < pool.length; i++) {
    const left = pool.filter((card) => !chosen.includes(card));
    chosen.push(rng.weighted(left, (card) => questRules.rarityWeights[card.rarity]));
  }
  return chosen.map((card) => card.id);
}

/** A full legal deck for an enemy: the faction's base plus whatever the pool still allows. */
export function enemyDeck(
  content: QuestContent,
  faction: string,
  rng: Rng,
  size: number = deckRules.minimumCards,
): string[] {
  const deck = baseDeck(content, faction);
  while (deck.length < size) {
    const pool = candidates(content, faction, deck);
    if (!pool.length) break;
    deck.push(rng.weighted(pool, (card) => questRules.rarityWeights[card.rarity]).id);
  }
  return deck;
}
