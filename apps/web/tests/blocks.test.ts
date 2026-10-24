import { describe, expect, it } from "vitest";
import type { CardInstance, HookContext, InternalOrder } from "@realms/contracts";
import {
  adjacent,
  adjacentCreatures,
  and,
  boost,
  chosen,
  damage,
  deployChosen,
  diedWithSubtype,
  draw,
  firstThisTurn,
  gainEnergyOfTypes,
  guardsAdjacentLanes,
  libraryHasAtLeast,
  modifiers,
  modify,
  not,
  onlyIf,
  or,
  param,
  reduceDamage,
  replaceWhen,
  replacing,
  requireSacrifice,
  run,
  sourceOnFlank,
  targetHasSubtype,
  targetIsCreature,
  targetIsSource,
  triggers,
  union,
  unblockable,
  whenFriendlyDies,
  whenPlayed,
  addEnergy,
  entersReady,
  type StaticContext,
} from "@realms/extensions/blocks";

/** A hand-made hook context, so blocks are tested without the engine. */
function context(overrides: Partial<HookContext> = {}, orders: InternalOrder[] = []) {
  const cards = {
    mine: { id: "mine", definitionId: "orc", controller: "p1", slot: 0, zone: "board" },
    dead: { id: "dead", definitionId: "goblin", controller: "p1", slot: 1, zone: "discard" },
    stray: { id: "stray", definitionId: "stray", controller: "p1", slot: 2, zone: "board" },
  };
  const ctx = {
    state: { cards, players: { p1: { board: ["mine"] }, p2: { board: [] } } },
    registry: {
      cards: {
        orc: { type: "creature", subtypes: ["orc"], factions: ["horde"] },
        goblin: { type: "creature", subtypes: ["goblin"], factions: ["horde"] },
        stray: { type: "creature", subtypes: [], factions: [] },
      },
    },
    source: cards.mine,
    event: { type: "x", cardId: "mine" },
    issue: (order: InternalOrder) => orders.push(order),
    ...overrides,
  } as unknown as HookContext;
  return { ctx, orders };
}

