import { makeRng } from "@realms/core/rng";
import { canAdd, offerCards, candidates, type AdventureContent } from "./deck";
import {
  enemyOf,
  eventOf,
  expandDeck,
  nodeOf,
  type AdventureDef,
  type Condition,
  type Effect,
  type NodeDef,
} from "./definition";
import { adventureRules } from "./rules";

/** A booster earned in a scene. The collection keeps one receipt per run and payout id, so it pays once. */
export type Payout = { id: string; pack: string; count: number };

/** What the player is looking at on the current location, in order. Closing one shows the next in the queue. */
export type View =
  | { kind: "event"; event: string; beat: number; chosen?: string }
  | { kind: "battle"; enemy: string; elite: boolean; source: "node" | "event" }
  | { kind: "pick"; cards: string[]; pick: number; taken: number; source: "battle" | "event" }
  | { kind: "improve"; cards: string[] }
  | { kind: "recruit"; card: string; added: boolean }
  | { kind: "shop"; stock: string[]; bought: string[] };

export type Fight = { node: string; enemy: string; seed: number; elite: boolean };
/** What a location rolled on first arrival; saved so reloading cannot reroll it. */
export type Roll = { enemy?: string; offer?: string[]; stock?: string[] };

export type RunState = {
  version: 1;
  id: string;
  adventure: string;
  revision: number;
  seed: number;
  startedAt: number;
  stage: "map" | "over";
  result?: "won" | "lost";
  at: string;
  visited: string[];
  deck: string[];
  silver: number;
  flags: string[];
  rolls: Record<string, Roll>;
  view: View | null;
  queue: View[];
  fight: Fight | null;
  /** The final battle is won: the run ends once its last scene closes. */
  ending: boolean;
  earned: Payout[];
  /** Legendary cards found during this run, independent of later deck changes. */
  collected: string[];
};

export type Action =
  | { type: "travel"; node: string }
  | { type: "continue" }
  | { type: "choose"; choice: string }
  | { type: "fight" }
  | { type: "take"; card: string }
  | { type: "exchange"; out: string; card: string }
  | { type: "remove"; card: string }
  | { type: "buy"; card: string }
  | { type: "skip" };

export type StartInput = {
  def: AdventureDef;
  content: AdventureContent;
  seed: number;
  now: number;
};

export const priceOf = (def: AdventureDef, content: AdventureContent, id: string): number => {
  const rarity = content.cards[id]?.rarity ?? "common";
  return def.shop?.prices?.[rarity] ?? adventureRules.shopPrice[rarity];
};

const rngFor = (state: RunState, ...parts: (string | number)[]) =>
  makeRng([state.seed, ...parts].join("|"));

function holds(state: RunState, conditions?: Condition[]): boolean {
  return (conditions ?? []).every((condition) => {
    if ("flag" in condition) return state.flags.includes(condition.flag) !== !!condition.not;
    if ("card" in condition) return state.deck.includes(condition.card) !== !!condition.not;
    return state.silver >= condition.silver;
  });
}
export const available = (state: RunState, conditions?: Condition[]) => holds(state, conditions);

export function startRun({ def, content, seed, now }: StartInput): RunState {
  const start = nodeOf(def, def.start);
  if (!start) throw new Error("This adventure has no starting place.");
  const state: RunState = {
    version: 1,
    id: `${def.id}-${now.toString(36)}-${(seed >>> 0).toString(36)}`,
    adventure: def.id,
    revision: def.revision,
    seed: seed >>> 0,
    startedAt: now,
    stage: "map",
    at: start.id,
    visited: [start.id],
    deck: expandDeck(def.starterDeck),
    silver: adventureRules.startSilver,
    flags: [],
    rolls: {},
    view: null,
    queue: [],
    fight: null,
    ending: false,
    earned: [],
    collected: [
      ...new Set(expandDeck(def.starterDeck).filter((id) => content.cards[id]?.legendary)),
    ],
  };
  return enter(state, def, content, start);
}

