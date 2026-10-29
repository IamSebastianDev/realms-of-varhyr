import {
  deckRules,
  type Command,
  type GameState,
  type PlayerId,
  type Pool,
  type Registry,
} from "@realms/contracts";
import {
  apply,
  assertInvariants,
  createMatch,
  decisionPlayer,
  legalActions,
  other,
  validateDeck,
} from "@realms/core";
import { defaultDeckId, starterDefinitions } from "@realms/content";

export type Piece = {
  alias: string;
  card: string;
  owner?: PlayerId;
  zone: "board" | "hand" | "discard" | "deck" | "choice";
  slot?: number;
  exhausted?: boolean;
  damage?: number;
};
export type FixtureOptions = {
  pieces: Piece[];
  life?: Partial<Record<PlayerId, number>>;
  energy?: Pool;
  responseEnergy?: Pool;
  phase?: "play" | "attack" | "draw";
  response?: boolean;
  librarySize?: number;
  drawChoices?: string[];
};
export type BenchmarkCase = {
  id: string;
  title: string;
  category: string;
  task: string;
  state: GameState;
  actor: PlayerId;
  reference: Command[];
  objective: string;
  rationale: string;
  passes: (state: GameState) => boolean;
};

/** Synthetic tactical snapshots, with real cards and two legal 30-card decks. */
export function fixture(options: FixtureOptions, registry: Registry) {
  const pieces = options.pieces;
  function deckFor(owner: PlayerId) {
    const cards = pieces.filter((p) => (p.owner ?? "p1") === owner).map((p) => p.card);
    const starter =
      starterDefinitions.find((deck) => deck.id === defaultDeckId) ?? starterDefinitions[0];
    for (const id of [
      ...(starter?.cards ?? []),
      ...Object.keys(registry.cards)
        .sort()
        .flatMap((id) => [id, id, id]),
    ]) {
      if (cards.length >= deckRules.minimumCards) break;
      const limit = registry.cards[id].legendary
        ? deckRules.copiesPerLegendary
        : deckRules.copiesPerCard;
      if (cards.filter((card) => card === id).length < limit) cards.push(id);
    }
    const errors = validateDeck(cards, registry);
    if (errors.length) throw new Error(`Invalid benchmark deck: ${errors.join(" ")}`);
    return cards;
  }
  const state = createMatch(registry, [deckFor("p1"), deckFor("p2")], 731);
  for (const player of Object.values(state.players)) {
    for (const id of player.hand) {
      state.cards[id].zone = "deck";
      player.deck.push(id);
    }
    player.hand = [];
    player.life = options.life?.[player.id] ?? 10;
    player.name = player.id === "p1" ? "You" : "Opponent";
  }
  state.turn = 5;
  state.phase = options.phase ?? "play";
  state.events = [];
  const ids: Record<string, string> = {};
  const taken = new Set<string>();
  for (const piece of pieces) {
    if (ids[piece.alias]) throw new Error(`Duplicate fixture alias ${piece.alias}`);
    const owner = piece.owner ?? "p1";
    const id = state.players[owner].deck.find(
      (id) => state.cards[id].definitionId === piece.card && !taken.has(id),
    );
    if (!id) throw new Error(`Missing fixture card ${piece.card}`);
    taken.add(id);
    ids[piece.alias] = id;
    const card = state.cards[id];
    card.zone = piece.zone;
    card.slot = piece.zone === "board" ? (piece.slot ?? 2) : null;
    card.exhausted = piece.exhausted ?? false;
    card.damage = piece.damage ?? 0;
    if (piece.zone === "deck") continue;
    state.players[owner].deck = state.players[owner].deck.filter((cid) => cid !== id);
    if (piece.zone === "board") {
      if (state.players[owner].board[card.slot!]) throw new Error("Occupied fixture slot");
      state.players[owner].board[card.slot!] = id;
    } else if (piece.zone !== "choice") state.players[owner][piece.zone].push(id);
  }
  state.players.p1.energy = options.energy ?? {};
  state.players.p1.responseEnergy = options.responseEnergy ?? {};
  if (options.librarySize !== undefined) {
    const player = state.players.p1;
    while (player.deck.length > options.librarySize) {
      const id = player.deck.shift()!;
      state.cards[id].zone = "discard";
      player.discard.push(id);
    }
  }
  if (state.phase === "attack")
    state.combat = { stage: "declare", attackers: [], lanes: {}, blocks: [], dead: [] };
  if (options.response) {
    state.active = "p2";
    state.responseStep = "p1";
  }
  if (options.drawChoices)
    state.pending = {
      id: "benchmark-draw",
      player: "p1",
      kind: "draw",
      options: options.drawChoices.map((alias) => ids[alias]),
    };
  assertInvariants(state);
  return {
    state,
    ids,
    play: (
      alias: string,
      extra: Omit<Extract<Command, { type: "play" }>, "type" | "cardId"> = {},
    ): Command => ({ type: "play", cardId: ids[alias], ...extra }),
    energy: (alias: string, option = 0): Command => ({
      type: "energy",
      cardId: ids[alias],
      option,
    }),
    activate: (
      alias: string,
      ability: number,
      extra: { target?: string; slot?: number } = {},
    ): Command => ({ type: "activate", cardId: ids[alias], ability, ...extra }),
    attack: (...lanes: [string, number][]): Command => ({
      type: "attack",
      attackers: lanes.map(([alias]) => ids[alias]),
      lanes: Object.fromEntries(lanes.map(([alias, lane]) => [ids[alias], lane])),
    }),
  };
}

export function runPlan(item: BenchmarkCase, commands: Command[], registry: Registry) {
  let state = structuredClone(item.state);
  const initialRevision = state.revision;
  const applyAs = (actor: PlayerId, command: Command) => {
    const next = apply(state, { actor, expectedRevision: state.revision, command }, registry);
    if (next.error) throw new Error(next.error);
    state = next.state;
    assertInvariants(state);
  };
  try {
    if (!commands.length || commands.length > 32)
      throw new Error("Submit between 1 and 32 commands.");
    for (let index = 0; index < commands.length; index++) {
      // This is an explicit exercise assumption, not a prediction of an optimal opponent.
      let passes = 0;
      while (!state.outcome && decisionPlayer(state) === other(item.actor) && state.responseStep) {
        if (state.pending || !legalActions(state, registry).canEnd || passes++ > 4)
          throw new Error("Unexpected opponent decision; this exercise cannot auto-resolve it.");
        applyAs(other(item.actor), { type: "end" });
      }
      if (state.outcome) throw new Error(`Command ${index + 1}: the game has already ended.`);
      if (decisionPlayer(state) !== item.actor)
        throw new Error(`Command ${index + 1}: it is the opponent's decision.`);
      try {
        applyAs(item.actor, commands[index]);
      } catch (error) {
        throw new Error(
          `Command ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const passed = state.revision > initialRevision && item.passes(state);
    return {
      legal: true,
      passed,
      state,
      error: passed ? undefined : "The legal plan did not meet the exercise objective.",
    };
  } catch (error) {
    return {
      legal: false,
      passed: false,
      state,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