describe("ability blocks", () => {
  it("reads a parameter, falling back when the card leaves it out", () => {
    expect(param<number>("amount")({ amount: 3 })).toBe(3);
    expect(param<number>("amount", 1)({})).toBe(1);
    expect(param<number>("amount", 1)({ amount: 2 })).toBe(2);
  });
  it("does nothing when a selector finds nothing", () => {
    const { ctx, orders } = context();
    damage(chosen, 2)(ctx, {});
    expect(orders).toEqual([]);
  });
  it("applies an effect to what the selector found, with a literal or a parameter", () => {
    const a = context({ target: "p2" } as Partial<HookContext>);
    damage(chosen, 2)(a.ctx, {});
    expect(a.orders).toEqual([{ type: "damage", target: "p2", amount: 2, source: "mine" }]);
    const b = context({ target: "p2" } as Partial<HookContext>);
    damage(chosen, param("amount"))(b.ctx, { amount: 5 });
    expect(b.orders[0]).toMatchObject({ amount: 5 });
  });
  it("boosts only the stat it is given", () => {
    const { ctx, orders } = context({ target: "mine" } as Partial<HookContext>);
    boost(chosen, { defense: 2 })(ctx, {});
    expect(orders).toEqual([{ type: "boost", target: "mine", defense: 2, source: "mine" }]);
  });
  it("gives energy of every type of the selected card, and neutral for a card with none", () => {
    const horde = context({ target: "mine" } as Partial<HookContext>);
    gainEnergyOfTypes(chosen, 2)(horde.ctx, {});
    expect(horde.orders[0]).toMatchObject({ output: { horde: 2 } });
    const none = context({ target: "stray" } as Partial<HookContext>);
    gainEnergyOfTypes(chosen, 1)(none.ctx, {});
    expect(none.orders[0]).toMatchObject({ output: { neutral: 1 } });
  });
  it("whenPlayed fires only for the card itself", () => {
    const own = context();
    whenPlayed(draw(1))["card.played"](own.ctx, {});
    expect(own.orders).toHaveLength(1);
    const other = context({
      event: { type: "card.played", cardId: "else" },
    } as Partial<HookContext>);
    whenPlayed(draw(1))["card.played"](other.ctx, {});
    expect(other.orders).toHaveLength(0);
  });
  it("whenFriendlyDies matches subtype exactly and can leave out the card itself", () => {
    const died = (cardId: string, controller = "p1") =>
      ({
        event: {
          type: "creature.destroyed",
          cardId,
          snapshot: { id: cardId, definitionId: cardId === "dead" ? "goblin" : "orc", controller },
        },
      }) as unknown as Partial<HookContext>;
    const fire = (
      filter: Parameters<typeof whenFriendlyDies>[0],
      overrides: Partial<HookContext>,
    ) => {
      const { ctx, orders } = context(overrides);
      whenFriendlyDies(filter, draw(1))["creature.destroyed"](ctx, {});
      return orders.length;
    };
    expect(fire({ subtype: "goblin" }, died("dead"))).toBe(1);
    expect(fire({ subtype: "Goblin" }, died("dead"))).toBe(0);
    expect(fire({ subtype: "goblin" }, died("mine"))).toBe(0);
    expect(fire({}, died("dead", "p2"))).toBe(0);
    expect(fire({ other: true }, died("mine"))).toBe(0);
    expect(fire({}, died("mine"))).toBe(1);
  });
  it("triggers keeps both effects on the same event, in order", () => {
    const { ctx, orders } = context();
    const hooks = triggers(whenPlayed(draw(1)), whenPlayed(draw(2)));
    hooks["card.played"](ctx, {});
    expect(orders.map((o) => (o as { amount: number }).amount)).toEqual([1, 2]);
  });
  it("onlyIf and run compose effects", () => {
    const { ctx, orders } = context();
    run(
      onlyIf(() => false, draw(1)),
      onlyIf(() => true, draw(2), draw(3)),
    )(ctx, {});
    expect(orders.map((o) => (o as { amount: number }).amount)).toEqual([2, 3]);
  });
  it("and, or and not combine conditions; empty and is true, empty or is false", () => {
    const { ctx } = context();
    const yes = () => true,
      no = () => false;
    expect(and(yes, yes)(ctx, {})).toBe(true);
    expect(and(yes, no)(ctx, {})).toBe(false);
    expect(or(no, yes)(ctx, {})).toBe(true);
    expect(or(no, no)(ctx, {})).toBe(false);
    expect(not(no)(ctx, {})).toBe(true);
    expect(and()(ctx, {})).toBe(true);
    expect(or()(ctx, {})).toBe(false);
    expect(and(or(no, yes), not(no))(ctx, {})).toBe(true);
  });
  it("whenFriendlyDies takes an or-condition over several subtypes", () => {
    const fire = (cardId: string) => {
      const { ctx, orders } = context({
        event: {
          type: "creature.destroyed",
          cardId,
          snapshot: { id: cardId, definitionId: cardId, controller: "p1" },
        },
      } as unknown as Partial<HookContext>);
      whenFriendlyDies({ where: or(diedWithSubtype("goblin"), diedWithSubtype("orc")) }, draw(1))[
        "creature.destroyed"
      ](ctx, {});
      return orders.length;
    };
    expect(fire("goblin")).toBe(1);
    expect(fire("orc")).toBe(1);
    expect(fire("stray")).toBe(0);
  });
  it("firstThisTurn is true for the controller's first event of that type this turn only", () => {
    const check = (list: [string, string][]) => {
      const base = context().ctx;
      const { ctx } = context({
        state: { ...base.state, events: list.map(([type, player]) => ({ type, player })) },
      } as unknown as Partial<HookContext>);
      return firstThisTurn("spell.cast")(ctx, {});
    };
    expect(
      check([
        ["turn.started", "p1"],
        ["spell.cast", "p1"],
      ]),
    ).toBe(true);
    expect(
      check([
        ["turn.started", "p1"],
        ["spell.cast", "p1"],
        ["spell.cast", "p1"],
      ]),
    ).toBe(false);
    // An opponent's cast or an earlier turn's cast does not count.
    expect(
      check([
        ["spell.cast", "p1"],
        ["turn.started", "p2"],
        ["spell.cast", "p2"],
        ["spell.cast", "p1"],
      ]),
    ).toBe(true);
  });
  it("union gathers the targets of several selectors without repeats", () => {
    const { ctx } = context({ target: "mine" } as Partial<HookContext>);
    const mineAgain = () => ["mine", "stray"];
    expect(union(chosen, mineAgain)(ctx, {})).toEqual(["mine", "stray"]);
  });
  it("deployChosen needs both a card and a position, and only marks ready when asked", () => {
    const none = context({ target: "dead" } as Partial<HookContext>);
    deployChosen()(none.ctx, {});
    expect(none.orders).toEqual([]);
    const plain = context({ target: "dead", slot: 3 } as Partial<HookContext>);
    deployChosen()(plain.ctx, {});
    expect(plain.orders).toEqual([{ type: "deploy", target: "dead", player: "p1", slot: 3 }]);
    const ready = context({ target: "dead", slot: 3 } as Partial<HookContext>);
    deployChosen({ ready: true })(ready.ctx, {});
    expect(ready.orders[0]).toMatchObject({ ready: true });
  });
});

