import { describe, expect, it } from "vitest";
import { registry } from "@realms/content";
import {
  boosterFor,
  boosterPacks,
  drawBooster,
  packCards,
  packIds,
  questAlignments,
} from "@realms/content/boosters";
import {
  boosterPrice,
  buyCollectionBooster,
  collectionKey,
  createCollection,
  emptyCollection,
  packCount,
  parseCollection,
} from "../src/features/collection/lib/collection";

const [pack] = boosterPacks;
const funded = (crowns: number) => ({ ...emptyCollection(), crowns });

describe("the booster", () => {
  it("is one pack that draws from every faction", () => {
    expect(boosterPacks).toHaveLength(1);
    const cards = Object.values(registry.cards),
      pool = packCards(cards, pack!);
    expect(pool.length).toBe(cards.length);
    for (const alignment of questAlignments)
      for (const faction of alignment.factions) expect(pack!.factions).toContain(faction);
  });
  it("is what every older pack ID stands for", () => {
    for (const id of [packIds.good, packIds.neutral, packIds.evil, "nonsense", undefined])
      expect(boosterFor(id).id).toBe(packIds.realms);
  });
  it("sells one for 100 crowns and ten for 900", () => {
    expect(boosterPrice(1)).toBe(100);
    expect(boosterPrice(10)).toBe(900);
    const one = buyCollectionBooster(funded(1000), pack!, 1);
    expect([one.crowns, packCount(one, pack!.id)]).toEqual([900, 1]);
    const ten = buyCollectionBooster(funded(1000), pack!, 10);
    expect([ten.crowns, packCount(ten, pack!.id)]).toEqual([100, 10]);
  });
  it("does not sell what you cannot afford, or a nonsense amount", () => {
    expect(() => buyCollectionBooster(funded(899), pack!, 10)).toThrow();
    expect(() => buyCollectionBooster(funded(99), pack!, 1)).toThrow();
    expect(() => buyCollectionBooster(funded(1000), pack!, 0)).toThrow();
    expect(() => buyCollectionBooster(funded(1000), pack!, 1.5)).toThrow();
  });
  it("gives a new player five", () => {
    expect(packCount(createCollection(registry, []), pack!.id)).toBe(5);
    expect(packCount(createCollection(registry, [], undefined, "horde"), pack!.id)).toBe(5);
  });
  it("folds boosters saved under the old packs into the one", () => {
    const saved = {
      ...emptyCollection(),
      packs: { [packIds.good]: 2, [packIds.neutral]: 1, [packIds.evil]: 4 },
    };
    const loaded = parseCollection(JSON.stringify(saved), registry)!;
    expect(loaded.packs).toEqual({ [packIds.realms]: 7 });
    expect(collectionKey).toBeTruthy();
  });
});

describe("what a booster holds", () => {
  const cards = packCards(Object.values(registry.cards), pack);
  const rarityOf = (id: string) => registry.cards[id].rarity;
  const seeded = (seed: number) => {
    let state = seed;
    return () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  };
  it("is three commons, a rare or common, and a rare or legendary, revealed in that order", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ids = drawBooster(cards, seeded(seed)),
        rarities = ids.map(rarityOf);
      expect(rarities).toHaveLength(5);
      expect(rarities.slice(0, 3)).toEqual(["common", "common", "common"]);
      expect(["rare", "common"]).toContain(rarities[3]);
      expect(["rare", "legendary"]).toContain(rarities[4]);
    }
  });
  it("gives a legendary in the last slot now and then, but never more than one", () => {
    let legendaries = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const rarities = drawBooster(cards, seeded(seed)).map(rarityOf);
      legendaries += rarities.filter((rarity) => rarity === "legendary").length;
      expect(rarities.filter((rarity) => rarity === "legendary").length).toBeLessThanOrEqual(1);
    }
    expect(legendaries).toBeGreaterThan(20);
    expect(legendaries).toBeLessThan(200);
  });
});
