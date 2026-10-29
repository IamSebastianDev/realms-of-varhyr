import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionPlayer } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { registry } from "@realms/content";
import { startMatch } from "../src/features/match/lib/session";
import {
  MAX_RECENT_MATCHES,
  recentMatches,
  recentMatchesKey,
  replayOf,
  saveRecentMatch,
  type RecentMatch,
} from "../src/features/match/lib/recentMatches";
import { ReplayMatchSession } from "../src/features/match/session/MatchSession";

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

function finished(seed: number, id = `m${seed}`): RecentMatch {
  const initial = startMatch(seed),
    authority = new MatchAuthority(registry, id, initial);
  for (let i = 0; i < 3000 && !authority.fullState.outcome; i++) {
    const seat = decisionPlayer(authority.fullState);
    authority.act(seat, {
      id: `a${i}`,
      revision: authority.snapshot(seat).view.revision,
      intent: { kind: "command", command: botCommand(authority.fullState, registry) },
    });
  }
  const state = authority.fullState;
  return {
    id,
    at: new Date(1_700_000_000_000 + seed).toISOString(),
    rules: state.rulesVersion,
    content: state.contentVersion,
    seat: "p1",
    deckName: "Deck",
    opponentName: "Bot",
    mode: "practice",
    result: state.outcome === "p1" ? "won" : state.outcome === "draw" ? "draw" : "lost",
    turns: state.turn,
    initial,
    commands: [...authority.log],
  };
}

describe("recent matches", () => {
  it("rebuilds a watchable replay that ends where the match ended", () => {
    const entry = finished(8),
      file = replayOf(entry),
      session = new ReplayMatchSession(file);
    expect(file.steps.length).toBe(entry.commands.length + 1);
    expect(session.getSnapshot().state.outcome).not.toBeNull();
    expect(file.steps[0]!.view.revision).toBe(0);
  });

  it("keeps only the newest matches, newest first, and each match once", () => {
    for (let i = 0; i < MAX_RECENT_MATCHES + 3; i++)
      saveRecentMatch({ ...finished(2), id: `m${i}` });
    saveRecentMatch({ ...finished(2), id: "m5", turns: 99 });
    const kept = recentMatches();
    expect(kept.length).toBe(MAX_RECENT_MATCHES);
    expect(kept[0]!.id).toBe("m5");
    expect(kept.filter((m) => m.id === "m5").length).toBe(1);
  });

  it("leaves out matches from another rules version and ignores damaged storage", () => {
    saveRecentMatch({ ...finished(4), rules: "old" });
    expect(recentMatches()).toEqual([]);
    store.set(recentMatchesKey, "{");
    expect(recentMatches()).toEqual([]);
  });
});