describe("static blocks", () => {
  const card = (id: string, definitionId: string, slot: number | null, controller = "p1") =>
    ({ id, definitionId, controller, slot, zone: "board" }) as unknown as CardInstance;
  const registry = {
    cards: {
      elf: { type: "creature", subtypes: ["elf"] },
      orc: { type: "creature", subtypes: ["orc"] },
      keep: { type: "holding", subtypes: [] },
    },
  };
  const at = (source: ReturnType<typeof card>, target: ReturnType<typeof card>, state?: unknown) =>
    ({ source, target, registry, state }) as unknown as StaticContext;

  it("modify gives the bonus only while its condition holds, and and/or/not narrow it", () => {
    const source = card("s", "orc", 1);
    const next = card("n", "elf", 2);
    const far = card("f", "elf", 4);
    const holding = card("h", "keep", 0);
    const rule = modify(and(adjacent, targetIsCreature, targetHasSubtype("elf")), { defense: 2 });
    expect(rule(at(source, next), {})).toEqual({ defense: 2 });
    expect(rule(at(source, far), {})).toEqual({});
    expect(rule(at(source, holding), {})).toEqual({});
    const either = modify(or(targetHasSubtype("elf"), targetHasSubtype("orc")), { attack: 1 });
    expect(either(at(source, far), {})).toEqual({ attack: 1 });
    expect(modify(not(targetIsSource), { attack: 1 })(at(source, source), {})).toEqual({});
  });
  it("modifiers add the bonuses of several rules together", () => {
    const source = card("s", "orc", 1);
    const elf = card("n", "elf", 2);
    const orc = card("o", "orc", 0);
    const sanctuary = modifiers(
      modify(and(adjacent, targetIsCreature), { defense: 1 }),
      modify(and(adjacent, targetIsCreature, targetHasSubtype("elf")), { defense: 1 }),
    );
    const registryArg = registry as unknown as Parameters<typeof sanctuary>[3];
    expect(sanctuary(source, elf, {}, registryArg)).toEqual({ defense: 2 });
    expect(sanctuary(source, orc, {}, registryArg)).toEqual({ defense: 1 });
    expect(sanctuary(source, card("f", "elf", 5), {}, registryArg)).toEqual({});
  });
  it("amounts can be read from the parameters or computed from the board", () => {
    const source = card("s", "orc", 1);
    const state = {
      cards: { s: source, a: card("a", "elf", 0), b: card("b", "keep", 2), c: card("c", "orc", 5) },
      players: { p1: { board: ["a", "s", "b", null, null, "c"] }, p2: { board: [] } },
    };
    expect(
      modify(targetIsSource, { attack: adjacentCreatures })(at(source, source, state), {}),
    ).toEqual({
      attack: 1,
    });
    expect(modify(targetIsSource, { attack: adjacentCreatures })(at(source, source), {})).toEqual(
      {},
    );
    expect(
      modify(targetIsSource, { attack: param<number>("amount") })(at(source, source), {
        amount: 3,
      }),
    ).toEqual({
      attack: 3,
    });
  });
  it("sourceOnFlank is true only on the first or last position", () => {
    expect(sourceOnFlank(at(card("s", "orc", 0), card("s", "orc", 0)), {})).toBe(true);
    expect(sourceOnFlank(at(card("s", "orc", 2), card("s", "orc", 2)), {})).toBe(false);
  });
});

