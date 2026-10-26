import { describe, expect, it } from "vitest";

import {
  claimAchievement,
  claimDaily,
  closestAchievement,
  drawDailies,
  newGoals,
  recordBooster,
  recordMatch,
  rerollDaily,
  rollDay,
  type Goals,
  type MatchResult,
} from "../src/features/goals/lib/goals";

const external = { collectionPercent: 0, boostersOpened: 0 };
const win = (id: string, extra: Partial<MatchResult> = {}): MatchResult => ({
  id,
  day: "2026-10-17",
  won: true,
  online: false,
  deckId: "a",
  factions: ["crown"],
  spells: 0,
  holdings: 0,
  creaturesLost: 0,
  damageTaken: 0,
  ownTurns: 6,
  ...extra,
});

describe("goals", () => {
  it("counts a match once, however often it is reported", () => {
    let goals: Goals = newGoals("2026-10-17");
    goals = recordMatch(recordMatch(goals, win("m1")), win("m1"));
    expect(goals.totals.wins).toBe(1);
  });

  it("deals the same dailies all day and new ones at midnight; progress and claims pay once", () => {
    const goals = newGoals("2026-10-17");
    expect(drawDailies("2026-10-17").map((slot) => slot.id)).toEqual(
      goals.daily.map((slot) => slot.id),
    );
    // Force a finished goal and claim it twice.
    const done = {
      ...goals,
      daily: goals.daily.map((slot, index) => (index === 0 ? { ...slot, progress: 99 } : slot)),
    };
    const first = claimDaily(done, 0)!;
    expect(first.reward.crowns || first.reward.boosters).toBeTruthy();
    expect(claimDaily(first.goals, 0)).toBeNull();
    const tomorrow = rollDay(
      { ...first.goals, totals: { ...first.goals.totals, wins: 4 } },
      "2026-10-18",
    );
    expect(tomorrow.daily.every((slot) => !slot.claimed && slot.progress === 0)).toBe(true);
    expect(tomorrow.totals.wins).toBe(4);
  });

  it("lets an unfinished daily be swapped once a day", () => {
    const goals = newGoals("2026-10-17"),
      swapped = rerollDaily(goals, 1);
    expect(swapped.rerolled).toBe(true);
    expect(swapped.daily[1].id).not.toBe(goals.daily[1].id);
    expect(rerollDaily(swapped, 2)).toBe(swapped);
  });

  it("turns matches and boosters into achievement progress that can be claimed tier by tier", () => {
    let goals = newGoals("2026-10-17");
    for (let i = 0; i < 10; i++) goals = recordMatch(goals, win(`m${i}`, { spells: 6 }));
    goals = recordBooster(goals, ["rare", "common", "legendary", "common", "common"]);
    expect(goals.totals).toMatchObject({
      wins: 10,
      bestStreak: 10,
      spells: 60,
      rarePulls: 1,
      legendaryPulls: 1,
      flawlessWins: 10,
    });
    const closest = closestAchievement(goals, external)!;
    expect(closest.claimable).toBe(true);
    const claim = claimAchievement(goals, closest.def.id, external)!;
    expect(claim.goals.claimedTiers[closest.def.id]).toBe(1);
  });

  it("a loss breaks the streak", () => {
    let goals = recordMatch(newGoals("2026-10-17"), win("a"));
    goals = recordMatch(goals, win("b", { won: false }));
    expect(goals.totals).toMatchObject({ streak: 0, bestStreak: 1, wins: 1, matches: 2 });
  });
});
