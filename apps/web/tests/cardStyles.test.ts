import { afterEach, describe, expect, it, vi } from "vitest";
import { cardFinishes, defaultCardAppearance } from "@realms/renderer/cardFinishes";
import { registry } from "@realms/content";
import {
  collectionKey,
  emptyCollection,
  parseCollection,
  type Collection,
} from "../src/features/collection/lib/collection";
import {
  equipFinish,
  finishPrice,
  grantFinish,
  hasFinish,
  selectedCardStyles,
  unlockFinish,
} from "../src/features/card-styles/lib/cardStyles";
import { parseCardStyles } from "../src/features/card-styles/lib/cardStyleState";

const card = registry.cards["crownlands-recruit"];
const funded = (): Collection => ({ ...emptyCollection(), crowns: 1000, counts: { [card.id]: 2 } });
afterEach(() => vi.unstubAllGlobals());

describe.each(cardFinishes)("%s card finish", (finish) => {
  it("spends crowns once, equips the treatment and never changes card copies or packs", () => {
    const before = funded();
    const after = unlockFinish(before, card, finish);
    expect(after.crowns).toBe(before.crowns - finishPrice);
    expect(after.counts).toEqual(before.counts);
    expect(after.packs).toEqual(before.packs);
    expect(hasFinish(after, card, finish)).toBe(true);
    expect(selectedCardStyles(after)).toEqual({ [card.deckLimitKey]: finish });
    expect(unlockFinish(after, card, finish)).toBe(after);
    expect(before.cardStyles).toBeUndefined();
  });
  it("requires ownership and sufficient funds without changing the wallet", () => {
    const unowned = { ...funded(), counts: {} };
    expect(() => unlockFinish(unowned, card, finish)).toThrow("Own this card");
    const poor = { ...funded(), crowns: finishPrice - 1 };
    expect(() => unlockFinish(poor, card, finish)).toThrow("Not enough crowns");
    expect(poor.crowns).toBe(finishPrice - 1);
  });
  it("can grant a showcase as a reward without granting copies or charging crowns", () => {
    const before = emptyCollection();
    const reward = grantFinish(before, card.deckLimitKey, finish);
    expect(reward.crowns).toBe(0);
    expect(reward.counts).toEqual({});
    expect(hasFinish(reward, card, finish)).toBe(true);
    expect(selectedCardStyles(reward)).toEqual({});
    expect(grantFinish(reward, card.deckLimitKey, finish)).toBe(reward);
  });
  it("switches freely between unlocked and original printings without losing entitlement", () => {
    const unlocked = unlockFinish(funded(), card, finish);
    const original = equipFinish(unlocked, card, "original");
    expect(selectedCardStyles(original)).toEqual({});
    expect(hasFinish(original, card, finish)).toBe(true);
    expect(equipFinish(original, card, finish).crowns).toBe(unlocked.crowns);
    expect(() => equipFinish(funded(), card, finish)).toThrow("Unlock");
  });
  it("shares the unlock across artwork versions of a logical card", () => {
    const unlocked = unlockFinish(funded(), card, finish);
    expect(hasFinish(unlocked, { ...card, id: "another-printing" }, finish)).toBe(true);
  });
  it("round trips cosmetics with the account, and loads old saves unchanged", () => {
    expect(parseCollection(JSON.stringify(funded()), registry)?.cardStyles).toBeUndefined();
    const unlocked = unlockFinish(funded(), card, finish);
    expect(parseCollection(JSON.stringify(unlocked), registry)?.cardStyles).toEqual(
      unlocked.cardStyles,
    );
  });
  it("carries etched unlocks and selections over to foil without changing the wallet", () => {
    const legacy = {
      ...funded(),
      cardStyles: { etched: [card.deckLimitKey], equipped: [card.deckLimitKey] },
    };
    const loaded = parseCollection(JSON.stringify(legacy), registry)!;
    expect(loaded.cardStyles).toEqual({
      unlocked: { foil: [card.deckLimitKey] },
      equipped: { [card.deckLimitKey]: "foil" },
    });
    expect(loaded.crowns).toBe(legacy.crowns);
    expect(unlockFinish(loaded, card, "foil")).toBe(loaded);
    expect(parseCollection(JSON.stringify(loaded), registry)?.cardStyles).toEqual(
      loaded.cardStyles,
    );
  });
  it("merges old and new entitlements and does not equip locked cards", () => {
    expect(
      parseCardStyles({
        foil: [card.id, "runeguard"],
        etched: [card.id, "goldfield-farmer"],
        equipped: [card.id, "locked"],
      }),
    ).toEqual({
      unlocked: { foil: [card.id, "runeguard", "goldfield-farmer"] },
      equipped: { [card.id]: "foil" },
    });
  });
  it("ignores invalid cosmetics rather than discarding a valid collection", () => {
    expect(
      parseCardStyles({
        foil: [card.id, card.id, 5, "__proto__"],
        equipped: [card.id, "unowned"],
      }),
    ).toEqual({ unlocked: { foil: [card.id] }, equipped: { [card.id]: "foil" } });
    const loaded = parseCollection(JSON.stringify({ ...funded(), cardStyles: "bad" }), registry);
    expect(loaded?.counts).toEqual(funded().counts);
    expect(loaded?.crowns).toBe(1000);
    expect(
      selectedCardStyles({
        ...funded(),
        cardStyles: { unlocked: {}, equipped: { [card.id]: finish } },
      }),
    ).toEqual({});
  });
  it("does not debit or grant when saving the combined purchase fails", async () => {
    vi.resetModules();
    let raw = JSON.stringify(funded()),
      fail = false;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === collectionKey ? raw : null),
      setItem: (_key: string, value: string) => {
        if (fail) throw new Error("Full");
        raw = value;
      },
    });
    const { updateCollection } = await import("../src/features/collection/stores/collectionStore");
    updateCollection((current) => current);
    fail = true;
    expect(() =>
      updateCollection((current) => unlockFinish(current, card, finish), { requireSave: true }),
    ).toThrow("Could not save");
    expect(JSON.parse(raw).crowns).toBe(1000);
    expect(JSON.parse(raw).cardStyles).toBeUndefined();
    fail = false;
    expect(updateCollection((current) => current).collection.crowns).toBe(1000);
  });
});

