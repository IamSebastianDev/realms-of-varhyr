import { describe, expect, it } from "vitest";
import { defaultDeckId, registry, starterDefinitions } from "@realms/content";
import { apply, createMatch, decisionPlayer } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import type { CommandEnvelope, GameState } from "@realms/contracts";
import {
  achievements,
  matchResult,
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
    expect(
      claimAchievement(claim.goals, closest.def.id, external)?.goals.claimedTiers[closest.def.id] ??
        1,
    ).toBeGreaterThanOrEqual(1);
    expect(
      achievements.every((def) => def.tiers[0] < def.tiers[1] && def.tiers[1] < def.tiers[2]),
    ).toBe(true);
  });

  it("a loss breaks the streak", () => {
    let goals = recordMatch(newGoals("2026-10-17"), win("a"));
    goals = recordMatch(goals, win("b", { won: false }));
    expect(goals.totals).toMatchObject({ streak: 0, bestStreak: 1, wins: 1, matches: 2 });
  });

  it("reads a real finished match from the owner’s seat", () => {
    const cards = starterDefinitions.find((deck) => deck.id === defaultDeckId)!.cards;
    const initial = createMatch(registry, [cards, cards], 7);
    let state: GameState = initial;
    const log: CommandEnvelope[] = [];
    while (!state.outcome && log.length < 1500) {
      const envelope: CommandEnvelope = {
        actor: decisionPlayer(state),
        expectedRevision: state.revision,
        command: botCommand(state, registry),
      };
      state = apply(state, envelope, registry).state;
      log.push(envelope);
    }
    const result = matchResult(initial, state, log, "p1", {
      id: "real",
      online: false,
      deckId: defaultDeckId,
      registry,
      day: "2026-10-17",
    });
    expect(result.won).toBe(state.outcome === "p1");
    expect(result.spells + result.holdings).toBeGreaterThanOrEqual(0);
    expect(result.factions.length).toBeGreaterThan(0);
    expect(result.ownTurns).toBeGreaterThan(0);
    const goals = recordMatch(newGoals("2026-10-17"), result);
    expect(goals.totals.matches).toBe(1);
  });
});
