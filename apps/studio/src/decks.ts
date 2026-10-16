import { deckRules } from '../../../packages/contracts/src/deckRules';
import { costOf, named, type Stored } from './model';

/** A starter deck as stored in a faction file: card id -> copies. */
export type Starter = { id: string; name: string; default?: boolean; cards: Record<string, number> };

export const deckSize = (cards: Record<string, number>) => Object.values(cards).reduce((sum, n) => sum + n, 0);
export const limitOf = (data: Record<string, any>) => data.rarity === 'legendary' ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;
/** Best energy a card produces in one pool; 0 for cards that produce none. */
export const outputOf = (data: Record<string, any>) => Math.max(0, ...((data.stats?.energyOutputs ?? []) as Record<string, number>[]).map(pool => Object.values(pool).reduce((sum, n) => sum + n, 0)));

/** Cards a faction's starter may use: its own and neutral ones. Hybrids need a second faction's energy, so they stay out. */
export const poolFor = (cards: Stored[], faction: string) => cards.filter(card => named(card.data).every(id => id === faction));

/** The deck rules, applied to card data (the importer and the game check the same limits). */
export function deckProblems(deck: Record<string, number>, cards: Stored[]): string[] {
  const byId = new Map(cards.map(card => [card.data.id as string, card.data]));
  const problems: string[] = [], keys: Record<string, number> = {}, total = deckSize(deck);
  if (total < deckRules.minimumCards) problems.push(`A deck needs at least ${deckRules.minimumCards} cards (it has ${total}).`);
  for (const [id, copies] of Object.entries(deck)) {
    const data = byId.get(id);
    if (!data) { problems.push(`Unknown card: ${id}.`); continue; }
    const key = data.deckLimitKey ?? id;
    keys[key] = (keys[key] ?? 0) + copies;
    if (keys[key] > limitOf(data)) problems.push(`Too many copies of ${data.name} (limit ${limitOf(data)}).`);
  }
  return problems;
}

export type DeckStats = { total: number; type: Record<string, number>; average: number; curve: number[]; producers: number; legendary: number };
export function deckStats(deck: Record<string, number>, cards: Stored[], curveMax = 7): DeckStats {
  const byId = new Map(cards.map(card => [card.data.id as string, card.data]));
  const stats: DeckStats = { total: 0, type: {}, average: 0, curve: Array(curveMax + 1).fill(0), producers: 0, legendary: 0 };
  let cost = 0, spent = 0;
  for (const [id, copies] of Object.entries(deck)) {
    const data = byId.get(id);
    if (!data) continue;
    stats.total += copies; stats.type[data.type] = (stats.type[data.type] ?? 0) + copies;
    stats.curve[Math.min(curveMax, costOf(data))] += copies;
    if (outputOf(data)) stats.producers += copies;
    if (data.rarity === 'legendary') stats.legendary += copies;
    if (data.type !== 'holding') { cost += costOf(data) * copies; spent += copies; }
  }
  stats.average = spent ? cost / spent : 0;
  return stats;
}

/**
 * A legal first draft: about 55% creatures, 25% spells, the rest holdings, early energy first,
 * a spread of cards before extra copies, and a curve centred on cost 3. The result is meant to be edited.
 */
export function generateDeck(pool: Stored[], size: number = deckRules.minimumCards): Record<string, number> {
  const deck: Record<string, number> = {}, keys: Record<string, number> = {};
  let total = 0;
  const count = (type: string) => pool.reduce((sum, card) => card.data.type === type ? sum + (deck[card.data.id] ?? 0) : sum, 0);
  const ordered = [...pool].sort((a, b) => Math.abs(costOf(a.data) - 3) - Math.abs(costOf(b.data) - 3) || costOf(a.data) - costOf(b.data) || (a.data.id < b.data.id ? -1 : 1));
  const add = (card: Stored, copy: number) => {
    const { id, deckLimitKey } = card.data, key = deckLimitKey ?? id;
    if (total >= size || (deck[id] ?? 0) >= copy || copy > limitOf(card.data) || (keys[key] ?? 0) >= limitOf(card.data)) return false;
    deck[id] = copy; keys[key] = (keys[key] ?? 0) + 1; total++;
    return true;
  };
  // Cheap energy producers come first so the deck can play its own cards.
  const producers = [...pool].filter(card => outputOf(card.data) && card.data.type !== 'spell').sort((a, b) => costOf(a.data) - costOf(b.data) || (a.data.id < b.data.id ? -1 : 1));
  let made = 0;
  for (let copy = 1; copy <= deckRules.copiesPerCard && made < 8; copy++) for (const card of producers) if (made < 8 && add(card, copy)) made++;
  const targets: [string, number][] = [['creature', Math.round(size * 0.55)], ['spell', Math.round(size * 0.25)], ['holding', size]];
  for (const [type, target] of targets) {
    const own = ordered.filter(card => card.data.type === type);
    for (let copy = 1; copy <= deckRules.copiesPerCard && count(type) < target; copy++) for (const card of own) if (count(type) < target) add(card, copy);
  }
  for (let copy = 1; copy <= deckRules.copiesPerCard; copy++) for (const card of ordered) add(card, copy);
  return deck;
}
