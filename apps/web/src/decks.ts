import { deckRules, type Registry } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { registry, starterDefinitions } from '../../../packages/content/src';

export type CustomDeck = { id: string; name: string; cards: string[] };
export const decksKey = 'varhir-decks-v1';
export const draftKey = 'varhir-deck-draft-v1';
export const starterOptions = starterDefinitions;

/** Variants share a deckLimitKey so alternate artwork cannot bypass copy limits. */
export function copyCount(cards: string[], id: string, content: Registry = registry): number {
  const key = content.cards[id]?.deckLimitKey;
  return key ? cards.filter(cardId => content.cards[cardId]?.deckLimitKey === key).length : 0;
}

export function addDeckCard(cards: string[], id: string, content: Registry = registry): string[] {
  const card = content.cards[id];
  const limit = card?.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;
  if (!card || copyCount(cards, id, content) >= limit) return cards;
  return [...cards, id];
}

export function removeDeckCard(cards: string[], id: string): string[] {
  const index = cards.indexOf(id);
  return index < 0 ? cards : [...cards.slice(0, index), ...cards.slice(index + 1)];
}

/** Unfinished decks may be saved. Missing cards or excess copies are invalid. */
export function parseDeck(value: unknown, allowBlankName = false, content: Registry = registry): CustomDeck | null {
  if (!value || typeof value !== 'object') return null;
  const deck = value as Partial<CustomDeck>;
  if (
    typeof deck.id !== 'string' || !deck.id.startsWith('custom-') ||
    typeof deck.name !== 'string' || (!allowBlankName && !deck.name.trim()) || deck.name.length > 60 ||
    !Array.isArray(deck.cards) || !deck.cards.every(id => typeof id === 'string' && content.cards[id])
  ) return null;
  if (validateDeck(deck.cards, content).some(error => !error.startsWith('A deck needs'))) return null;
  return { id: deck.id, name: deck.name.trim(), cards: [...deck.cards] };
}

export function parseDecks(raw: string | null, content: Registry = registry): CustomDeck[] {
  try {
    const values: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values.flatMap(value => {
      const deck = parseDeck(value, false, content);
      if (!deck || seen.has(deck.id)) return [];
      seen.add(deck.id);
      return [deck];
    });
  } catch { return []; }
}
