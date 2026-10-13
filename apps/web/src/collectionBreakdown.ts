import type { CardDefinition, Registry } from '../../../packages/contracts/src';
import { ownedCopyCount, ownershipLimit, type OwnedCopies } from './collection';
import { neutralId } from '../../../packages/content/src/factionDefinition';

/** One row of a breakdown: how much of a group of cards the player has. */
export type StatSlice = { id: string; unique: number; uniqueTotal: number; copies: number; copiesTotal: number };
export type CostBucket = { cost: number; unique: number; uniqueTotal: number };
export type CollectionStats = {
  unique: number; uniqueTotal: number;
  copies: number; copiesTotal: number;
  /** Cards owned up to their ownership limit. */
  playsets: number;
  byFaction: StatSlice[]; byRarity: StatSlice[]; byType: StatSlice[];
  curve: CostBucket[];
  missing: CardDefinition[];
};

export const cardCost = (card: CardDefinition) => card.cost.generic + Object.values(card.cost.factions).reduce((sum, amount) => sum + (amount ?? 0), 0);
/** Cards with no faction count as neutral; a card shared by two factions counts toward both. */
export const cardGroups = (card: CardDefinition) => card.factions.length ? card.factions : [neutralId];
const rarityOrder = ['common', 'rare', 'legendary'];
const typeOrder = ['creature', 'spell', 'bastion'];

export function collectionStats(owned: OwnedCopies, registry: Registry, factionOrder: string[] = []): CollectionStats {
  const cards = Object.values(registry.cards);
  const copiesOf = (card: CardDefinition) => Math.min(ownedCopyCount(owned, card.id), ownershipLimit(card));
  const slice = (id: string, group: CardDefinition[]): StatSlice => ({
    id, unique: group.filter(card => copiesOf(card) > 0).length, uniqueTotal: group.length,
    copies: group.reduce((sum, card) => sum + copiesOf(card), 0), copiesTotal: group.reduce((sum, card) => sum + ownershipLimit(card), 0),
  });
  const keys = (values: string[], order: string[]) => [...new Set(values)].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const byFaction = keys(cards.flatMap(cardGroups), factionOrder).map(id => slice(id, cards.filter(card => cardGroups(card).includes(id))));
  const byRarity = keys(cards.map(card => card.rarity), rarityOrder).map(id => slice(id, cards.filter(card => card.rarity === id)));
  const byType = keys(cards.map(card => card.type), typeOrder).map(id => slice(id, cards.filter(card => card.type === id)));
  const costs = cards.map(cardCost);
  const top = Math.max(0, ...costs);
  const curve = Array.from({ length: top + 1 }, (_, cost) => {
    const group = cards.filter(card => cardCost(card) === cost);
    return { cost, unique: group.filter(card => copiesOf(card) > 0).length, uniqueTotal: group.length };
  });
  const all = slice('all', cards);
  return {
    unique: all.unique, uniqueTotal: all.uniqueTotal, copies: all.copies, copiesTotal: all.copiesTotal,
    playsets: cards.filter(card => copiesOf(card) >= ownershipLimit(card)).length,
    byFaction, byRarity, byType, curve,
    missing: cards.filter(card => copiesOf(card) === 0).sort((a, b) => rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity) || cardCost(a) - cardCost(b) || a.name.localeCompare(b.name)),
  };
}
