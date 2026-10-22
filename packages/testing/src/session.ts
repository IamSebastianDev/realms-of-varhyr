import { startMatch as start } from "../../../apps/web/src/session";
import { registry, starterDecks } from "./content";
import type { CustomDeck } from "../../../apps/web/src/decks";
export type { MatchSetup } from "../../../apps/web/src/session";
const content = {
  registry,
  starters: [
    { id: "verdant", name: "The Verdant Pact", cards: starterDecks.verdant },
    { id: "hollow", name: "The Hollow Court", cards: starterDecks.hollow },
  ],
};
export const startMatch = (seed: number, deck = "verdant", skirmish = false, custom?: CustomDeck) =>
  start(seed, deck, skirmish, custom, content);
