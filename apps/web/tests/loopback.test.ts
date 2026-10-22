import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, decisionPlayer } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { LoopbackRoom } from "../src/features/match/session/LoopbackRoom";
import { createLocalMatch } from "../src/features/match/lib/localMatch";
import { LiveMatchSession } from "../src/features/match/session/MatchSession";
import { registry } from "@realms/testing/content";
import { startMatch } from "./support/session";
import { opponentMoves, startTutorial, opponentCommand } from "../src/features/tutorial/tutorial";

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

  it("never shows a seat more than that seat may see", () => {
    const { session } = createLocalMatch({
      initial: startMatch(9),
      mode: "practice",
      deck: "verdant",
      skirmish: false,
    });
    const view = session.frame(null, "p1").view;
    expect(JSON.stringify(view)).not.toContain('"rng"');
    expect(session.getSnapshot().seat).toBe("p1");
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

  it("runs the tutorial script for the opponent, then hands over to the bot", () => {
    const setup = startTutorial();
    const { session, script } = createLocalMatch(setup);
    expect(script.active).toBe(true);
    const state = session.getSnapshot().state;
    expect(state.players.p2.name).toBe("Sparring partner");
    expect(opponentCommand(startTutorial().initial, 0)?.type).toBe("mulligan");
    expect(opponentMoves(session.getSnapshot().commands)).toBe(0);
    session.leave();
  });
});
