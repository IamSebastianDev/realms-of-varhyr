// A synthetic card pool for tests of the draft and the rooms around it.
// It has the real faction ids but none of the real cards, so editing or renaming the game's cards never breaks these tests.
// Changing the draft rules (roster size, producers, deck size) is what should change their results.
import { compileContent as compile } from "@realms/content/compiler";
import { factions } from "@realms/content/factions";
import { abilities } from "@realms/extensions";

type Rarity = "common" | "rare" | "legendary";
const card = (
  id: string,
  factionList: string[],
  rarity: Rarity,
  stats: { attack: number; defense: number },
  cost: { generic: number; factions: Record<string, number> },
  produces?: Record<string, number>,
) => ({
  id,
  revision: 1,
  name: id,
  deckLimitKey: id,
  type: "creature",
  factions: factionList,
  subtypes: ["creature"],
  legendary: rarity === "legendary",
  rarity,
  cost,
  text: `Synthetic card ${id}.`,
  art: `/cards/${id}/data.png?v=0000000000000000`,
  abilities: [],
  stats: { ...stats, ...(produces ? { energyOutputs: [produces] } : {}) },
});

/** Enough cards to be drafted: a full roster, free producers, a legendary, and a mix of costs and rarities. */
const roster = (faction: string) => [
  ...[1, 2, 3].map((n) =>
    card(
      `${faction}-producer-${n}`,
      [faction],
      "common",
      { attack: 1, defense: 1 },
      { generic: 0, factions: {} },
      {
        [faction]: 1,
      },
    ),
  ),
  ...[1, 2, 3, 4, 5, 6].map((n) =>
    card(
      `${faction}-common-${n}`,
      [faction],
      "common",
      { attack: 1 + (n % 3), defense: 1 + (n % 2) },
      {
        generic: n % 3,
        factions: { [faction]: 1 },
      },
    ),
  ),
  ...[1, 2, 3].map((n) =>
    card(
      `${faction}-rare-${n}`,
      [faction],
      "rare",
      { attack: 2 + n, defense: 2 },
      {
        generic: n,
        factions: { [faction]: 1 },
      },
    ),
  ),
  card(
    `${faction}-legend`,
    [faction],
    "legendary",
    { attack: 5, defense: 5 },
    {
      generic: 2,
      factions: { [faction]: 2 },
    },
  ),
];
const hybrid = (a: string, b: string) =>
  card(
    `${a}-${b}-hybrid`,
    [a, b],
    "rare",
    { attack: 3, defense: 3 },
    {
      generic: 0,
      factions: { [a]: 1, [b]: 1 },
    },
  );
const neutral = (n: number) =>
  card(`neutral-${n}`, [], "common", { attack: 1 + n, defense: 2 }, { generic: n, factions: {} });

/** Drafting needs four factions with a roster; this is the one with too little to draft. */
export const draftFactions = [
  "bright-marches",
  "crownlands",
  "black-host",
  "ember-fields",
] as const;
export const undraftableFaction = "winter-league";
export const draftCards = [
  ...draftFactions.flatMap(roster),
  hybrid("bright-marches", "crownlands"),
  hybrid("black-host", "ember-fields"),
  ...[0, 1, 2].map(neutral),
  ...[1, 2].map((n) =>
    card(
      `${undraftableFaction}-${n}`,
      [undraftableFaction],
      "common",
      { attack: 1, defense: 1 },
      {
        generic: 0,
        factions: { [undraftableFaction]: 1 },
      },
    ),
  ),
];
export const draftRegistry = compile(draftCards, abilities, "draft-fixture", factions);
