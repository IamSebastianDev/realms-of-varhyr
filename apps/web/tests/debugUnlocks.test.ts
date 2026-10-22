import { afterEach, expect, it, vi } from "vitest";
import {
  achievements,
  achievementStatus,
  claimAchievement,
  newGoals,
} from "../src/features/goals/lib/goals";
import { cardBacks, isBackUnlocked } from "../src/features/card-backs/lib/cardBacks";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("grants sleeves and achievements independently and persists both without changing currency or match progress", async () => {
  vi.resetModules();
  const goals = newGoals();
  goals.totals.wins = 4;
  goals.claimedTiers.victories = 1;
  const storage = new Map([
    ["varhyr-goals-v1", JSON.stringify(goals)],
    ["varhyr-card-backs-v1", JSON.stringify({ bought: ["retired-sleeve"], favorite: "varhyr" })],
    ["varhyr-collection-v1", "untouched-collection"],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });

  const { unlockAllSleeves } = await import("../src/features/card-backs/stores/cardBackStore");
  unlockAllSleeves();
  expect(storage.get("varhyr-goals-v1")).toBe(JSON.stringify(goals));
  const backsAfterUnlock = JSON.parse(storage.get("varhyr-card-backs-v1")!);
  expect(cardBacks.every((back) => isBackUnlocked(back, goals, backsAfterUnlock.bought))).toBe(
    true,
  );
  const { currentGoals, completeAllAchievements } =
    await import("../src/features/goals/stores/goalsStore");
  completeAllAchievements();
  expect(JSON.parse(storage.get("varhyr-card-backs-v1")!)).toEqual(backsAfterUnlock);
  const completed = currentGoals(),
    backs = JSON.parse(storage.get("varhyr-card-backs-v1")!);
  const external = { collectionPercent: 0, boostersOpened: 0 };
  for (const def of achievements) {
    expect(achievementStatus(completed, def, external).done, def.id).toBe(true);
    expect(claimAchievement(completed, def.id, external)).toBeNull();
  }
  expect(cardBacks.every((back) => isBackUnlocked(back, completed, backs.bought))).toBe(true);
  expect(backs.favorite).toBe("varhyr");
  expect(backs.bought).toContain("retired-sleeve");
  expect(completed.totals).toEqual(goals.totals);
  expect(completed.daily).toEqual(goals.daily);
  expect(storage.get("varhyr-collection-v1")).toBe("untouched-collection");
  const once = [...storage];
  unlockAllSleeves();
  completeAllAchievements();
  expect([...storage]).toEqual(once);

  vi.resetModules();
  const reloaded = await import("../src/features/goals/stores/goalsStore");
  expect(reloaded.currentGoals().claimedTiers).toEqual(completed.claimedTiers);
  const sleeves = await import("../src/features/card-backs/stores/cardBackStore");
  expect(sleeves.resolveCardBack("gilded")).toBe("gilded");
  expect(sleeves.resolveCardBack("peaks")).toBe("peaks");
});

it("completes achievements without granting shop sleeves", async () => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const { completeAllAchievements } = await import("../src/features/goals/stores/goalsStore");
  completeAllAchievements();
  const { resolveCardBack } = await import("../src/features/card-backs/stores/cardBackStore");
  expect(resolveCardBack("gilded")).toBe("gilded");
  expect(resolveCardBack("peaks")).toBe("varhyr");
  expect(storage.has("varhyr-card-backs-v1")).toBe(false);
});
