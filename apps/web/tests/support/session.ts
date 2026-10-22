import { startMatch as start } from "../../src/features/match/lib/session";
import { registry, starterDecks } from "@realms/testing/content";
import type { CustomDeck } from "../../src/features/decks/lib/decks";
export type { MatchSetup } from "../../src/features/match/lib/session";
const content = {
  registry,
  starters: [
    { id: "verdant", name: "The Verdant Pact", cards: starterDecks.verdant },
    { id: "hollow", name: "The Hollow Court", cards: starterDecks.hollow },
  ],
};
export const startMatch = (seed: number, deck = "verdant", skirmish = false, custom?: CustomDeck) =>
  start(seed, deck, skirmish, custom, content);
