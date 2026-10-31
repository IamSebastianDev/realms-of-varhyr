import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boosterFor, packIds } from "@realms/content/boosters";
import {
  act,
  adventureRules,
  expandDeck,
  options,
  startRun,
  type RunState,
} from "@realms/adventure";
import { createMatch, validateDeck } from "@realms/core";
import { startMatch } from "../src/features/match/lib/session";
import {
  emptyCollection,
  parseCollection,
  collectionKey,
  buyCollectionCard,
  buyMissingDeckCards,
  missingDeckPurchase,
} from "../src/features/collection/lib/collection";
import { registry } from "@realms/content";
import { isAdventureExclusive } from "@realms/content/acquisition";
import { applyPayouts, unpaidPayouts } from "../src/features/adventure/lib/rewards";
import {
  adventureContent,
  adventureOf,
  adventures,
  clearFightReport,
  readFightReport,
  reportFight,
  runIsCurrent,
  saveRun,
  readRun,
} from "../src/features/adventure/stores/adventureStore";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

const def = adventureOf("bright-marches")!;
const begin = (seed = 5): RunState => startRun({ def, content: adventureContent, seed, now: 10 });
const withBoosters = (run: RunState): RunState => ({
  ...run,
  earned: [
    { id: "wardens-gift", pack: packIds.good, count: 1 },
    { id: "unity", pack: packIds.realms, count: 2 },
  ],
});

/** Cards that only adventures hand out, found by rule rather than by name. */
const exclusive = Object.values(registry.cards)
  .filter((card) => isAdventureExclusive(card))
  .map((card) => card.id);

describe("published adventures", () => {
  it("keeps supplemental characters out of purchases, including bulk deck purchases", () => {
    const id = exclusive[0]!;
    const collection = { ...emptyCollection(), crowns: 10000 };
    expect(() => buyCollectionCard(collection, registry.cards[id]!)).toThrow(/adventure/i);
    expect(missingDeckPurchase([id], collection.counts, registry)).toMatchObject({
      complete: false,
      adventureOnly: 1,
    });
    expect(() => buyMissingDeckCards(collection, [id], registry)).toThrow();
    expect(collection.crowns).toBe(10000);
  });
  it("include the Bright Marches, valid against the live cards", () => {
    expect(adventures.map((a) => a.id)).toContain("bright-marches");
    for (const card of Object.keys(def.starterDeck)) expect(registry.cards[card]).toBeTruthy();
    expect(runIsCurrent(begin())).toBe(true);
    expect(runIsCurrent({ ...begin(), revision: 99 })).toBe(false);
    expect(runIsCurrent({ ...begin(), adventure: "gone" })).toBe(false);
  });

  it("starts a real adventure match with a 20-card player deck while preserving normal deck rules", () => {
    const cards = begin().deck;
    const opponent = expandDeck(def.enemies[0]!.deck);
    const custom = { id: "adventure-test", name: "Adventure", cards };
    const enemy = { id: "enemy-test", name: "Enemy", cards: opponent };
    expect(validateDeck(cards, registry)).toHaveLength(1);
    expect(() => startMatch(1, undefined, false, custom, undefined, enemy)).toThrow(/30/);
    const state = startMatch(
      1,
      undefined,
      false,
      custom,
      undefined,
      enemy,
      undefined,
      undefined,
      false,
      adventureRules.minimumCards,
    );
    expect(Object.values(state.cards).filter((card) => card.owner === "p1")).toHaveLength(20);
    expect(() => createMatch(registry, [opponent, cards], 1, { playerMinimumCards: 20 })).toThrow(
      /30/,
    );
  });
});

