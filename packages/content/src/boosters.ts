import type { CardDefinition } from "@realms/contracts";
import { factionDefinitions } from "./factions";

/** POC odds, independent of the number of cards in each rarity. The weights decide within a slot, the slots decide what a pack holds. */
export const boosterRules = {
  cardsPerPack: 5,
  rarityWeights: { common: 70, rare: 25, legendary: 5 },
  /** Each pack holds three commons, one slot of rare or common, and one slot of rare or legendary. Cards come out in this order, so the best one is revealed last. */
  slots: [["common"], ["common"], ["common"], ["rare", "common"], ["rare", "legendary"]],
} as const;

function roller(random: () => number) {
  return () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error("Booster randomness must be between 0 and 1.");
    return value;
  };
}

/** One card whose rarity is picked among `rarities` by weight. A rarity with no cards is skipped, and a slot with none at all falls back to every rarity. */
function drawFrom(
  cards: CardDefinition[],
  rarities: readonly (keyof typeof boosterRules.rarityWeights)[],
  roll: () => number,
) {
  const build = (list: readonly string[]) =>
    list
      .map((rarity) => ({
        weight: boosterRules.rarityWeights[rarity as keyof typeof boosterRules.rarityWeights],
        cards: cards.filter((card) => card.rarity === rarity),
      }))
      .filter((pool) => pool.cards.length);
  let pools = build(rarities);
  if (!pools.length) pools = build(Object.keys(boosterRules.rarityWeights));
  if (!pools.length) throw new Error("No cards are available for boosters.");
  let value = roll() * pools.reduce((sum, pool) => sum + pool.weight, 0);
  const pool =
    pools.find((entry) => {
      value -= entry.weight;
      return value < 0;
    }) ?? pools[pools.length - 1];
  return pool.cards[Math.floor(roll() * pool.cards.length)].id;
}

/** Draws with replacement, in reveal order: the commons first, the rare or legendary last. Inject server-owned randomness when rewards move online. */
export function drawBooster(cards: CardDefinition[], random: () => number = Math.random): string[] {
  const roll = roller(random);
  return boosterRules.slots.map((slot) => drawFrom(cards, slot, roll));
}

/** One card at the plain rarity odds, for places that are not a booster (the draft). */
export function drawCard(cards: CardDefinition[], random: () => number = Math.random): string {
  return drawFrom(cards, ["common", "rare", "legendary"], roller(random));
}

/** A booster draws from a group of factions. */
export type BoosterPack = {
  id: string;
  name: string;
  blurb: string;
  color: string;
  /** Faction whose icon stamps the pack. */ icon: string;
  factions: string[];
};
export const packIds = {
  good: "hearth-and-crown",
  neutral: "wanderers-road",
  evil: "gathering-dark",
  realms: "booster-of-the-realms",
} as const;
/** The three alignments. Boosters no longer follow them, but the quest still does: each is a quest kind with its three factions. */
const alignmentPacks: BoosterPack[] = [
  {
    id: packIds.good,
    name: "The Hearth and the Crown",
    blurb:
      "Five cards from the Bright Marches, the Northern League and the Crownlands. Legendaries are rare.",
    color: "#e3c46f",
    icon: "crownlands",
    factions: ["bright-marches", "northern-league", "crownlands"],
  },
  {
    id: packIds.neutral,
    name: "The Wanderer’s Road",
    blurb:
      "Five cards from the Mountain Clans, the Conclave and the unaligned. Legendaries are rare.",
    color: "#a9c0ad",
    icon: "neutral",
    factions: ["mountain-clans", "conclave", "neutral"],
  },
  {
    id: packIds.evil,
    name: "The Gathering Dark",
    blurb: "Five cards from the Black Host, the Ember Fields and the Horde. Legendaries are rare.",
    color: "#b0586f",
    icon: "black-host",
    factions: ["black-host", "ember-fields", "horde"],
  },
];
const known = new Set(factionDefinitions.map((faction) => faction.id));
for (const pack of alignmentPacks)
  for (const id of [pack.icon, ...pack.factions])
    if (!known.has(id)) throw new Error(`Booster '${pack.id}' references unknown faction '${id}'.`);
export const questAlignments: BoosterPack[] = alignmentPacks;
/** The one booster: five cards from every faction and the unaligned. */
export const boosterPacks: BoosterPack[] = [
  {
    id: packIds.realms,
    name: "Foundations",
    blurb:
      "Five cards from across the realms: every faction and the unaligned. Legendaries are rare.",
    color: "#e3c46f",
    icon: "crownlands",
    factions: [...new Set(alignmentPacks.flatMap((pack) => pack.factions))],
  },
];
/** The booster a pack ID stands for. IDs of retired boosters and of the quest alignments all resolve to the one booster. */
export const boosterFor = (id?: string): BoosterPack =>
  boosterPacks.find((pack) => pack.id === id) ?? boosterPacks[0]!;
/** Cards of any faction in the pool; factionless cards belong to the pool that lists neutral. */
export const packCards = (cards: CardDefinition[], pack: BoosterPack) =>
  cards.filter((card) =>
    card.factions.length
      ? card.factions.some((faction) => pack.factions.includes(faction))
      : pack.factions.includes("neutral"),
  );