/** Arrive somewhere: roll what it holds (once) and open its first view. */
function enter(
  state: RunState,
  def: AdventureDef,
  content: AdventureContent,
  node: NodeDef,
): RunState {
  const rolls = { ...state.rolls };
  const roll: Roll = { ...rolls[node.id] };
  let view: View | null = null;
  const queue: View[] = [];
  const after = node.event ? ({ kind: "event", event: node.event, beat: 0 } as const) : null;
  if (node.type === "event") {
    view = after;
  } else if (node.type === "battle" || node.type === "elite" || node.type === "final") {
    if (!roll.enemy) {
      const pool = node.pool ? (def.pools[node.pool] ?? []) : [];
      roll.enemy = node.enemy ?? rngFor(state, node.id, "enemy").pick(pool);
    }
    view = {
      kind: "battle",
      enemy: roll.enemy,
      elite: node.type === "elite",
      source: "node",
    };
    if (after) queue.push(after);
  } else if (node.type === "shop") {
    roll.stock ??= offerCards(
      content,
      def.faction,
      state.deck,
      rngFor(state, node.id, "stock"),
      def.shop?.size ?? adventureRules.shopSize,
    );
    view = { kind: "shop", stock: roll.stock, bought: [] };
  } else if (node.type === "improve") {
    roll.offer ??= offerCards(
      content,
      def.faction,
      state.deck,
      rngFor(state, node.id, "improve"),
      adventureRules.improvePick.size,
    );
    view = { kind: "improve", cards: roll.offer };
  }
  rolls[node.id] = roll;
  return {
    ...state,
    rolls,
    view,
    queue,
    ending:
      state.ending ||
      (node.type === "event" && !node.next.length && state.flags.includes("final-won")),
  };
}

/** Shows the next queued view, or finishes the location (and the run, after the final battle). */
function closeView(state: RunState): RunState {
  const [next, ...rest] = state.queue;
  const view = next ?? null;
  const base = { ...state, view, queue: rest };
  if (!view && !state.fight && state.ending) return { ...base, stage: "over", result: "won" };
  return base;
}

function apply(
  state: RunState,
  def: AdventureDef,
  content: AdventureContent,
  effects: Effect[],
  scope: string,
): { state: RunState; queued: View[] } {
  let next = state;
  const queued: View[] = [];
  effects.forEach((effect, index) => {
    switch (effect.type) {
      case "silver":
        next = { ...next, silver: Math.max(0, next.silver + effect.amount) };
        break;
      case "flag":
        if (!next.flags.includes(effect.flag))
          next = { ...next, flags: [...next.flags, effect.flag] };
        break;
      case "addCard":
        if (canAdd(content, next.deck, effect.card))
          next = { ...next, deck: [...next.deck, effect.card] };
        break;
      case "recruit": {
        const card = content.cards[effect.card];
        if (!card?.legendary) break;
        const isNew = !next.collected.includes(effect.card);
        const added = effect.addToDeck !== false && canAdd(content, next.deck, effect.card);
        if (isNew) next = { ...next, collected: [...next.collected, effect.card] };
        if (added) next = { ...next, deck: [...next.deck, effect.card] };
        if (isNew) queued.push({ kind: "recruit", card: effect.card, added });
        break;
      }
      case "removeCard": {
        const at = next.deck.indexOf(effect.card);
        if (at >= 0 && next.deck.length > adventureRules.minimumCards)
          next = { ...next, deck: next.deck.filter((_, i) => i !== at) };
        break;
      }
      case "booster":
        if (!next.earned.some((payout) => payout.id === effect.id))
          next = {
            ...next,
            earned: [...next.earned, { id: effect.id, pack: effect.pack, count: effect.count }],
          };
        break;
      case "offer": {
        const cards = offerCards(
          content,
          def.faction,
          next.deck,
          rngFor(next, scope, "offer", index),
          effect.size,
          { from: effect.cards },
        );
        if (cards.length)
          queued.push({ kind: "pick", cards, pick: effect.pick ?? 1, taken: 0, source: "event" });
        break;
      }
      case "battle":
        if (enemyOf(def, effect.enemy))
          queued.push({ kind: "battle", enemy: effect.enemy, elite: false, source: "event" });
        break;
    }
  });
  return { state: next, queued };
}

