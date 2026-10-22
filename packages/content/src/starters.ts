import { factionDefinitions } from "./factions";

/** Starter deck IDs must be stable; names and card counts are edited in the faction's JSON file. */
export type StarterDeck = { id: string; name: string; cards: string[] };

/** Starter decks come from each faction's optional `starter` entry in assets/factions/<id>.json. */
export const starterDefinitions: StarterDeck[] = factionDefinitions.flatMap((faction) =>
  faction.starter
    ? [
        {
          id: faction.starter.id,
          name: faction.starter.name,
          cards: Object.entries(faction.starter.cards).flatMap(([card, copies]) =>
            Array<string>(copies).fill(card),
          ),
        },
      ]
    : [],
);

/** The faction that sets `"default": true`, otherwise the first starter deck. */
export const defaultDeckId: string =
  factionDefinitions.find((faction) => faction.starter?.default)?.starter?.id ??
  starterDefinitions[0]?.id ??
  "";
export const starterDecks: Record<string, string[]> = Object.fromEntries(
  starterDefinitions.map((deck) => [deck.id, deck.cards]),
);
