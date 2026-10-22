import type { GameState, Registry } from "@realms/contracts";

export type Arena = { id: string; faction?: string; art: string };

/** A quiet common ground for matches whose decks contain only neutral cards. */
export const fallbackArena: Arena = { id: "open-field", art: "/art/arena-open-field.png" };

/**
 * The arena is presentation only. New factions can add a landscape here without
 * touching game rules, cards, or networking.
 */
export const factionArenas: Record<string, Arena> = {
  "black-host": { id: "black-host", faction: "black-host", art: "/art/arenas/black-host.png" },
  "bright-marches": {
    id: "bright-marches",
    faction: "bright-marches",
    art: "/art/arenas/bright-marches.png",
  },
  conclave: { id: "conclave", faction: "conclave", art: "/art/arenas/conclave.png" },
  crownlands: { id: "crownlands", faction: "crownlands", art: "/art/arenas/crownlands.png" },
  "ember-fields": {
    id: "ember-fields",
    faction: "ember-fields",
    art: "/art/arenas/ember-fields.png",
  },
  horde: { id: "horde", faction: "horde", art: "/art/arenas/horde.png" },
  "mountain-clans": {
    id: "mountain-clans",
    faction: "mountain-clans",
    art: "/art/arenas/mountain-clans.png",
  },
  "winter-league": {
    id: "winter-league",
    faction: "winter-league",
    art: "/art/arenas/winter-league.png",
  },
};

/**
 * Select a realm represented by the decks in this match. A shared match seed
 * keeps the choice stable for both players, replays, and reconnects, while a
 * multi-faction match can still feel different from game to game.
 */
export function arenaForMatch(
  initial: Pick<GameState, "cards" | "seed">,
  registry: Registry,
): Arena {
  const represented = Object.values(initial.cards).flatMap((card) => {
    const factions = registry.cards[card.definitionId]?.factions ?? [];
    return factions.filter((faction) => faction in factionArenas);
  });
  if (!represented.length) return fallbackArena;
  return factionArenas[represented[(initial.seed >>> 0) % represented.length]] ?? fallbackArena;
}
