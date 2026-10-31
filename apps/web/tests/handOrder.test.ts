import { describe, expect, it } from "vitest";
import { handDropIndex, moveInOrder, orderedHand } from "../src/features/match/lib/handOrder";

describe("hand order", () => {
  it("keeps the player's arrangement and appends new cards in arrival order", () => {
    expect(orderedHand(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
    expect(orderedHand(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
    // A played card drops out; a drawn card joins at the end; stale ids are ignored.
    expect(orderedHand(["a", "c", "d", "e"], ["c", "b", "a"])).toEqual(["c", "a", "d", "e"]);
  });
  it("moves a card so that the given number of cards stand before it", () => {
    expect(moveInOrder(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveInOrder(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 99)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b"], "x", 1)).toEqual(["a", "b"]);
  });
  it("finds the landing place from the other cards' centres, and only over the hand", () => {
    const hand = { left: 0, top: 500, width: 600, height: 200 };
    const boxes = Object.fromEntries(
      ["a", "b", "c", "d"].map((id, i) => [
        id,
        { left: i * 100, top: 520, width: 100, height: 150 },
      ]),
    );
    const ids = ["a", "b", "c", "d"];
    expect(handDropIndex({ x: 10, y: 600 }, "b", ids, hand, boxes)).toBe(0);
    expect(handDropIndex({ x: 260, y: 600 }, "a", ids, hand, boxes)).toBe(2);
    expect(handDropIndex({ x: 590, y: 600 }, "a", ids, hand, boxes)).toBe(3);
    expect(handDropIndex({ x: 260, y: 300 }, "a", ids, hand, boxes)).toBeNull();
    expect(handDropIndex({ x: 260, y: 600 }, "a", ids, undefined, boxes)).toBeNull();
  });
});
