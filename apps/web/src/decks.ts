import { deckRules, type CardDefinition, type Registry } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { registry, starterDefinitions } from '../../../packages/content/src';
import { ownedCopyCount, type OwnedCopies } from './collection';
import { currentCardIds } from './cardIds';

export type CustomDeck = { id: string; name: string; cards: string[] };
export const decksKey = 'varhir-decks-v1';
export const draftKey = 'varhir-deck-draft-v1';
export const starterOptions = starterDefinitions;
export const copyLimit = (card: CardDefinition) => card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;

/** Variants share a deckLimitKey so alternate artwork cannot bypass copy limits. */
export function copyCount(cards: string[], id: string, content: Registry = registry): number {
  const key = content.cards[id]?.deckLimitKey;
  return key ? cards.filter(cardId => content.cards[cardId]?.deckLimitKey === key).length : 0;
}

/** Ownership is per ID; the deck's legal cap is shared across artwork variants.
 * Omitting ownership retains unrestricted catalogue access for existing prototype callers.
 */
export function deckCardAvailability(cards: string[], id: string, content: Registry = registry, owned?: OwnedCopies) {
  const card = content.cards[id];
  const limit = card ? copyLimit(card) : 0;
  const inDeck = cards.filter(cardId => cardId === id).length;
  const copies = card && owned !== undefined ? ownedCopyCount(owned, id) : limit;
  const used = copyCount(cards, id, content);
  const limitReached = used >= limit;
  const remaining = Math.max(0, Math.min(limit - used, copies - inDeck));
  return { owned: copies, inDeck, limit, limitReached, remaining };
}

export function addDeckCard(cards: string[], id: string, content: Registry = registry, owned?: OwnedCopies): string[] {
  if (!deckCardAvailability(cards, id, content, owned).remaining) return cards;
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
  const cards = Array.isArray(deck.cards) && deck.cards.every(id => typeof id === 'string') ? currentCardIds(deck.cards) : null;
  if (
    typeof deck.id !== 'string' || !deck.id.startsWith('custom-') ||
    typeof deck.name !== 'string' || (!allowBlankName && !deck.name.trim()) || deck.name.length > 60 ||
    !cards || !cards.every(id => content.cards[id])
  ) return null;
  if (validateDeck(cards, content).some(error => !error.startsWith('A deck needs'))) return null;
  return { id: deck.id, name: deck.name.trim(), cards };
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
