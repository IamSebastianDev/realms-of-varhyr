import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { registry } from "@realms/content";
import {
  act,
  finishFight,
  giveUp,
  loadRun,
  options,
  startRun,
  validateAdventure,
  type Action,
  type AdventureDef,
  type RunState,
} from "../src";

const def = JSON.parse(
  readFileSync(
    new URL("../../../assets/adventures/bright-marches/adventure.json", import.meta.url),
    "utf8",
  ),
) as AdventureDef;
const content = { cards: registry.cards };
const begin = () => startRun({ def, content, seed: 7, now: 1000 });
const step = (state: RunState, action: Action) => act(state, def, content, action);

/** Read a scene, finish fights and close optional offers. */
function clear(state: RunState): RunState {
  for (let guard = 0; guard < 40; guard++) {
    const view = state.view;
    if (!view || state.stage === "over") return state;
    if (view.kind === "event") {
      const event = def.events.find((e) => e.id === view.event)!;
      if (view.chosen || view.beat < event.beats.length - 1)
        state = step(state, { type: "continue" });
      else if (event.choices?.length)
        state = step(state, {
          type: "choose",
          choice: event.choices.find((c) => !c.when?.length)!.id,
        });
      else state = step(state, { type: "continue" });
    } else if (view.kind === "battle") {
      state = finishFight(step(state, { type: "fight" }), def, content, true);
    } else if (view.kind === "pick") state = step(state, { type: "take", card: view.cards[0]! });
    else state = step(state, { type: "skip" });
  }
  throw new Error("stuck");
}
type Node = AdventureDef["nodes"][number];
const nodeOf = (id: string): Node => def.nodes.find((n) => n.id === id)!;

/** Every route from the start to an ending, as node ids. */
function routes(): string[][] {
  const all: string[][] = [];
  const walk = (id: string, trail: string[]) => {
    const here = [...trail, id];
    const next = nodeOf(id).next;
    if (!next.length) all.push(here);
    else next.forEach((n) => walk(n, here));
  };
  walk(def.start, []);
  return all;
}
const isFight = (id: string) => ["battle", "elite", "final"].includes(nodeOf(id).type);

/** The shortest route from the start to the first node matching, without the start itself. */
function pathTo(match: (node: Node) => boolean): string[] {
  const from = new Map<string, string | null>([[def.start, null]]);
  const queue = [def.start];
  for (const id of queue) {
    if (id !== def.start && match(nodeOf(id))) {
      const path: string[] = [];
      for (let at: string | null | undefined = id; at && at !== def.start; at = from.get(at))
        path.unshift(at);
      return path;
    }
    for (const next of nodeOf(id).next)
      if (!from.has(next)) {
        from.set(next, id);
        queue.push(next);
      }
  }
  throw new Error("No such node");
}
/** Plays a route and stops on arrival at its last node, with that node's first scene open. */
function arriveAt(path: string[]): RunState {
  let run = clear(begin());
  path.forEach((node, i) => {
    run = step(run, { type: "travel", node });
    if (i < path.length - 1) run = clear(run);
  });
  return run;
}
/** Always takes the first road until the adventure is over. */
function playThrough(first = 0): RunState {
  let run = clear(begin());
  for (let guard = 0; guard < 60 && run.stage !== "over"; guard++) {
    const next = options(run, def);
    if (!next.length) break;
    run = clear(step(run, { type: "travel", node: next[Math.min(first, next.length - 1)]! }));
  }
  return run;
}

describe("adventure behaviour", () => {
  it("is valid against the live cards and starts with a 20-card deck", () => {
    expect(validateAdventure(def, content)).toEqual([]);
    expect(begin().deck).toHaveLength(20);
  });
  it("offers real choices of road and never leaves a dead end", () => {
    expect(def.nodes.filter((node) => node.next.length >= 2).length).toBeGreaterThanOrEqual(3);
    expect(routes().length).toBeGreaterThanOrEqual(8);
  });
  it("cannot skip fights: every route has several, and the road stays shut until one is won", () => {
    for (const route of routes()) expect(route.filter(isFight).length).toBeGreaterThanOrEqual(4);
    const target = pathTo((node) => ["battle", "elite"].includes(node.type));
    let run = arriveAt(target);
    expect(options(run, def)).toEqual([]);
    for (let guard = 0; run.view?.kind === "event" && guard < 10; guard++)
      run = step(run, { type: "continue" });
    expect(run.view?.kind).toBe("battle");
    expect(options(run, def)).toEqual([]);
    expect(() => step(run, { type: "travel", node: def.start })).toThrow();
    run = step(run, { type: "fight" });
    expect(options(run, def)).toEqual([]);
    expect(() => step(run, { type: "travel", node: def.start })).toThrow();
  });
  it("keeps the first fights to ordinary cards", () => {
    const first = routes().map((route) => nodeOf(route.find(isFight)!));
    expect(first.length).toBeGreaterThan(0);
    for (const node of first) {
      const enemy = def.enemies.find((e) => e.id === node.enemy)!;
      for (const card of Object.keys(enemy.deck))
        expect(registry.cards[card]!.rarity).not.toBe("legendary");
    }
  });
  it("ends the run on a lost fight", () => {
    const run = arriveAt(pathTo((node) => ["battle", "elite"].includes(node.type)));
    const lost = finishFight(step(run, { type: "fight" }), def, content, false);
    expect(lost).toMatchObject({ stage: "over", result: "lost" });
    expect(options(lost, def)).toEqual([]);
  });
  it("can be won by following any road, and a finished run survives saving", () => {
    for (const first of [0, 1, 2]) {
      const run = playThrough(first);
      expect(run.result).toBe("won");
      expect(loadRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    }
  });
  it("keeps what was discovered even when the run is given up", () => {
    const run = playThrough();
    expect(giveUp(run).collected).toEqual(run.collected);
  });
  it("keeps the 20-card minimum at camps", () => {
    const run = arriveAt(pathTo((node) => node.type === "improve"));
    if (run.view?.kind !== "improve") throw new Error("expected camp");
    const atMinimum = { ...run, deck: run.deck.slice(0, 20) };
    expect(() => step(atMinimum, { type: "remove", card: atMinimum.deck[0]! })).toThrow(
      /at least 20/,
    );
  });
});
