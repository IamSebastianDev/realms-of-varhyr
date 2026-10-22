import { describe, expect, it } from "vitest";
import { planChannels } from "../src/features/match/lib/autoChannel";

import type { Pool } from "@realms/contracts";
const cost = (generic: number, factions: Record<string, number> = {}) => ({ generic, factions });
describe("planChannels", () => {
  it("needs nothing when the pool already pays", () => {
    expect(planChannels(cost(1), { neutral: 2 }, [])).toEqual([]);
  });
  it("uses the fewest producers", () => {
    const producers = [
      { cardId: "a", options: [{ neutral: 1 }] },
      { cardId: "b", options: [{ neutral: 2 }] },
    ];
    expect(planChannels(cost(2), {}, producers)).toEqual([{ cardId: "b", option: 0 }]);
  });
  it("picks the option with the right colour", () => {
    const producers = [{ cardId: "a", options: [{ neutral: 1 }, { undead: 1 }] as Pool[] }];
    expect(planChannels(cost(0, { undead: 1 }), {}, producers)).toEqual([
      { cardId: "a", option: 1 },
    ]);
  });
  it("gives up when the producers fall short", () => {
    expect(planChannels(cost(3), {}, [{ cardId: "a", options: [{ neutral: 1 }] }])).toBeNull();
  });
});
