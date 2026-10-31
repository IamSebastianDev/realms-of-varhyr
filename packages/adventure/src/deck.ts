import { deckRules, type CardDefinition } from "@realms/contracts";
import type { Rng } from "@realms/core/rng";
import { adventureRules } from "./rules";

/** The game's cards, as the app passes them in. */
export type AdventureContent = { cards: Record<string, CardDefinition> };

const limitOf = (card: CardDefinition) =>
  card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;

/** Copies of this card, counted across artwork variants the way the deck rules count them. */
export function copiesOf(
  content: AdventureContent,
  deck: readonly string[],
  card: CardDefinition,
): number {
  return deck.filter((id) => content.cards[id]?.deckLimitKey === card.deckLimitKey).length;
}
export const canAdd = (content: AdventureContent, deck: readonly string[], id: string): boolean => {
  const card = content.cards[id];
  return !!card && copiesOf(content, deck, card) < limitOf(card);
};

/** A faction's pool: its own cards plus the unaligned ones. Cards of two factions belong to either. */
export function poolFor(content: AdventureContent, faction: string): CardDefinition[] {
  return Object.values(content.cards)
    .filter((card) => card.factions.length === 0 || card.factions.includes(faction))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Cards of the pool the deck can still take, optionally restricted to a list. */
export function candidates(
  content: AdventureContent,
  faction: string,
  deck: readonly string[],
  from?: readonly string[],
): CardDefinition[] {
  const pool = from
    ? from.map((id) => content.cards[id]).filter((card): card is CardDefinition => !!card)
    : poolFor(content, faction);
  return pool.filter((card) => (from || !card.legendary) && canAdd(content, deck, card.id));
}

/** A pick pack: `size` distinct cards drawn by rarity weight. */
export function offerCards(
  content: AdventureContent,
  faction: string,
  deck: readonly string[],
  rng: Rng,
  size: number,
  options: { from?: readonly string[]; weights?: Record<CardDefinition["rarity"], number> } = {},
): string[] {
  const pool = candidates(content, faction, deck, options.from);
  const weights = options.weights ?? adventureRules.rarityWeights;
  const chosen: CardDefinition[] = [];
  for (let i = 0; i < size && chosen.length < pool.length; i++) {
    const left = pool.filter((card) => !chosen.includes(card));
    chosen.push(rng.weighted(left, (card) => weights[card.rarity]));
  }
  return chosen.map((card) => card.id);
}
