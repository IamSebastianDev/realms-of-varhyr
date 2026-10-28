import { describe, expect, it } from "vitest";
import {
  addMatch,
  deckVersion,
  diffCards,
  emptyLedger,
  exportLedger,
  mergeLedgers,
  parseHistoryFile,
  parseLedger,
  summarize,
  winRange,
  MAX_MATCHES,
  type MatchRecord,
} from "../src/features/stats/lib/ledger";

const rec = (id: string, over: Partial<MatchRecord> = {}): MatchRecord => ({
  id,
  at: `2026-10-0${1 + (Number(id.replace(/\D/g, "")) % 9)}T10:00:00.000Z`,
  deckId: "d1",
  deckName: "Deck",
  version: deckVersion(["a", "b"]),
  opponent: { factions: ["x"] },
  mode: "practice",
  first: true,
  result: "won",
  turns: 6,
  life: 10,
  ...over,
});

describe("ledger", () => {
  it("fingerprints a card list regardless of order", () => {
    expect(deckVersion(["a", "b", "a"])).toBe(deckVersion(["b", "a", "a"]));
    expect(deckVersion(["a", "b", "a"])).not.toBe(deckVersion(["a", "b", "b"]));
  });

  it("counts a match once", () => {
    const one = addMatch(emptyLedger(), rec("m1"), ["a", "b"]);
    expect(addMatch(one, rec("m1"), ["a", "b"])).toBe(one);
    expect(one.matches).toHaveLength(1);
    expect(Object.keys(one.versions)).toHaveLength(1);
  });

  it("trims the oldest matches and the versions only they used", () => {
    let ledger = addMatch(emptyLedger(), rec("m0", { version: "old" }), ["z"]);
    for (let i = 1; i <= MAX_MATCHES; i++) ledger = addMatch(ledger, rec(`m${i}`), ["a", "b"]);
    expect(ledger.matches).toHaveLength(MAX_MATCHES);
    expect(ledger.versions.old).toBeUndefined();
  });

  it("diffs card lists by copies", () => {
    expect(diffCards(["a", "a", "b"], ["a", "c", "c", "b"])).toEqual({
      added: [{ id: "c", count: 2 }],
      removed: [{ id: "a", count: 1 }],
    });
  });

  it("summarizes seats, opponents and versions of one deck", () => {
    const v2 = deckVersion(["a", "c"]);
    let ledger = emptyLedger();
    ledger = addMatch(ledger, rec("m1", { at: "2026-10-01T10:00:00Z" }), ["a", "b"]);
    ledger = addMatch(
      ledger,
      rec("m2", { at: "2026-10-02T10:00:00Z", result: "lost", first: false }),
      ["a", "b"],
    );
    ledger = addMatch(ledger, rec("m3", { at: "2026-10-03T10:00:00Z", version: v2 }), ["a", "c"]);
    ledger = addMatch(ledger, rec("x1", { deckId: "other" }), ["a", "b"]);
    const s = summarize(ledger, "d1");
    expect(s.overall).toEqual({ won: 2, lost: 1, draw: 0, games: 3 });
    expect(s.onTheDraw.games).toBe(1);
    expect(s.opponents).toHaveLength(1);
    expect(s.versions.map((v) => v.tally.games)).toEqual([2, 1]);
    expect(s.versions[0]!.diff).toBeNull();
    expect(s.versions[1]!.diff).toEqual({
      added: [{ id: "c", count: 1 }],
      removed: [{ id: "b", count: 1 }],
    });
    expect(s.recent).toEqual(["won", "lost", "won"].reverse());
  });

  it("gives a wide range for few games", () => {
    const [lo, hi] = winRange({ won: 3, lost: 0, draw: 0, games: 3 });
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBe(1);
  });

  it("round-trips an export and merges without duplicates", () => {
    const a = addMatch(emptyLedger(), rec("m1"), ["a", "b"]);
    const b = addMatch(addMatch(emptyLedger(), rec("m1"), ["a", "b"]), rec("m2"), ["a", "b"]);
    const file = JSON.stringify(exportLedger(b));
    const merged = mergeLedgers(a, parseHistoryFile(file));
    expect(merged.matches.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("rejects foreign or damaged files and drops bad records", () => {
    expect(() => parseHistoryFile("{}")).toThrow();
    expect(() => parseHistoryFile("nope")).toThrow();
    expect(parseLedger("nope")).toBeNull();
    const good = addMatch(emptyLedger(), rec("m1"), ["a", "b"]);
    const dirty = JSON.stringify({ ...good, matches: [...good.matches, { id: "bad" }] });
    expect(parseLedger(dirty)!.matches).toHaveLength(1);
  });
});

describe("buildRecord", () => {
  it("records a finished bot match from the player's seat", async () => {
    const { registry, starterDefinitions } = await import("@realms/content");
    const { apply, decisionPlayer } = await import("@realms/core");
    const { botCommand } = await import("@realms/core/bot");
    const { startMatch } = await import("../src/features/match/lib/session");
    const { buildRecord } = await import("../src/features/stats/lib/record");
    const [a, b] = starterDefinitions;
    const initial = startMatch(7, a!.id, false, undefined, undefined, b);
    let state = initial;
    for (let i = 0; i < 4000 && !state.outcome; i++) {
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
    expect(state.outcome).toBeTruthy();
    const built = buildRecord(initial, state, "p1", {
      id: "x",
      at: "2026-10-28T10:00:00.000Z",
      mode: "practice",
      deckId: a!.id,
      deckName: a!.name,
      registry,
      cards: a!.cards,
      online: false,
    })!;
    expect(built.cards).toHaveLength(a!.cards.length);
    expect(built.record.version).toBe(deckVersion(a!.cards));
    const theirs = new Set(b!.cards.flatMap((id) => registry.cards[id]?.factions ?? []));
    expect(built.record.opponent.factions.length).toBeGreaterThan(0);
    for (const faction of built.record.opponent.factions) expect(theirs.has(faction)).toBe(true);
    expect(built.record.result).toBe(
      state.outcome === "p1" ? "won" : state.outcome === "draw" ? "draw" : "lost",
    );
    expect(built.record.first).toBe(initial.active === "p1");
    expect(
      buildRecord(initial, { ...state, outcome: null }, "p1", {
        id: "y",
        at: "",
        mode: "practice",
        deckId: "",
        deckName: "",
        cards: ["a"],
        registry,
        online: false,
      }),
    ).toBeNull();
  });
});

describe("archetype", () => {
  it("needs two cards of a faction, unless only a splash was seen", async () => {
    const { registry } = await import("@realms/content");
    const { archetype } = await import("../src/features/stats/lib/record");
    const [x, y] = Object.values(registry.cards).filter(
      (c) => c.factions.length === 1 && c.factions[0] !== "neutral",
    );
    const other = Object.values(registry.cards).find(
      (c) => c.factions[0] !== x!.factions[0] && c.factions[0] !== "neutral",
    )!;
    expect(archetype([], registry)).toEqual([]);
    expect(archetype([x!.id], registry)).toEqual([x!.factions[0]]);
    expect(archetype([x!.id, x!.id, other.id], registry)).toEqual([x!.factions[0]]);
    expect(y).toBeTruthy();
  });
});