function needView<K extends View["kind"]>(state: RunState, kind: K): Extract<View, { kind: K }> {
  if (state.stage !== "map") throw new Error("This adventure is over.");
  if (state.fight) throw new Error("Finish the battle first.");
  if (!state.view || state.view.kind !== kind) throw new Error("That is not possible here.");
  return state.view as Extract<View, { kind: K }>;
}

/** Where the player can go from here: nowhere while something is open on the current location. */
export function options(state: RunState, def: AdventureDef): string[] {
  if (state.stage !== "map" || state.view || state.fight) return [];
  return nodeOf(def, state.at)?.next ?? [];
}
export const canTravel = (state: RunState, def: AdventureDef, id: string) =>
  options(state, def).includes(id);

export function act(
  state: RunState,
  def: AdventureDef,
  content: AdventureContent,
  action: Action,
): RunState {
  if (state.stage !== "map") throw new Error("This adventure is over.");
  if (state.fight && action.type !== "fight") throw new Error("Finish the battle first.");
  switch (action.type) {
    case "travel": {
      if (!canTravel(state, def, action.node)) throw new Error("You cannot go there from here.");
      const node = nodeOf(def, action.node)!;
      const moved = { ...state, at: node.id, visited: [...state.visited, node.id] };
      return enter(moved, def, content, node);
    }
    case "continue": {
      const view = needView(state, "event");
      const event = eventOf(def, view.event);
      if (!event) return closeView(state);
      if (view.chosen) return closeView(state);
      if (view.beat < event.beats.length - 1)
        return { ...state, view: { ...view, beat: view.beat + 1 } };
      if (event.choices?.length) throw new Error("Choose first.");
      const done = apply(state, def, content, event.effects ?? [], `${state.at}|${event.id}`);
      return closeView({ ...done.state, queue: [...done.queued, ...done.state.queue] });
    }
    case "choose": {
      const view = needView(state, "event");
      const event = eventOf(def, view.event);
      const choice = event?.choices?.find((entry) => entry.id === action.choice);
      if (!event || !choice || view.chosen) throw new Error("That is not possible here.");
      if (view.beat < event.beats.length - 1) throw new Error("Read on first.");
      if (!holds(state, choice.when)) throw new Error("That choice is not open to you.");
      const done = apply(
        state,
        def,
        content,
        choice.effects,
        `${state.at}|${event.id}|${choice.id}`,
      );
      const queue = [...done.queued, ...done.state.queue];
      if (choice.result) return { ...done.state, queue, view: { ...view, chosen: choice.id } };
      return closeView({ ...done.state, queue });
    }
    case "fight": {
      const view = needView({ ...state, fight: null }, "battle");
      if (state.fight) return state;
      const fight: Fight = {
        node: state.at,
        enemy: view.enemy,
        elite: view.elite,
        seed: rngFor(state, state.at, "fight", view.enemy, state.visited.length).int(2 ** 31),
      };
      return { ...state, fight };
    }
    case "take": {
      const view = state.view;
      if (view?.kind === "pick") {
        if (!view.cards.includes(action.card) || !canAdd(content, state.deck, action.card))
          throw new Error("That card is not available.");
        const taken = view.taken + 1;
        const next = { ...state, deck: [...state.deck, action.card] };
        return taken >= view.pick
          ? closeView(next)
          : {
              ...next,
              view: { ...view, taken, cards: view.cards.filter((id) => id !== action.card) },
            };
      }
      const improve = needView(state, "improve");
      if (!improve.cards.includes(action.card) || !canAdd(content, state.deck, action.card))
        throw new Error("That card is not available.");
      return closeView({ ...state, deck: [...state.deck, action.card] });
    }
    case "exchange": {
      const view = needView(state, "improve");
      const at = state.deck.indexOf(action.out);
      if (!view.cards.includes(action.card) || at < 0)
        throw new Error("That is not possible here.");
      const rest = state.deck.filter((_, i) => i !== at);
      if (!canAdd(content, rest, action.card)) throw new Error("That card is not available.");
      return closeView({ ...state, deck: [...rest, action.card] });
    }
    case "remove": {
      needView(state, "improve");
      const at = state.deck.indexOf(action.card);
      if (at < 0) throw new Error("That is not possible here.");
      if (state.deck.length <= adventureRules.minimumCards)
        throw new Error(`A deck needs at least ${adventureRules.minimumCards} cards.`);
      return closeView({ ...state, deck: state.deck.filter((_, i) => i !== at) });
    }
    case "buy": {
      const view = needView(state, "shop");
      if (!view.stock.includes(action.card) || view.bought.includes(action.card))
        throw new Error("That card is not for sale.");
      const price = priceOf(def, content, action.card);
      if (state.silver < price) throw new Error("Not enough silver.");
      if (!canAdd(content, state.deck, action.card))
        throw new Error("You cannot carry more copies.");
      return {
        ...state,
        silver: state.silver - price,
        deck: [...state.deck, action.card],
        view: { ...view, bought: [...view.bought, action.card] },
      };
    }
    case "skip": {
      if (!state.view || state.view.kind === "event" || state.view.kind === "battle")
        throw new Error("That is not possible here.");
      return closeView(state);
    }
  }
}

