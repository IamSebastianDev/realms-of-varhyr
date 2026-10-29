import type { GameState, PlayerId, Registry } from "@realms/contracts";
import { other } from "./index";
import { botCommand } from "./bot";

/** Pending options are explicitly revealed to the decision maker. Other
 * heuristic decisions must not score draws against the real library order. */
export function observationBotCommand(state: GameState, registry: Registry) {
  return botCommand(
    state.pending ? state : sampleSearchWorld(state, state.responseStep ?? state.active, registry),
    registry,
  );
}

/** Trigger conditions (e.g. Accord's first spell) read this turn's event
 * counters. Retain those counters without private identities or old history. */
export function searchEvents(source: GameState): GameState["events"] {
  let start = source.events.length - 1;
  while (start >= 0 && source.events[start].type !== "turn.started") start--;
  return source.events
    .slice(Math.max(0, start))
    .map(({ seq, type, player }) => ({ seq, type, player, message: "", visibility: "public" }));
}

/** Common, reproducible hypothetical worlds. Never use the match's seed/RNG or
 * the opponent's hidden definitions. Only our own library's unordered contents
 * are known, as they are to a player who built the deck. */
export function sampleSearchWorld(
  source: GameState,
  actor: PlayerId,
  registry: Registry,
  sample = 0,
): GameState {
  const state = structuredClone(source);
  let seed = ((source.turn + 1) * 2654435761 + source.revision * 101 + sample * 7919) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shuffle = (ids: string[]) => {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  };
  const foe = other(actor);
  const player = state.players[foe];
  // Infer only publicly demonstrated colours. Neutral cards reveal no faction.
  const publicIds = [...player.board, ...player.discard].filter((id): id is string => !!id);
  const factions = new Set(
    publicIds.flatMap((id) => registry.cards[state.cards[id].definitionId].factions),
  );
  const counts = new Map<string, number>();
  for (const id of publicIds) {
    const def = state.cards[id].definitionId;
    counts.set(def, (counts.get(def) ?? 0) + 1);
  }
  const pool = Object.values(registry.cards)
    .filter(
      (def) => !def.factions.length || !factions.size || def.factions.every((f) => factions.has(f)),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((def) =>
      Array.from(
        { length: Math.max(0, (def.legendary ? 1 : 3) - (counts.get(def.id) ?? 0)) },
        () => def.id,
      ),
    );
  // Anonymous IDs prevent the real hidden hand/deck assignment influencing a tie.
  const handCount = player.hand.length,
    deckCount = player.deck.length;
  for (const id of [...player.hand, ...player.deck]) delete state.cards[id];
  player.hand = [];
  player.deck = [];
  shuffle(pool);
  const fallback = Object.keys(registry.cards).sort();
  for (let i = 0; i < handCount + deckCount; i++) {
    const id = `search-${foe}-${i}`;
    const zone = i < handCount ? "hand" : "deck";
    state.cards[id] = {
      id,
      definitionId: pool[i % Math.max(1, pool.length)] ?? fallback[i % fallback.length],
      owner: foe,
      controller: foe,
      zone,
      slot: null,
      exhausted: false,
      damage: 0,
    };
    player[zone].push(id);
  }
  const ownDeck = state.players[actor].deck;
  ownDeck.sort(
    (a, b) =>
      state.cards[a].definitionId.localeCompare(state.cards[b].definitionId) || a.localeCompare(b),
  );
  shuffle(ownDeck);
  state.events = searchEvents(source);
  state.seed = 1;
  state.rng = seed || 1;
  return state;
}
