import type { CardDefinition, Registry } from '../../../packages/contracts/src';
import { describeAbility } from '../../../packages/extensions/src/describeAbility';
import { copyCount, copyLimit, deckCardAvailability, type CustomDeck } from './decks';
import type { OwnedCopies } from './collection';
export { copyLimit } from './decks';

export const cardCost = (card: CardDefinition) => card.cost.generic + Object.values(card.cost.factions).reduce((sum, n) => sum + n, 0);
export const isProducer = (card: CardDefinition) => card.type === 'creature' && !!card.stats?.energyOutputs.some(output => Object.values(output).some(n => n > 0));
export type CardSort = 'cost' | 'name' | 'attack' | 'defense';
export type BuilderFilters = { query: string; faction: string; kind: string; rarity: string; cost: number | null; role: 'all' | 'producers' | 'free-producers'; addable: boolean; sort: CardSort };
export const initialBuilderFilters: BuilderFilters = { query: '', faction: 'all', kind: 'all', rarity: 'all', cost: null, role: 'all', addable: false, sort: 'cost' };

export function builderCards(content: Registry, deck: string[], filters: BuilderFilters, owned?: OwnedCopies): CardDefinition[] {
  const words = filters.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return Object.values(content.cards).filter(card => {
    const bindings = card.type === 'spell' ? [...card.abilities, ...(card.cast ?? [])] : card.abilities;
    const text = [card.name, card.lore, ...card.subtypes, ...card.factions, card.legendary ? 'legendary' : '', ...bindings.map(binding => {
      const ability = describeAbility(binding, content.abilities[binding.id]);
      return `${ability.name} ${ability.description}`;
    })].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word))
      && (filters.faction === 'all' || (filters.faction === 'neutral' ? !card.factions.length : card.factions.includes(filters.faction)))
      && (filters.kind === 'all' || card.type === filters.kind)
      && (filters.rarity === 'all' || card.rarity === filters.rarity)
      && (filters.cost === null || Math.min(6, cardCost(card)) === filters.cost)
      && (filters.role === 'all' || isProducer(card) && (filters.role !== 'free-producers' || cardCost(card) === 0))
      && (!filters.addable || deckCardAvailability(deck, card.id, content, owned).remaining > 0);
  }).sort((a, b) => {
    const primary = filters.sort === 'cost' ? cardCost(a) - cardCost(b)
      : filters.sort === 'attack' ? (b.stats?.attack ?? 0) - (a.stats?.attack ?? 0)
      : filters.sort === 'defense' ? (b.stats?.defense ?? 0) - (a.stats?.defense ?? 0) : 0;
    return primary || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function summarizeDeck(ids: string[], content: Registry) {
  const cards = ids.flatMap(id => content.cards[id] ? [content.cards[id]] : []);
  const curve = Array<number>(7).fill(0);
  const types = { creature: 0, spell: 0, bastion: 0 };
  let totalCost = 0, producers = 0, freeProducers = 0;
  for (const card of cards) {
    const cost = cardCost(card);
    curve[Math.min(6, cost)]++;
    types[card.type]++;
    totalCost += cost;
    if (isProducer(card)) { producers++; if (!cost) freeProducers++; }
  }
  return { total: ids.length, unique: new Set(ids).size, curve, types, producers, freeProducers, averageCost: cards.length ? totalCost / cards.length : 0 };
}

/** Portable decks carry stable card IDs, not local saved-deck identities. */
export function exportDeck(deck: CustomDeck): string {
  const counts: Record<string, number> = {};
  for (const id of deck.cards) counts[id] = (counts[id] ?? 0) + 1;
  return JSON.stringify({ format: 'varhyr-deck', version: 1, name: deck.name.trim() || 'Untitled deck', cards: Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => ({ id, count })) }, null, 2);
}

/** An import is a new draft. Validate the entire file before replacing the current one. */
export function importDeck(raw: string, content: Registry): Pick<CustomDeck, 'name' | 'cards'> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('This file does not contain a deck.');
  const data = value as { format?: unknown; version?: unknown; name?: unknown; cards?: unknown };
  if (data.format !== 'varhyr-deck' || data.version !== 1) throw new Error('Choose a Realms of Varhyr deck export.');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 60 || !Array.isArray(data.cards)) throw new Error('The deck name or card list is invalid.');
  const cards: string[] = [];
  for (const entry of data.cards) {
    if (!entry || typeof entry !== 'object') throw new Error('The card list is invalid.');
    const { id, count } = entry as { id?: unknown; count?: unknown };
    if (typeof id !== 'string' || !Object.hasOwn(content.cards, id)) throw new Error(`Unknown card: ${String(id)}.`);
    const card = content.cards[id];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > copyLimit(card)
      || copyCount(cards, id, content) + count > copyLimit(card)) throw new Error(`Too many or invalid copies of ${card.name}.`);
    cards.push(...Array<string>(count).fill(id));
  }
  return { name: data.name.trim(), cards };
}