/** Applies a fight's result. A loss ends the run on the spot; a win pays silver and opens the reward. */
export function finishFight(
  state: RunState,
  def: AdventureDef,
  content: AdventureContent,
  won: boolean,
): RunState {
  const fight = state.fight;
  const view = state.view;
  if (!fight || view?.kind !== "battle") throw new Error("There is no battle to finish.");
  if (!won) return { ...state, fight: null, view: null, queue: [], stage: "over", result: "lost" };
  const node = nodeOf(def, fight.node);
  const finalBattle = view.source === "node" && node?.type === "final";
  const range = fight.elite ? adventureRules.eliteSilver : adventureRules.battleSilver;
  const silver =
    state.silver +
    (finalBattle ? 0 : rngFor(state, fight.node, "silver").range(range[0], range[1]));
  const queue = [...state.queue];
  if (!finalBattle) {
    const size = fight.elite ? adventureRules.elitePick : adventureRules.battlePick;
    const cards = offerCards(
      content,
      def.faction,
      state.deck,
      rngFor(state, fight.node, "reward", state.visited.length),
      size.size,
      {
        weights: fight.elite ? adventureRules.eliteRarityWeights : undefined,
      },
    );
    if (cards.length)
      queue.unshift({ kind: "pick", cards, pick: size.pick, taken: 0, source: "battle" });
  }
  const continues = finalBattle && !!node?.next.length;
  return closeView({
    ...state,
    silver,
    fight: null,
    queue,
    flags:
      continues && !state.flags.includes("final-won") ? [...state.flags, "final-won"] : state.flags,
    ending: state.ending || (finalBattle && !continues),
  });
}

/** Give up the run: the next one starts fresh. */
export const giveUp = (state: RunState): RunState => ({
  ...state,
  fight: null,
  view: null,
  queue: [],
  stage: "over",
  result: "lost",
});

export function loadRun(raw: unknown): RunState | null {
  if (!raw || typeof raw !== "object") return null;
  const run = raw as Partial<RunState>;
  if (
    run.version !== 1 ||
    typeof run.id !== "string" ||
    typeof run.adventure !== "string" ||
    typeof run.at !== "string" ||
    typeof run.seed !== "number" ||
    !Array.isArray(run.deck) ||
    !Array.isArray(run.visited) ||
    !Array.isArray(run.flags) ||
    !Array.isArray(run.earned) ||
    (run.collected !== undefined &&
      (!Array.isArray(run.collected) || run.collected.some((id) => typeof id !== "string"))) ||
    !Array.isArray(run.queue) ||
    typeof run.silver !== "number"
  )
    return null;
  return { fight: null, view: null, ending: false, rolls: {}, collected: [], ...run } as RunState;
}

export { candidates };
