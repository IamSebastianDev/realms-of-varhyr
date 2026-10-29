import { describe, expect, it } from "vitest";
import { registry } from "@realms/content";
import { apply, assertInvariants, decisionPlayer } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import {
  searchDecision,
  defaultSearchOptions,
  searchAttackCandidates,
} from "@realms/core/botSearch";
import { sampleSearchWorld, searchEvents } from "@realms/core/botSearchWorld";
import type { Command, GameState } from "@realms/contracts";
import { fixture } from "../src/bot-benchmark/fixture";
import { benchmarkCases } from "../src/bot-benchmark/cases";

function act(s: GameState, command: Command) {
  const result = apply(
    s,
    { actor: decisionPlayer(s), expectedRevision: s.revision, command },
    registry,
  );
  expect(result.error, JSON.stringify(command)).toBeUndefined();
  assertInvariants(result.state);
  return result.state;
}
function finishTactic(initial: GameState, passes: (s: GameState) => boolean) {
  let s = initial;
  for (let i = 0; i < 24 && !s.outcome && s.active === initial.active; i++) {
    s = act(s, searchDecision(s, registry).command);
    if (passes(s)) break;
  }
  return s;
}

describe("bounded turn planning", () => {
  it("discards a drawn creature when Dirge makes that choice lethal", () => {
    const f = fixture(
      {
        phase: "draw",
        pieces: [
          { alias: "shaman", card: "undergrowth-shaman", zone: "board", slot: 0, exhausted: true },
          { alias: "attacker", card: "crownlands-recruit", zone: "board", slot: 2 },
          { alias: "bear", card: "ursa-elder-bear", zone: "choice" },
          { alias: "spell", card: "cleansing-light", zone: "choice" },
        ],
        drawChoices: ["bear", "spell"],
        life: { p2: 2 },
      },
      registry,
    );
    expect(searchDecision(f.state, registry).command).toMatchObject({
      type: "choose",
      option: f.ids.spell,
      other: "discard",
    });
    expect(finishTactic(f.state, (s) => s.outcome === "p1").outcome).toBe("p1");
  });
  it("uses Kindle damage to win instead of killing an enemy producer", () => {
    const f = fixture(
      {
        pieces: [
          {
            alias: "acolyte",
            card: "acolyte-of-the-flames",
            zone: "board",
            slot: 0,
            exhausted: true,
          },
          { alias: "spell", card: "peek", zone: "hand" },
          { alias: "producer", card: "goldfield-farmer", zone: "board", slot: 2, owner: "p2" },
        ],
        energy: { "northern-league": 1 },
        life: { p2: 1 },
      },
      registry,
    );
    const pending = act(f.state, f.play("spell"));
    expect(pending.pending?.kind).toBe("damage-target");
    const command = searchDecision(pending, registry).command;
    expect(command).toMatchObject({ type: "choose", option: "p2" });
    expect(act(pending, command).outcome).toBe("p1");
    expect(finishTactic(f.state, (s) => s.outcome === "p1").outcome).toBe("p1");
    const notLethal = structuredClone(pending);
    notLethal.players.p2.life = 2;
    expect(searchDecision(notLethal, registry).command).toMatchObject({
      type: "choose",
      option: f.ids.producer,
    });
  });
  it("reprises a winning burn spell instead of the most expensive spell", () => {
    const f = fixture(
      {
        pieces: [
          { alias: "aris", card: "aris-archivist", zone: "hand" },
          { alias: "burn", card: "cleansing-light", zone: "discard" },
          { alias: "plague", card: "plague-wind", zone: "discard" },
          { alias: "producer", card: "crownlands-recruit", zone: "board", slot: 2, owner: "p2" },
        ],
        energy: { "northern-league": 2 },
        life: { p2: 2 },
      },
      registry,
    );
    const pending = act(f.state, f.play("aris", { slot: 2 }));
    expect(pending.pending?.kind).toBe("reprise");
    expect(searchDecision(pending, registry).command).toMatchObject({
      type: "choose",
      option: f.ids.burn,
    });
    expect(finishTactic(pending, (s) => s.outcome === "p1").outcome).toBe("p1");
    expect(finishTactic(f.state, (s) => s.outcome === "p1").outcome).toBe("p1");
    const hidden = structuredClone(pending);
    hidden.players.p1.deck.reverse();
    hidden.players.p2.deck.reverse();
    hidden.rng = 9876;
    for (const id of hidden.players.p2.hand) hidden.cards[id].definitionId = "ursa-elder-bear";
    expect(searchDecision(hidden, registry)).toEqual(searchDecision(pending, registry));
    const tiny = searchDecision(pending, registry, { transitions: 1 });
    expect(tiny.transitions).toBeLessThanOrEqual(1);
    act(pending, tiny.command);
  });
  it("keeps the winning target through Reprise, its free cast and Kindle", () => {
    const f = fixture(
      {
        pieces: [
          {
            alias: "acolyte",
            card: "acolyte-of-the-flames",
            zone: "board",
            slot: 0,
            exhausted: true,
          },
          { alias: "aris", card: "aris-archivist", zone: "hand" },
          { alias: "burn", card: "cleansing-light", zone: "discard" },
          { alias: "plague", card: "plague-wind", zone: "discard" },
          { alias: "producer", card: "goldfield-farmer", zone: "board", slot: 2, owner: "p2" },
        ],
        energy: { "northern-league": 2 },
        life: { p2: 3 },
      },
      registry,
    );
    expect(finishTactic(f.state, (s) => s.outcome === "p1").outcome).toBe("p1");
  });
  it("bottoms the rejected draw when discarding would cause a library loss next turn", () => {
    const f = fixture(
      {
        phase: "draw",
        pieces: [
          { alias: "bear", card: "ursa-elder-bear", zone: "choice" },
          { alias: "cavalry", card: "ban-vale-cavalry", zone: "choice" },
        ],
        drawChoices: ["bear", "cavalry"],
        librarySize: 2,
      },
      registry,
    );
    expect(searchDecision(f.state, registry).command).toMatchObject({
      type: "choose",
      other: "bottom",
    });
  });
  it("does not mistake a draw-and-damage spell for lethal when the draw empties its own library", () => {
    const f = fixture(
      {
        pieces: [
          { alias: "aris", card: "aris-archivist", zone: "hand" },
          { alias: "missile", card: "arcane-missile", zone: "discard" },
          { alias: "burn", card: "cleansing-light", zone: "discard" },
        ],
        energy: { "northern-league": 2 },
        life: { p2: 2 },
        librarySize: 1,
      },
      registry,
    );
    const pending = act(f.state, f.play("aris", { slot: 2 }));
    const missile = act(pending, {
      type: "choose",
      choiceId: pending.pending!.id,
      option: f.ids.missile,
    });
    expect(act(missile, f.play("missile", { target: "p2" })).outcome).toBe("p2");
    expect(searchDecision(pending, registry).command).not.toMatchObject({ option: f.ids.missile });
    expect(finishTactic(pending, (s) => s.outcome === "p1").outcome).toBe("p1");
  });
  it("uses energy added by channel replacement hooks to find a winning cast", () => {
    const f = fixture(
      {
        pieces: [
          { alias: "captain", card: "stormborn-captain", zone: "board", slot: 2 },
          { alias: "missile", card: "arcane-missile", zone: "hand" },
          { alias: "guard", card: "borderpost", zone: "board", slot: 2, owner: "p2" },
        ],
        life: { p2: 2 },
      },
      registry,
    );
    expect(searchDecision(f.state, registry).command).toMatchObject({
      type: "energy",
      cardId: f.ids.captain,
    });
    expect(finishTactic(f.state, (s) => s.outcome === "p1").outcome).toBe("p1");
  });
  it("finds Guard removal followed by lethal instead of killing a larger irrelevant unit", () => {
    const item = benchmarkCases(registry).find((item) => item.id === "rov-024")!;
    const before = structuredClone(item.state);
    expect(item.passes(finishTactic(item.state, item.passes))).toBe(true);
    expect(item.state).toEqual(before);
  });
  it("plans multiple producers and a spell without getting stuck rechanneling", () => {
    const f = fixture(
      {
        pieces: [
          { alias: "a", card: "crownlands-recruit", zone: "board", slot: 1 },
          { alias: "b", card: "goldfield-farmer", zone: "board", slot: 3 },
          { alias: "burn", card: "cleansing-light", zone: "hand" },
        ],
        life: { p2: 2 },
      },
      registry,
    );
    expect(finishTactic(f.state, (s) => s.outcome === "p1").outcome).toBe("p1");
  });
  it("resolves coordinated Guard blocks using the complete attack batch", () => {
    const f = fixture(
      {
        phase: "attack",
        pieces: [
          { alias: "a", card: "cleaverfield-brigade", zone: "board", slot: 1 },
          { alias: "b", card: "vanguard-pikemen", zone: "board", slot: 3 },
          { alias: "guard", card: "borderpost", zone: "board", slot: 2, owner: "p2" },
        ],
        life: { p2: 2 },
      },
      registry,
    );
    const candidates = searchAttackCandidates(f.state, registry);
    expect(candidates.some((c) => c.type === "attack" && !c.attackers.length)).toBe(true);
    const after = act(act(f.state, searchDecision(f.state, registry).command), {
      type: "confirm-combat",
    });
    expect(after.outcome).toBe("p1");
  });
  it("keeps a producer in the draw choice and can deploy it immediately", () => {
    const f = fixture(
      {
        phase: "draw",
        pieces: [
          { alias: "producer", card: "goldfield-farmer", zone: "choice" },
          { alias: "bear", card: "ursa-elder-bear", zone: "choice" },
        ],
        drawChoices: ["producer", "bear"],
      },
      registry,
    );
    expect(searchDecision(f.state, registry).command).toMatchObject({
      type: "choose",
      option: f.ids.producer,
    });
    const after = finishTactic(f.state, (s) => s.cards[f.ids.producer].zone === "board");
    expect(after.cards[f.ids.producer].zone).toBe("board");
  });
  it("rejects an attractive trade that opens a lethal lane on the next turn", () => {
    const f = fixture(
      {
        phase: "attack",
        pieces: [
          { alias: "left", card: "store-house", zone: "board", slot: 0 },
          { alias: "farmer", card: "goldfield-farmer", zone: "board", slot: 1 },
          { alias: "brigade", card: "cleaverfield-brigade", zone: "board", slot: 2 },
          { alias: "farmer2", card: "goldfield-farmer", zone: "board", slot: 3 },
          { alias: "right", card: "store-house", zone: "board", slot: 4 },
          {
            alias: "guard",
            card: "bronwin-tree-guard",
            zone: "board",
            slot: 2,
            owner: "p2",
            damage: 2,
          },
          { alias: "threat", card: "crownlands-recruit", zone: "board", slot: 3, owner: "p2" },
        ],
        life: { p1: 1 },
      },
      registry,
    );
    expect(botCommand(f.state, registry)).toMatchObject({
      type: "attack",
      attackers: [f.ids.brigade],
    });
    const decision = searchDecision(f.state, registry);
    expect(decision.replies).toBeGreaterThan(0);
    expect(decision.command).toMatchObject({ type: "attack", attackers: [] });
  });
  it("does not change its decision when hidden hand identities, library order or game RNG change", () => {
    const f = fixture(
      {
        pieces: [
          { alias: "a", card: "crownlands-recruit", zone: "board", slot: 1 },
          { alias: "burn", card: "cleansing-light", zone: "hand" },
          { alias: "enemy", card: "goldfield-farmer", zone: "board", slot: 3, owner: "p2" },
          { alias: "secret", card: "cleansing-light", zone: "hand", owner: "p2" },
        ],
        energy: { crownlands: 2 },
      },
      registry,
    );
    const altered = structuredClone(f.state);
    altered.cards[f.ids.secret].definitionId = "ursa-elder-bear";
    altered.players.p1.deck.reverse();
    altered.players.p2.deck.reverse();
    altered.seed = 1234;
    altered.rng = 9876;
    for (const id of altered.players.p2.deck) altered.cards[id].definitionId = "borrowed-wisdom";
    expect(sampleSearchWorld(altered, "p1", registry)).toEqual(
      sampleSearchWorld(f.state, "p1", registry),
    );
    expect(searchDecision(altered, registry)).toEqual(searchDecision(f.state, registry));
    expect(searchDecision(altered, registry, { transitions: 1 })).toEqual(
      searchDecision(f.state, registry, { transitions: 1 }),
    );
    expect(searchDecision(f.state, registry)).toEqual(searchDecision(f.state, registry));
  });
  it("keeps explicitly revealed hand-discard options legal in the fallback", () => {
    const f = fixture(
      { pieces: [{ alias: "revealed", card: "cleansing-light", zone: "hand", owner: "p2" }] },
      registry,
    );
    f.state.pending = {
      id: "revealed-hand",
      player: "p1",
      kind: "hand-discard",
      options: [f.ids.revealed],
      sourceName: "Sabotage",
    };
    const choice = searchDecision(f.state, registry).command;
    expect(choice).toMatchObject({ type: "choose", option: f.ids.revealed });
    expect(act(f.state, choice).cards[f.ids.revealed].zone).toBe("discard");
  });
  it("preserves this-turn trigger counts while stripping private event identities", () => {
    const f = fixture(
      {
        pieces: [
          { alias: "accord", card: "academy-apprentice", zone: "board", slot: 0 },
          { alias: "a", card: "peek", zone: "hand" },
          { alias: "b", card: "peek", zone: "hand" },
        ],
        energy: { "northern-league": 2 },
      },
      registry,
    );
    const first = act(f.state, f.play("a"));
    const world = sampleSearchWorld(first, "p1", registry);
    expect(JSON.stringify(world.events)).not.toContain("peek");
    expect(world.events.filter((e) => e.type === "spell.cast")).toHaveLength(1);
    const after = act(world, f.play("b"));
    // The second spell must not earn a second Accord refund.
    expect(after.players.p1.energy["northern-league"] ?? 0).toBe(1);
    const trimmed = searchEvents(after);
    expect(trimmed.filter((e) => e.type === "spell.cast")).toHaveLength(2);
  });
  it("bounds engine transitions and falls back legally when the budget is tiny", () => {
    const item = benchmarkCases(registry)[0];
    const options = { transitions: 1, replyTransitions: 1, samples: 1, finalists: 1 };
    const decision = searchDecision(item.state, registry, options);
    act(item.state, decision.command);
    expect(decision.transitions).toBeLessThanOrEqual(2);
    expect(() => searchDecision(item.state, registry, { width: NaN })).toThrow(
      "Invalid search option",
    );
    const full = searchDecision(item.state, registry);
    expect(full.transitions).toBeLessThanOrEqual(
      defaultSearchOptions.transitions +
        defaultSearchOptions.replyTransitions *
          defaultSearchOptions.samples *
          defaultSearchOptions.finalists,
    );
  });
});
