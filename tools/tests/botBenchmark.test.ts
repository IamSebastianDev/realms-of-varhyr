import { describe, expect, it } from "vitest";
import { registry } from "@realms/content";
import { assertInvariants } from "@realms/core";
import { benchmarkCases } from "../src/bot-benchmark/cases";
import { runPlan } from "../src/bot-benchmark/fixture";
import { holdoutIds } from "../src/bot-benchmark/split";

const cases = benchmarkCases(registry);
describe("bot tactical fixtures", () => {
  it("has stable distinct IDs and a separate ten-case holdout", () => {
    expect(cases).toHaveLength(31);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect([...holdoutIds].every((id) => cases.some((item) => item.id === id))).toBe(true);
    expect(holdoutIds.size).toBe(10);
  });
  for (const item of cases)
    it(`${item.id}: ${item.title} has a legal, successful reference`, () => {
      assertInvariants(item.state);
      const before = structuredClone(item.state);
      const result = runPlan(item, item.reference, registry);
      expect(result.legal, result.error).toBe(true);
      expect(result.passed, result.error).toBe(true);
      expect(item.state).toEqual(before);
    });
  it("accepts an alternative winning lane rather than one exact reference", () => {
    const item = cases.find((item) => item.id === "rov-019")!;
    const attacker = item.state.players.p1.board[2]!;
    const alternate = [
      { type: "attack" as const, attackers: [attacker], lanes: { [attacker]: 3 } },
      { type: "confirm-combat" as const },
    ];
    expect(alternate).not.toEqual(item.reference);
    expect(runPlan(item, alternate, registry).passed).toBe(true);
  });
  it("distinguishes illegal actions from legal plans with the wrong outcome", () => {
    const item = cases[0];
    expect(runPlan(item, [{ type: "end" }], registry)).toMatchObject({
      legal: true,
      passed: false,
    });
    expect(runPlan(item, [{ type: "play", cardId: "invented" }], registry)).toMatchObject({
      legal: false,
      passed: false,
    });
    expect(runPlan(item, [], registry).passed).toBe(false);
    expect(runPlan(item, [...item.reference, { type: "end" }], registry)).toMatchObject({
      legal: false,
      passed: false,
    });
  });
});
