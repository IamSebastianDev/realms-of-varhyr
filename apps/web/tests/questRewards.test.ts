import { afterEach, describe, expect, it, vi } from "vitest";
import { registry } from "@realms/content";
import type { RunState } from "@realms/quest";
import { questRules } from "@realms/quest";
import { collectionKey, emptyCollection, ownershipLimit, parseCollection } from "../src/collection";
import {
  applyPayouts,
  availableQuestCopies,
  buyQuestCards,
  closeQuestRewards,
  purchasedQuestCopies,
  settleQuest,
  unpaidPayouts,
} from "../src/quest/rewards";

const cards = Object.values(registry.cards);
const common = cards.find((card) => card.rarity === "common" && !card.legendary)!;
const rare = cards.find((card) => card.rarity === "rare" && !card.legendary)!;
const legendary = cards.find((card) => card.legendary)!;
// Only the immutable end-of-run data is relevant to settlement, independent of map content and deck balance.
const run = (changes: Partial<RunState> = {}): RunState => ({
  version: 2,
  id: "run-1",
  pack: "hearth-and-crown",
  faction: "crownlands",
  seed: 7,
  step: 30,
  startedAt: Date.UTC(2026, 9, 18),
  stage: "over",
  result: "dead",
  deck: [common.id, common.id, rare.id, legendary.id],
  life: 0,
  silver: 200,
  drafted: 15,
  position: "boss",
  route: ["boss"],
  visited: [],
  revealed: [],
  beacons: [],
  world: {},
  extra: [],
  caches: {},
  tiers: {},
  rumors: {},
  risen: null,
  quests: [],
  earned: [],
  offer: null,
  encounter: null,
  fight: null,
  stats: { fights: 2, silverEarned: 50 },
  ...changes,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("quest reward settlement", () => {
  it("keeps the exact selected copy across reloads, and never sells that copy twice", () => {
    const settled = settleQuest(emptyCollection(), run());
    const bought = buyQuestCards(settled, "run-1", { [common.id]: 1 }, registry, 0, {
      [common.id]: [1],
    });
    const reloaded = parseCollection(JSON.stringify(bought), registry)!;
    expect(purchasedQuestCopies(reloaded.questSettlements!["run-1"], common.id)).toEqual([1]);
    expect(() =>
      buyQuestCards(reloaded, "run-1", { [common.id]: 1 }, registry, 1, { [common.id]: [1] }),
    ).toThrow(/available/);
    const second = buyQuestCards(reloaded, "run-1", { [common.id]: 1 }, registry, 1, {
      [common.id]: [0],
    });
    expect(purchasedQuestCopies(second.questSettlements!["run-1"], common.id)).toEqual([1, 0]);
    expect(second.counts[common.id]).toBe(2);
    expect(() =>
      buyQuestCards(settled, "run-1", { [common.id]: 2 }, registry, 0, { [common.id]: [0, 0] }),
    ).toThrow(/available/);
    expect(() =>
      buyQuestCards(settled, "run-1", { [common.id]: 1 }, registry, 0, { [common.id]: [2] }),
    ).toThrow(/available/);
  });

  it("reads older counted purchases as individual copies and respects remaining collection capacity", () => {
    const settled = settleQuest(
      { ...emptyCollection(), counts: { [common.id]: ownershipLimit(common) - 1 } },
      run(),
    );
    const bought = buyQuestCards(settled, "run-1", { [common.id]: 1 }, registry, 0);
    delete bought.questSettlements!["run-1"].purchasedCopies;
    const reloaded = parseCollection(JSON.stringify(bought), registry)!;
    expect(purchasedQuestCopies(reloaded.questSettlements!["run-1"], common.id)).toEqual([0]);
    expect(
      availableQuestCopies(reloaded, reloaded.questSettlements!["run-1"], registry, common.id),
    ).toBe(0);
    expect(() =>
      buyQuestCards(reloaded, "run-1", { [common.id]: 1 }, registry, 1, { [common.id]: [1] }),
    ).toThrow(/available/);
  });

  it("opens the purchase screen once, keeps purchases and their silver budget across reloads, and pays nothing itself", () => {
    const completed = run(),
      settled = settleQuest(emptyCollection(), completed);
    expect(settled.crowns).toBe(0);
    expect(settled.packs).toEqual({});
    expect(settled.questSettlements![completed.id].reward).toBeNull();
    expect(settleQuest(settled, completed)).toBe(settled);
    const bought = buyQuestCards(
      settled,
      completed.id,
      { [common.id]: 2, [legendary.id]: 1 },
      registry,
      0,
    );
    expect(bought.counts[common.id]).toBe(2);
    expect(bought.questSettlements![completed.id].coins).toBe(
      200 - 2 * questRules.keepPrice.common - questRules.keepPrice.legendary,
    );
    const reloaded = parseCollection(JSON.stringify(bought), registry)!;
    expect(reloaded).toEqual(bought);
    expect(() => buyQuestCards(reloaded, completed.id, { [common.id]: 1 }, registry, 0)).toThrow(
      /changed/,
    );
    expect(
      buyQuestCards(reloaded, completed.id, { [rare.id]: 1 }, registry, 1).counts[rare.id],
    ).toBe(1);
  });

  it.each(["dead", "retired"] as const)("allows purchases after %s", (result) => {
    const completed = run({ result, silver: questRules.keepPrice.rare });
    const bought = buyQuestCards(
      settleQuest(emptyCollection(), completed),
      completed.id,
      { [rare.id]: 1 },
      registry,
      0,
    );
    expect(bought.counts[rare.id]).toBe(1);
    expect(bought.questSettlements![completed.id].coins).toBe(0);
  });

  it("applies each boss and quest payout exactly once, across reloads and repeated calls", () => {
    const earned = [
      {
        id: "boss:a",
        source: "boss" as const,
        title: "Boss",
        packs: { "hearth-and-crown": 1 },
        crowns: 0,
      },
      {
        id: "quest:b",
        source: "quest" as const,
        title: "Bandits",
        packs: { "hearth-and-crown": 2 },
        crowns: 30,
      },
    ];
    const active = run({ stage: "map", result: null, earned: earned.slice(0, 1) });
    const first = applyPayouts(emptyCollection(), active);
    expect(first.packs["hearth-and-crown"]).toBe(1);
    expect(applyPayouts(first, active)).toBe(first);
    const later = run({ stage: "map", result: null, earned });
    expect(unpaidPayouts(first, later).map((payout) => payout.id)).toEqual(["quest:b"]);
    const second = applyPayouts(parseCollection(JSON.stringify(first), registry)!, later);
    expect(second.packs["hearth-and-crown"]).toBe(3);
    expect(second.crowns).toBe(30);
    expect(applyPayouts(second, later)).toBe(second);
    expect(applyPayouts(second, { ...later, id: "run-2" }).packs["hearth-and-crown"]).toBe(6); // Receipts belong to their run.
  });

  it("rejects unaffordable, unavailable, malformed and over-cap selections without charging", () => {
    const collection = settleQuest(
      {
        ...emptyCollection(),
        counts: { [common.id]: ownershipLimit(common) - 1, [legendary.id]: 1 },
      },
      run({ silver: 20 }),
    );
    const before = JSON.stringify(collection),
      receipt = collection.questSettlements!["run-1"];
    expect(availableQuestCopies(collection, receipt, registry, common.id)).toBe(1);
    expect(availableQuestCopies(collection, receipt, registry, legendary.id)).toBe(0);
    for (const selection of [
      { [common.id]: 2 },
      { [legendary.id]: 1 },
      { missing: 1 },
      { [common.id]: -1 },
      { [common.id]: 0.5 },
    ])
      expect(() => buyQuestCards(collection, "run-1", selection, registry, 0)).toThrow();
    expect(() => buyQuestCards(collection, "run-1", { [rare.id]: 1 }, registry, 0)).toThrow(
      /silver/,
    );
    expect(JSON.stringify(collection)).toBe(before);
    const bought = buyQuestCards(collection, "run-1", { [common.id]: 1 }, registry, 0);
    expect(bought.counts[common.id]).toBe(ownershipLimit(common));
    expect(bought.crowns).toBe(collection.crowns); // Never convert already-owned cards into account currency.
  });

  it("closes purchases permanently without reopening or paying the same run", () => {
    const settled = settleQuest(emptyCollection(), run());
    const closed = closeQuestRewards(settled, "run-1");
    expect(closeQuestRewards(closed, "run-1")).toBe(closed);
    expect(settleQuest(closed, run())).toBe(closed);
    expect(() => buyQuestCards(closed, "run-1", { [common.id]: 1 }, registry, 0)).toThrow(
      /no longer/,
    );
    expect(
      availableQuestCopies(closed, closed.questSettlements!["run-1"], registry, common.id),
    ).toBe(0);
    expect(() => settleQuest(emptyCollection(), run({ stage: "map", result: null }))).toThrow(
      /Finish/,
    );
  });

  it("leaves receipts and ownership untouched on storage failure, then retries exactly once", async () => {
    vi.resetModules();
    const storage = new Map([[collectionKey, JSON.stringify(emptyCollection())]]);
    let fail = false;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (fail) throw new Error("Full");
        storage.set(key, value);
      },
    });
    const { updateCollection } = await import("../src/collectionStore");
    updateCollection((current) => current);
    fail = true;
    expect(() =>
      updateCollection((current) => settleQuest(current, run()), { requireSave: true }),
    ).toThrow(/save/);
    expect(JSON.parse(storage.get(collectionKey)!).crowns).toBe(0);
    fail = false;
    const settled = updateCollection((current) => settleQuest(current, run()), {
      requireSave: true,
    }).collection;
    fail = true;
    expect(() =>
      updateCollection(
        (current) => buyQuestCards(current, "run-1", { [rare.id]: 1 }, registry, 0),
        { requireSave: true },
      ),
    ).toThrow(/save/);
    expect(parseCollection(storage.get(collectionKey)!, registry)).toEqual(settled);
    fail = false;
    const bought = updateCollection(
      (current) => buyQuestCards(current, "run-1", { [rare.id]: 1 }, registry, 0),
      { requireSave: true },
    ).collection;
    expect(bought.counts[rare.id]).toBe(1);
    vi.resetModules();
    const reloaded = await import("../src/collectionStore");
    expect(
      reloaded.updateCollection((current) => settleQuest(current, run()), { requireSave: true })
        .collection,
    ).toEqual(bought);
  });

  it("retains a fight report until its outcome is durably saved, including the completion time", async () => {
    vi.resetModules();
    const active = run({
      stage: "map",
      result: null,
      fight: {
        node: "boss",
        seed: 7,
        tier: 0,
        enemy: { name: "Boss", faction: "black-host", deck: [], life: 15 },
      },
    });
    const storage = new Map<string, string>();
    let fail = false;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => {
        if (fail) throw new Error("Full");
        storage.set(key, value);
      },
    });
    const store = await import("../src/quest/questStore");
    store.saveRun(active);
    const report = { run: active.id, node: "boss", won: true, life: 4, finishedAt: 5_000 };
    store.reportFight(report);
    expect(store.readFightReport(active)).toEqual(report);
    expect(store.readFightReport(active)).toEqual(report); // Reading is not acknowledgment.
    fail = true;
    expect(store.saveRun(run())).toBe(false);
    vi.resetModules();
    const reloaded = await import("../src/quest/questStore");
    expect(reloaded.readRun()!.stage).toBe("map");
    expect(reloaded.readFightReport(active)).toEqual(report);
    fail = false;
    expect(reloaded.saveRun(run())).toBe(true);
    reloaded.clearFightReport(report);
    expect(reloaded.readFightReport(active)).toBeNull();
  });
});
