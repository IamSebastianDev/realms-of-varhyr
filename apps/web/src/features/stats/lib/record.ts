import type { GameState, PlayerId, Registry } from "@realms/contracts";
import { deckVersion, type MatchMode, type MatchRecord, type Opponent } from "./ledger";

/** The factions a set of cards leans on. A faction needs two cards to count, unless nothing else qualifies (one card is a splash). */
export function archetype(cards: readonly string[], registry: Registry): string[] {
  const weight = new Map<string, number>();
  for (const id of cards)
    for (const faction of registry.cards[id]?.factions ?? [])
      if (faction !== "neutral") weight.set(faction, (weight.get(faction) ?? 0) + 1);
  const ranked = [...weight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strong = ranked.filter(([, n]) => n >= 2);
  return (strong.length ? strong : ranked.slice(0, 1)).map(([faction]) => faction);
}

/** Cards of a seat from the start of the match plus anything that reached the table later (online, the library is hidden). */
function seenCards(initial: GameState, state: GameState, seat: PlayerId, registry: Registry) {
  const ids = new Map<string, string>();
  for (const source of [initial, state])
    for (const [key, card] of Object.entries(source.cards))
      if (card.owner === seat && registry.cards[card.definitionId]) ids.set(key, card.definitionId);
  return [...ids.values()];
}

export type RecordContext = {
  id: string;
  at: string;
  mode: MatchMode;
  deckId: string;
  deckName: string;
  registry: Registry;
  online: boolean;
  /** The deck you played. A match only exposes the cards your seat has seen, so the list comes from the deck itself. */
  cards: readonly string[];
};

/** One ledger entry for a finished match, seen from `seat`. Returns the card list played so the ledger can store it once. */
export function buildRecord(
  initial: GameState,
  state: GameState,
  seat: PlayerId,
  ctx: RecordContext,
): { record: MatchRecord; cards: string[] } | null {
  const outcome = state.outcome;
  if (!outcome || !ctx.cards.length) return null;
  const { registry } = ctx;
  const other: PlayerId = seat === "p1" ? "p2" : "p1";
  // The same in every mode: the opponent is whatever their played cards show, never a lookup of their deck.
  const opponent: Opponent = {
    factions: archetype(seenCards(initial, state, other, registry), registry),
  };
  const cards = [...ctx.cards];
  return {
    cards,
    record: {
      id: ctx.id,
      at: ctx.at,
      deckId: ctx.deckId,
      deckName: ctx.deckName,
      version: deckVersion(cards),
      opponent,
      mode: ctx.mode,
      first: initial.active === seat,
      result: outcome === seat ? "won" : outcome === "draw" ? "draw" : "lost",
      turns: Math.ceil(state.turn / 2),
      life: Math.max(0, state.players[seat].life),
    },
  };
}
