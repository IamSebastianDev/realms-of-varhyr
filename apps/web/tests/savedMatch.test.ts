import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionPlayer, replay } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { createLocalMatch } from "../src/features/match/lib/localMatch";
import { registry } from "@realms/content";
import { startMatch } from "../src/features/match/lib/session";
import {
  clearSavedMatch,
  loadSavedMatch,
  parseSavedMatch,
  savedMatchKey,
} from "../src/features/match/lib/savedMatch";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

// The saved-match slot is tied to the live card content, so these tests use it rather than the fixed test registry.
/** The first `count` moves of a bot-against-bot match, as the authority would have logged them. */
function played(seed: number, count: number) {
  const initial = startMatch(seed),
    authority = new MatchAuthority(registry, "saved", initial);
  for (let i = 0; i < count && !authority.fullState.outcome; i++) {
    const state = authority.fullState,
      seat = decisionPlayer(state);
    const result = authority.act(seat, {
      id: `a${i}`,
      revision: authority.snapshot(seat).view.revision,
      intent: { kind: "command", command: botCommand(state, registry) },
    });
    expect(result.error).toBeUndefined();
  }
  return { initial, authority };
}

describe("resuming a match", () => {
  it("rebuilds the same position from the start and the command log", () => {
    const { initial, authority } = played(4242, 30),
      resumed = MatchAuthority.resume(registry, "saved", initial, authority.log);
    expect(resumed.fullState).toEqual(authority.fullState);
    expect(resumed.log).toEqual(authority.log);
    // And it keeps playing: the next command is accepted at the revision a client would see.
    const seat = decisionPlayer(resumed.fullState),
      next = resumed.act(seat, {
        id: "after",
        revision: resumed.snapshot(seat).view.revision,
        intent: { kind: "command", command: botCommand(resumed.fullState, registry) },
      });
    expect(next.error).toBeUndefined();
  });

  it("survives a trip through JSON, which is all localStorage keeps", () => {
    const { initial, authority } = played(99, 40),
      stored = JSON.parse(JSON.stringify({ initial, commands: authority.log }));
    expect(replay(stored.initial, stored.commands, registry)).toEqual(authority.fullState);
  });

  it("refuses commands that do not replay", () => {
    const { initial, authority } = played(7, 20),
      broken = authority.log.map((c, i) => (i === 3 ? { ...c, command: { type: "concede" } } : c));
    expect(() => MatchAuthority.resume(registry, "x", initial, broken as never)).toThrow();
  });
});

describe("the saved match slot", () => {
  const entry = (seed: number, count: number, patch: Record<string, unknown> = {}) => {
    const { initial, authority } = played(seed, count);
    return JSON.stringify({
      version: 1,
      rules: initial.rulesVersion,
      content: initial.contentVersion,
      matchId: "m1",
      savedAt: "now",
      setup: { initial, mode: "practice", deck: "d", skirmish: false },
      commands: authority.log,
      ...patch,
    });
  };
  it("offers a match that is whole and still going", () => {
    store.set(savedMatchKey, entry(11, 30));
    const found = loadSavedMatch();
    expect(found?.saved.matchId).toBe("m1");
    expect(found?.state.outcome).toBeNull();
  });
  it("drops saves from another rules or content version, and anything unreadable", () => {
    for (const patch of [{ rules: "old" }, { content: "old" }, { commands: "no" }]) {
      store.set(savedMatchKey, entry(11, 30, patch));
      expect(loadSavedMatch()).toBeNull();
      expect(store.has(savedMatchKey)).toBe(false);
    }
    store.set(savedMatchKey, "{");
    expect(parseSavedMatch(store.get(savedMatchKey)!)).toBeNull();
  });
  it("clears only the match it was asked about", () => {
    store.set(savedMatchKey, entry(11, 30));
    clearSavedMatch("other");
    expect(store.has(savedMatchKey)).toBe(true);
    clearSavedMatch("m1");
    expect(store.has(savedMatchKey)).toBe(false);
  });
});

describe("a match on this machine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const setup = () => ({
    initial: startMatch(21),
    mode: "practice" as const,
    deck: "starter",
    skirmish: false,
  });

  it("is saved as it is played and continues from the saved position", () => {
    const first = createLocalMatch(setup());
    for (let i = 0; i < 6; i++) {
      const state = first.session.getSnapshot().state;
      if (decisionPlayer(state) === "p1") first.session.act(botCommand(state, registry));
      else vi.advanceTimersByTime(2000);
    }
    const before = first.session.getSnapshot();
    expect(before.commands.length).toBeGreaterThan(0);
    const found = loadSavedMatch();
    expect(found?.saved.commands).toEqual(before.commands);
    expect(found?.state.sequence).toBe(before.state.sequence);
    first.session.leave();
    const again = createLocalMatch(found!.saved.setup, false, found!.saved);
    expect(again.session.getSnapshot().state).toEqual(before.state);
    expect(again.session.getSnapshot().matchId).toBe(before.matchId);
    again.session.leave();
  });

  it("is forgotten once it has ended, whoever ended it", () => {
    const { session } = createLocalMatch(setup());
    expect(store.has(savedMatchKey)).toBe(true);
    session.act({ type: "concede" });
    expect(session.getSnapshot().state.outcome).toBe("p2");
    expect(store.has(savedMatchKey)).toBe(false);
    session.leave();
  });

  it("does not save the tutorial", () => {
    const { session } = createLocalMatch({ ...setup(), tutorial: true });
    expect(store.has(savedMatchKey)).toBe(false);
    session.leave();
  });
});