describe("independent finishes", () => {
  it("charges for each distinct finish, retains every unlock and equips only one", () => {
    const before = funded();
    let collection = before;
    for (const finish of cardFinishes) {
      collection = unlockFinish(collection, card, finish);
      expect(selectedCardStyles(collection)).toEqual({ [card.deckLimitKey]: finish });
    }
    expect(collection.crowns).toBe(before.crowns - finishPrice * cardFinishes.length);
    for (const finish of cardFinishes) {
      expect(hasFinish(collection, card, finish)).toBe(true);
      const selected = equipFinish(collection, card, finish);
      expect(selected.crowns).toBe(collection.crowns);
      expect(selectedCardStyles(selected)).toEqual({ [card.deckLimitKey]: finish });
    }
    expect(parseCollection(JSON.stringify(collection), registry)?.cardStyles).toEqual(
      collection.cardStyles,
    );
    expect(equipFinish(collection, card, "original").cardStyles?.unlocked).toEqual(
      collection.cardStyles?.unlocked,
    );
  });
  it("does not unlock other finishes or change other cards when buying one", () => {
    const other = registry.cards.runeguard;
    const before = unlockFinish(
      { ...funded(), counts: { [card.id]: 2, [other.id]: 1 } },
      other,
      "foil",
    );
    const after = unlockFinish(before, card, "pearlescent");
    expect(hasFinish(after, card, "foil")).toBe(false);
    expect(hasFinish(after, card, "etched-foil")).toBe(false);
    expect(() => equipFinish(after, card, "prismatic")).toThrow("Unlock");
    expect(selectedCardStyles(after)).toEqual({
      [other.deckLimitKey]: "foil",
      [card.deckLimitKey]: "pearlescent",
    });
    expect(before.cardStyles?.unlocked.pearlescent).toBeUndefined();
  });
  it("validates modern saves and never turns old etched experiments into a new paid finish", () => {
    expect(
      parseCardStyles({
        etched: [card.id],
        unlocked: {
          pearlescent: [card.id, card.id],
          "unknown-finish": ["runeguard"],
          prismatic: ["runeguard"],
        },
        equipped: {
          [card.id]: "etched-foil",
          runeguard: "prismatic",
          locked: "foil",
          constructor: "prismatic",
        },
      }),
    ).toEqual({
      unlocked: { foil: [card.id], pearlescent: [card.id], prismatic: ["runeguard"] },
      equipped: { runeguard: "prismatic" },
    });
  });
});

