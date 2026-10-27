import { describe, expect, it } from "vitest";
import type { GameEvent, GameState } from "@realms/contracts";
import { drawsOf } from "../src/features/match/lib/drawFx";

// Only what drawsOf reads: the phase, each player's hand and deck sizes, and where the cards are.
type Sizes = { hand: number; deck: number };
function state(
  phase: GameState["phase"],
  p1: Sizes,
  p2: Sizes,
  inHand: string[] = [],
  turn = 3,
): GameState {
  const player = (sizes: Sizes) => ({
    hand: Array.from({ length: sizes.hand }, (_, i) => `h${i}`),
    deck: Array.from({ length: sizes.deck }, (_, i) => `d${i}`),
  });
  return {
    phase,
    turn,
    players: { p1: player(p1), p2: player(p2) },
    cards: Object.fromEntries(inHand.map((id) => [id, { zone: "hand" }])),
  } as unknown as GameState;
}
const drawn = (seq: number, player: "p1" | "p2", cardId: string): GameEvent => ({
  seq,
  type: "card.drawn",
  message: "",
  visibility: player,
  player,
  cardId,
});

describe("draw animation", () => {
  it("shows cards drawn by an effect, named for the viewer", () => {
    const before = state("play", { hand: 3, deck: 20 }, { hand: 3, deck: 20 });
    const after = state("play", { hand: 5, deck: 18 }, { hand: 3, deck: 20 }, ["a", "b"]);
    const flights = drawsOf(before, after, [drawn(1, "p1", "a"), drawn(2, "p1", "b")], "k", "p1");
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ player: "p1", cardIds: ["a", "b"], count: 2 });
  });
  it("counts the opponent's draws when their cards are hidden", () => {
    const before = state("play", { hand: 3, deck: 20 }, { hand: 3, deck: 20 });
    const after = state("play", { hand: 3, deck: 20 }, { hand: 4, deck: 19 });
    const flights = drawsOf(before, after, [], "k", "p1");
    expect(flights).toEqual([{ id: "k-p2", player: "p2", cardIds: [], count: 1 }]);
  });
  it("ignores a card returned to hand or milled, which moves only one of the two piles", () => {
    const before = state("play", { hand: 3, deck: 20 }, { hand: 3, deck: 20 });
    const returned = state("play", { hand: 4, deck: 20 }, { hand: 3, deck: 20 });
    const milled = state("play", { hand: 3, deck: 19 }, { hand: 3, deck: 20 });
    expect(drawsOf(before, returned, [], "k", "p1")).toEqual([]);
    expect(drawsOf(before, milled, [], "k", "p1")).toEqual([]);
  });
  it("leaves out the draw dealt as a turn begins", () => {
    const before = state("end", { hand: 3, deck: 20 }, { hand: 3, deck: 20 }, [], 3);
    const after = state("draw", { hand: 5, deck: 18 }, { hand: 3, deck: 20 }, ["a", "b"], 4);
    expect(drawsOf(before, after, [drawn(1, "p1", "a"), drawn(2, "p1", "b")], "k", "p1")).toEqual(
      [],
    );
  });
  it("leaves out the draw at the start of a turn and the opening hand", () => {
    const before = state("draw", { hand: 3, deck: 20 }, { hand: 3, deck: 20 });
    const after = state("play", { hand: 4, deck: 19 }, { hand: 3, deck: 20 }, ["a"]);
    expect(drawsOf(before, after, [drawn(1, "p1", "a")], "k", "p1")).toEqual([]);
    const mulligan: GameEvent[] = [
      { seq: 1, type: "mulligan.replaced", message: "", visibility: "p1" },
    ];
    expect(
      drawsOf(
        state("play", { hand: 5, deck: 20 }, { hand: 5, deck: 20 }),
        after,
        mulligan,
        "k",
        "p1",
      ),
    ).toEqual([]);
  });
});