describe("replacement, combat and activation blocks", () => {
  it("replacements apply in order, and replaceWhen skips them when its condition fails", () => {
    const { ctx } = context();
    const before = replacing("damage.before", reduceDamage(2), reduceDamage(5))["damage.before"];
    expect(before(ctx, {}, { amount: 4 })).toEqual({ amount: 0 });
    expect(
      replacing("damage.before", reduceDamage(1))["damage.before"](ctx, {}, { amount: 4 }),
    ).toEqual({
      amount: 3,
    });
    const gated = replaceWhen(() => false, reduceDamage(9));
    expect(gated({ amount: 4 }, {}, ctx)).toEqual({ amount: 4 });
  });
  it("entersReady, requireSacrifice and addEnergy change only their own field", () => {
    const { ctx } = context();
    expect(entersReady()({ exhausted: true }, {}, ctx)).toEqual({ exhausted: false });
    const sac = replacing("card.play.before", requireSacrifice(2), requireSacrifice(1))[
      "card.play.before"
    ];
    expect(sac(ctx, {}, {})).toEqual({ consume: true, consumeMin: 2 });
    expect(addEnergy("neutral", 1)({ output: { neutral: 1, horde: 2 } }, {}, ctx)).toEqual({
      output: { neutral: 2, horde: 2 },
    });
    expect(addEnergy("neutral", 1)({}, {}, ctx)).toEqual({ output: { neutral: 1 } });
  });
  it("unblockable restricts only the card itself, guardsAdjacentLanes covers the neighbouring lanes", () => {
    const sneaky = { id: "a" } as never;
    expect(unblockable(sneaky, sneaky, {} as never, {}, {} as never)).toBe(false);
    expect(unblockable({ id: "b" } as never, sneaky, {} as never, {}, {} as never)).toBe(true);
    const guard = { slot: 2 } as never;
    expect(guardsAdjacentLanes(guard, {} as never, 1, {}, {} as never)).toBe(true);
    expect(guardsAdjacentLanes(guard, {} as never, 3, {}, {} as never)).toBe(true);
    expect(guardsAdjacentLanes(guard, {} as never, 2, {}, {} as never)).toBe(false);
    expect(guardsAdjacentLanes({ slot: null } as never, {} as never, 1, {}, {} as never)).toBe(
      false,
    );
  });
  it("libraryHasAtLeast reads the controller's library size", () => {
    const state = { players: { p1: { deck: ["a", "b"] } } } as never;
    const source = { controller: "p1" } as never;
    const context = { source, state, registry: {} as never };
    expect(libraryHasAtLeast(2)(context, {})).toBe(true);
    expect(libraryHasAtLeast(3)(context, {})).toBe(false);
  });
});
