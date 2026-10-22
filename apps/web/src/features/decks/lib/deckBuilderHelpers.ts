import { t as msg } from "@realms/ui/i18n";
import type { CustomDeck } from "./decks";

export const newDeck = (): CustomDeck => ({
  id: `custom-${crypto.randomUUID()}`,
  name: msg("New deck"),
  cards: [],
});
export const groups = [
  { type: "creature", name: "Creatures" },
  { type: "holding", name: "Holdings" },
  { type: "spell", name: "Spells" },
] as const;
export const signature = (deck: CustomDeck) =>
  JSON.stringify([deck.name, [...deck.cards].sort(), deck.back ?? "", deck.showcase ?? []]);
