import type { CardDefinition } from '../../contracts/src';

/** What the quest needs to know about the game's cards and factions; the app passes the real content in. */
export type QuestContent = {
  cards: Record<string, CardDefinition>;
  /** The booster alignments: each is also a quest kind with its three factions. */
  packs: { id: string; name: string; factions: string[] }[];
  /** Faction display names, for boss titles. */
  factionNames?: Record<string, string>;
};
