import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, decisionPlayer } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { LoopbackRoom } from "../src/features/match/session/LoopbackRoom";
import { createLocalMatch } from "../src/features/match/lib/localMatch";

import { registry } from "@realms/testing/content";
import { startMatch } from "./support/session";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** The match played with no network and no room: the engine alone. */
function direct(seed: number) {
  let state = startMatch(seed);
  for (let i = 0; i < 400 && !state.outcome; i++) {
    const result = apply(
      state,
      {
        actor: decisionPlayer(state),
        expectedRevision: state.revision,
        command: botCommand(state, registry),
      },
      registry,
    );
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  return state;
}

describe("a match on this machine is a loopback room around the online authority", () => {
  it("resolves exactly like the engine alone", () => {
    const seed = 731,
      expected = direct(seed);
    const authority = new MatchAuthority(registry, "loop", startMatch(seed));
    const room = new LoopbackRoom(authority, {
      seat: "p2",
      play: (state) => botCommand(state, registry),
      delay: () => 10,
    });
    for (let i = 0; i < 2000 && !authority.fullState.outcome; i++) {
      if (decisionPlayer(authority.fullState) === "p1")
        room.act(botCommand(authority.fullState, registry));
      else if (room.getSnapshot().bot?.gate) room.advanceOpponent();
      else vi.advanceTimersByTime(20);
    }
    expect(authority.fullState.outcome).toBe(expected.outcome);
    expect(authority.fullState.revision).toBe(expected.revision);
    expect(authority.fullState.players.p1.life).toBe(expected.players.p1.life);
    expect(authority.fullState.players.p2.life).toBe(expected.players.p2.life);
    expect(authority.log.length).toBeGreaterThan(20);
  });

  it("holds the opponent while the screen is busy, and pauses it before a phase change", () => {
    const { session } = createLocalMatch({
      initial: startMatch(5),
      mode: "practice",
      deck: "verdant",
      skirmish: false,
    });
    expect(session.local).toBe(true);
    session.setHold(true);
    const before = session.getSnapshot().revision;
    // p1 keeps the first mulligan decision; whichever seat has it, nothing moves while held.
    vi.advanceTimersByTime(5000);
    expect(session.getSnapshot().revision).toBe(before);
    session.leave();
  });

  it("seats two people on one screen without an opponent", () => {
    const { session } = createLocalMatch({
      initial: startMatch(3),
      mode: "hotseat",
      deck: "verdant",
      skirmish: false,
    });
    expect(session.getSnapshot().hotseat).toBe(true);
    expect(session.getSnapshot().bot).toBeNull();
    expect(session.getSnapshot().seat).toBeNull();
    session.leave();
  });
});

describe("asynchronous opponent decisions", () => {
  function opponentTurn() {
    let state = startMatch(17);
    for (let i = 0; i < 100 && decisionPlayer(state) !== "p2"; i++) {
      const result = apply(
        state,
        {
          actor: decisionPlayer(state),
          expectedRevision: state.revision,
          command: botCommand(state, registry),
        },
        registry,
      );
      if (result.error) throw new Error(result.error);
      state = result.state;
    }
    return new MatchAuthority(registry, "async", state);
  }
  it("waits for a worker result and keeps phase changes gated", async () => {
    const authority = opponentTurn();
    let resolve!: (command: { type: "end" }) => void;
    const room = new LoopbackRoom(authority, {
      seat: "p2",
      play: () =>
        new Promise((done) => {
          resolve = done;
        }),
      delay: () => 10,
    });
    const revision = authority.fullState.revision;
    expect(room.getSnapshot().bot?.thinking).toBe(true);
    resolve({ type: "end" });
    await Promise.resolve();
    expect(room.getSnapshot().bot?.gate).toEqual({ type: "end" });
    expect(authority.fullState.revision).toBe(revision);
    room.leave();
  });
  it("discards a late answer while held or after leaving and disposes its worker", async () => {
    const authority = opponentTurn();
    const answers: ((command: { type: "end" }) => void)[] = [];
    const dispose = vi.fn();
    const room = new LoopbackRoom(authority, {
      seat: "p2",
      play: () =>
        new Promise((done) => {
          answers.push(done);
        }),
      delay: () => 10,
      dispose,
    });
    const revision = authority.fullState.revision;
    room.setHold(true);
    answers[0]({ type: "end" });
    await Promise.resolve();
    expect(room.getSnapshot().bot?.gate).toBeNull();
    room.setHold(false);
    room.leave();
    answers[1]({ type: "end" });
    await Promise.resolve();
    expect(authority.fullState.revision).toBe(revision);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("ignores a result for an obsolete revision", async () => {
    const authority = opponentTurn();
    let resolve!: (command: { type: "end" }) => void;
    const room = new LoopbackRoom(authority, {
      seat: "p2",
      play: () =>
        new Promise((done) => {
          resolve = done;
        }),
      delay: () => 10,
    });
    // A replay/resume or authoritative action may advance the match while search runs.
    const changed = authority.act("p2", {
      id: "outside",
      revision: authority.snapshot("p2").view.revision,
      intent: { kind: "command", command: botCommand(authority.fullState, registry) },
    });
    expect(changed.error).toBeUndefined();
    const revision = authority.fullState.revision;
    resolve({ type: "end" });
    await Promise.resolve();
    expect(room.getSnapshot().bot?.gate).toBeNull();
    expect(authority.fullState.revision).toBe(revision);
    room.leave();
  });
});
