import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultDeckId, registry, starterDefinitions } from "@realms/content";
import { validateDeck } from "@realms/core";
import { matchContent, startMatch } from "../src/features/match/lib/session";

const chosen = starterDefinitions.find((deck) => deck.id === defaultDeckId)!;
const options = { seed: 731, mode: "practice" as const, deck: chosen.id, skirmish: false };
const playable = starterDefinitions.filter((deck) => !validateDeck(deck.cards, registry).length);
let saved: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("automatic bot starter rotation", () => {
  it("visits every current starter, including the player's faction, before repeating", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    expect(playable).toHaveLength(starterDefinitions.length);
    expect(playable.length).toBeGreaterThan(1);
    const seen: string[] = [];
    for (let index = 0; index < playable.length * 2; index++) {
      // Same shuffle seed throughout: deck variety comes from the rotation, not seed luck.
      const state = startLocalMatch(options);
      const id = saved.get(botRotationKey)!;
      const opponent = playable.find((deck) => deck.id === id)!;
      expect(opponent).toBeDefined();
      expect(state.players.p2.name).toBe(
        opponent.id === chosen.id ? `${opponent.name} · opponent` : opponent.name,
      );
      const cards = [...state.players.p2.hand, ...state.players.p2.deck]
        .map((id) => state.cards[id].definitionId)
        .sort();
      expect(cards).toEqual([...opponent.cards].sort());
      seen.push(id);
    }
    expect(new Set(seen.slice(0, playable.length))).toEqual(
      new Set(playable.map((deck) => deck.id)),
    );
    expect(seen.slice(playable.length)).toEqual(seen.slice(0, playable.length));
  });
  it("continues the same rotation after a page reload and a player deck change", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    startLocalMatch(options);
    const previous = saved.get(botRotationKey)!;
    const next =
      playable[(playable.findIndex((deck) => deck.id === previous) + 1) % playable.length];
    vi.resetModules();
    const reloaded = await import("../src/features/match/lib/localMatchSetup");
    reloaded.startLocalMatch({ ...options, deck: next.id });
    expect(saved.get(botRotationKey)).toBe(next.id);
  });
  it("ignores old pinned opponent preferences in practice mode", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    const pinned = playable[0];
    const first = startLocalMatch({ ...options, opponentDeck: pinned });
    const firstId = saved.get(botRotationKey);
    const second = startLocalMatch({ ...options, opponentDeck: pinned });
    expect(saved.get(botRotationKey)).not.toBe(firstId);
    expect(second.players.p2.name).not.toBe(first.players.p2.name);
  });
  it("honours fixed hotseat decks without consuming the next bot opponent", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    const last = playable[1];
    saved.set(botRotationKey, last.id);
    const opponent = playable.find((deck) => deck.id !== chosen.id)!;
    const hotseat = startLocalMatch({ ...options, mode: "hotseat", opponentDeck: opponent });
    expect(hotseat.players.p2.name).toBe(opponent.name);
    expect(saved.get(botRotationKey)).toBe(last.id);
  });
  it("skips invalid starters and recovers from removed starter IDs", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    const first = playable[0],
      next = playable[1];
    const content = {
      registry,
      starters: [first, { id: "unfinished", name: "Unfinished", cards: [] }, next],
    };
    saved.set(botRotationKey, first.id);
    expect(startLocalMatch({ ...options, deck: first.id }, content).players.p2.name).toBe(
      next.name,
    );
    expect(saved.get(botRotationKey)).toBe(next.id);
    saved.set(botRotationKey, "removed-starter");
    vi.resetModules();
    const reloaded = await import("../src/features/match/lib/localMatchSetup");
    expect(reloaded.startLocalMatch({ ...options, deck: first.id }, content).players.p2.name).toBe(
      next.name,
    );
  });
  it("does not advance for a failed setup or a storage-free match reconstruction", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    saved.set(botRotationKey, playable[0].id);
    expect(() =>
      startLocalMatch({ ...options, customDeck: { id: "invalid", name: "Invalid", cards: [] } }),
    ).toThrow();
    expect(saved.get(botRotationKey)).toBe(playable[0].id);
    expect(startMatch(options.seed, options.deck)).toEqual(startMatch(options.seed, options.deck));
    expect(saved.get(botRotationKey)).toBe(playable[0].id);
  });
  it("keeps rotating within the page when browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Blocked");
      },
      setItem: () => {
        throw new Error("Blocked");
      },
    });
    const { startLocalMatch } = await import("../src/features/match/lib/localMatchSetup");
    const names = Array.from(
      { length: playable.length },
      () => startLocalMatch(options).players.p2.name,
    );
    expect(new Set(names).size).toBe(playable.length);
  });
  it("does not get stuck on an old saved ID when only storage writes fail", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    saved.set(botRotationKey, playable[0].id);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: () => {
        throw new Error("Full");
      },
    });
    const names = Array.from(
      { length: playable.length },
      () => startLocalMatch(options).players.p2.name,
    );
    expect(new Set(names).size).toBe(playable.length);
  });
  it("falls back to a legal custom mirror if there are no playable starters", async () => {
    const { startLocalMatch, botRotationKey } =
      await import("../src/features/match/lib/localMatchSetup");
    const custom = { ...chosen, id: "my-test-deck", name: "My test deck" };
    const state = startLocalMatch(
      { ...options, customDeck: custom },
      { ...matchContent, starters: [] },
    );
    expect(state.players.p2.name).toBe("My test deck · opponent");
    expect(saved.has(botRotationKey)).toBe(false);
  });
});