describe("included legendary card foil", () => {
  const legendary = registry.cards["alderic-warmaster-of-the-empire"];
  const appearance = (collection: Collection) =>
    selectedCardStyles(collection)[legendary.deckLimitKey] ?? defaultCardAppearance(legendary);

  it("includes and defaults to foil without card ownership, currency or a stored unlock", () => {
    const collection = emptyCollection();
    expect(legendary.type).toBe("creature");
    expect(legendary.legendary).toBe(true);
    expect(defaultCardAppearance(legendary)).toBe("foil");
    expect(hasFinish(collection, legendary, "foil")).toBe(true);
    expect(appearance(collection)).toBe("foil");
    expect(unlockFinish(collection, legendary, "foil")).toBe(collection);
    expect(collection.crowns).toBe(0);
    expect(collection.cardStyles).toBeUndefined();
    expect(collection.counts).toEqual({});
  });
  it("allows Original to be chosen and saved, then switches back to the included foil for free", () => {
    const original = equipFinish(emptyCollection(), legendary, "original");
    expect(appearance(original)).toBe("original");
    const loaded = parseCollection(JSON.stringify(original), registry)!;
    expect(appearance(loaded)).toBe("original");
    const foil = equipFinish(loaded, legendary, "foil");
    expect(appearance(foil)).toBe("foil");
    expect(foil.crowns).toBe(0);
    expect(foil.cardStyles?.unlocked).toEqual({});
    expect(appearance(parseCollection(JSON.stringify(foil), registry)!)).toBe("foil");
  });
  it("charges for other finishes and retains them when returning to included foil", () => {
    const collection = { ...funded(), counts: { [legendary.id]: 1 } };
    expect(hasFinish(collection, legendary, "prismatic")).toBe(false);
    expect(() => equipFinish(collection, legendary, "prismatic")).toThrow("Unlock");
    const prismatic = unlockFinish(collection, legendary, "prismatic");
    expect(appearance(prismatic)).toBe("prismatic");
    expect(prismatic.crowns).toBe(collection.crowns - finishPrice);
    const foil = equipFinish(prismatic, legendary, "foil");
    expect(appearance(foil)).toBe("foil");
    expect(hasFinish(foil, legendary, "prismatic")).toBe(true);
    expect(foil.crowns).toBe(prismatic.crowns);
    expect(appearance(equipFinish(foil, legendary, "prismatic"))).toBe("prismatic");
  });
  it("preserves previously paid foil unlocks and other selected finishes on loading", () => {
    const collection = {
      ...funded(),
      counts: { [legendary.id]: 1 },
      cardStyles: { foil: [legendary.deckLimitKey], equipped: [legendary.deckLimitKey] },
    };
    const loaded = parseCollection(JSON.stringify(collection), registry)!;
    expect(appearance(loaded)).toBe("foil");
    expect(unlockFinish(loaded, legendary, "foil")).toBe(loaded);
    expect(loaded.crowns).toBe(collection.crowns);
    const pearl = unlockFinish(loaded, legendary, "pearlescent");
    expect(appearance(parseCollection(JSON.stringify(pearl), registry)!)).toBe("pearlescent");
  });
  it("includes standard foil on all legendary card types", () => {
    for (const type of ["creature", "holding", "spell"] as const) {
      const definition = { ...legendary, type };
      expect(defaultCardAppearance(definition)).toBe("foil");
      expect(hasFinish(emptyCollection(), definition, "foil")).toBe(true);
      expect(unlockFinish(emptyCollection(), definition, "foil").crowns).toBe(0);
    }
  });
  it("does not include free foil for nonlegendary cards of any type", () => {
    for (const type of ["creature", "holding", "spell"] as const) {
      const definition = { ...card, type };
      expect(defaultCardAppearance(definition)).toBe("original");
      expect(hasFinish(emptyCollection(), definition, "foil")).toBe(false);
      expect(() => unlockFinish(emptyCollection(), definition, "foil")).toThrow("Own this card");
    }
  });
});
