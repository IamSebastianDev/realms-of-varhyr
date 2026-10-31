import type { CardDefinition } from "@realms/contracts";

/** Supplemental characters are earned through adventures rather than bought or opened in boosters. */
export const isAdventureExclusive = (card: CardDefinition) => card.set === "faces-of-the-realm";
