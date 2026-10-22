import type { MutableRefObject } from "react";
import type { CardDefinition } from "@realms/contracts";
import type { OwnedCopies } from "../../collection/lib/collection";
import type { CustomDeck } from "./decks";

/** What the deck builder screen needs from the page that hosts it. */
export type DeckBuilderProps = {
  draft: CustomDeck;
  decks: CustomDeck[];
  ownedCopies: OwnedCopies;
  crowns: number;
  message: string;
  canUndo: boolean;
  reduced: boolean;
  change: (deck: CustomDeck) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  load: (id: string) => void;
  renameDeck: (id: string, name: string) => string | null;
  deleteSaved: (id: string) => string | null;
  removeDeck: () => void;
  save: () => boolean;
  undo: () => void;
  buyMissing: () => void;
  inspect: (card: CardDefinition) => void;
  openCollection: () => void;
  /** The lobby asks this before leaving the builder; it returns true when it is holding the move for an unsaved-changes prompt. */
  guardRef?: MutableRefObject<((proceed: () => void) => boolean) | null>;
};

/** One row of the deck list: a card, how many copies the deck holds, and whether the player owns that many. */
export type DeckEntry = { card: CardDefinition; count: number; unowned: boolean };