describe("booster payouts", () => {
  it("awards collected legendaries only at the end, on a loss too, and converts duplicates once", () => {
    const [fresh, duplicate] = exclusive as [string, string];
    const run = { ...begin(), collected: [fresh, duplicate] };
    const owned = { ...emptyCollection(), counts: { [duplicate]: 1 } };
    expect(applyPayouts(owned, run)).toBe(owned);
    const paid = applyPayouts(owned, { ...run, stage: "over", result: "lost" });
    expect(paid.counts[fresh]).toBe(1);
    expect(paid.counts[duplicate]).toBe(1);
    expect(paid.crowns).toBe(100);
    expect(applyPayouts(paid, { ...run, stage: "over", result: "lost" })).toBe(paid);
  });
  it("grant each earned booster once, into the single booster", () => {
    const run = withBoosters(begin());
    const once = applyPayouts(emptyCollection(), run);
    const id = boosterFor().id;
    expect(once.packs[id]).toBe(3);
    expect(Object.keys(once.adventurePayouts!)).toHaveLength(2);
    const twice = applyPayouts(once, run);
    expect(twice).toBe(once);
    expect(unpaidPayouts(once, run)).toEqual([]);
  });

  it("pay a later scene without repeating the earlier ones, and each run separately", () => {
    const run = withBoosters(begin());
    const first = applyPayouts(emptyCollection(), { ...run, earned: run.earned.slice(0, 1) });
    expect(first.packs[boosterFor().id]).toBe(1);
    expect(unpaidPayouts(first, run).map((payout) => payout.id)).toEqual(["unity"]);
    const second = applyPayouts(first, run);
    expect(second.packs[boosterFor().id]).toBe(3);
    const other = applyPayouts(second, { ...withBoosters(begin(6)), id: "another-run" });
    expect(other.packs[boosterFor().id]).toBe(6);
  });

  it("survive saving and loading the collection, and ignore leftovers from the old quest mode", () => {
    const paid = applyPayouts(emptyCollection(), withBoosters(begin()));
    const loaded = parseCollection(JSON.stringify(paid), registry)!;
    expect(loaded.adventurePayouts).toEqual(paid.adventurePayouts);
    const legacy = {
      ...paid,
      questSettlements: { old: { nonsense: true } },
      questPayouts: { "a|b": true },
    };
    const parsed = parseCollection(JSON.stringify(legacy), registry)!;
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("questSettlements");
    expect(parsed.adventurePayouts).toEqual(paid.adventurePayouts);
    expect(collectionKey).toMatch(/^varhyr-/);
  });
});

describe("the saved run", () => {
  it("is restored exactly after a reload", () => {
    const run = act(begin(), def, adventureContent, { type: "continue" });
    saveRun(run);
    expect(store.get("varhyr-adventure-run-v1")).toBeTruthy();
    expect(JSON.parse(store.get("varhyr-adventure-run-v1")!)).toEqual(
      JSON.parse(JSON.stringify(run)),
    );
    expect(readRun()).toEqual(run);
    saveRun(null);
    expect(store.has("varhyr-adventure-run-v1")).toBe(false);
  });
});

describe("fight reports", () => {
  /** Walks the first road, closing scenes and offers, until the first battle is open. */
  const fighting = (): RunState => {
    const go = (run: RunState, action: Parameters<typeof act>[3]) =>
      act(run, def, adventureContent, action);
    let run = begin();
    for (let guard = 0; guard < 60 && run.view?.kind !== "battle"; guard++) {
      const view = run.view;
      if (!view) run = go(run, { type: "travel", node: options(run, def)[0]! });
      else if (view.kind === "event") {
        const event = def.events.find((e) => e.id === view.event)!;
        const open = event.choices?.find((c) => !c.when?.length);
        run = go(
          run,
          open && !view.chosen && view.beat >= event.beats.length - 1
            ? { type: "choose", choice: open.id }
            : { type: "continue" },
        );
      } else run = go(run, { type: "skip" });
    }
    return go(run, { type: "fight" });
  };
  it("are read only for the fight they belong to, and acknowledged once", () => {
    const run = fighting();
    expect(run.fight).not.toBeNull();
    expect(readFightReport(run)).toBeNull();
    reportFight({ run: run.id, node: run.fight!.node, won: true });
    expect(readFightReport(run)).toMatchObject({ won: true });
    expect(readFightReport({ ...run, id: "other" })).toBeNull();
    expect(readFightReport({ ...run, fight: { ...run.fight!, node: "m2" } })).toBeNull();
    clearFightReport(readFightReport(run)!);
    expect(readFightReport(run)).toBeNull();
  });
});
