import { avatarDefinitions, factionDefinitions, registry, starterDefinitions } from '../../../packages/content/src';
import { collectionKey } from './collection';
import { decksKey } from './decks';
import { nameKey } from './profile';
import { tutorialKey } from './tutorial';

/** Set once a player has chosen a starter and a name. Existing saves predate it, so any prior data counts as an account. */
export const accountKey = 'varhyr-account-v1';
export function hasAccount(): boolean {
  try {
    if (localStorage.getItem(accountKey)) return true;
    return [collectionKey, nameKey, tutorialKey, decksKey, 'varhir-session-v1'].some(key => localStorage.getItem(key) !== null);
  } catch { return true; /* Without storage nothing can be saved, so don't gate the game on it. */ }
}
export function markAccount() { try { localStorage.setItem(accountKey, '1'); } catch { /* Best effort. */ } }

const rarityOrder = { common: 0, rare: 1, legendary: 2 } as const;
export type StarterOffer = { id: string; name: string; faction: string; avatar: string; cards: { id: string; copies: number }[]; total: number };
/** Each starter with its faction hero and its distinct cards ordered commons first so the best card is revealed last. */
export function starterOffers(): StarterOffer[] {
  return starterDefinitions.flatMap(deck => {
    const faction = factionDefinitions.find(f => f.starter?.id === deck.id);
    const avatar = avatarDefinitions.find(a => a.faction === faction?.id);
    if (!faction || !avatar) return [];
    const counts = new Map<string, number>();
    for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
    const cards = [...counts].filter(([id]) => registry.cards[id])
      .map(([id, copies]) => ({ id, copies }))
      .sort((a, b) => rarityOrder[registry.cards[a.id].rarity] - rarityOrder[registry.cards[b.id].rarity]
        || registry.cards[a.id].cost.generic + Object.values(registry.cards[a.id].cost.factions).reduce((s, n) => s + n, 0)
         - registry.cards[b.id].cost.generic - Object.values(registry.cards[b.id].cost.factions).reduce((s, n) => s + n, 0));
    return [{ id: deck.id, name: deck.name, faction: faction.id, avatar: avatar.id, cards, total: deck.cards.length }];
  });
}
