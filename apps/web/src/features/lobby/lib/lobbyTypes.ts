import type { CustomDeck } from "../../decks/lib/decks";
import type { MatchSession } from "../../match/session/MatchSession";
import type { MatchSetup } from "../../match/lib/session";
import type { Mode } from "../../match/lib/matchTypes";

/** Every page the menu shell can show; "match" means the match itself. */
export type Screen =
  | "menu"
  | "cards"
  | "builder"
  | "stats"
  | "store"
  | "packs"
  | "profile"
  | "settings"
  | "multiplayer"
  | "quest"
  | "draft"
  | "match";

export type LobbyProps = {
  reduced: boolean;
  screen: Exclude<Screen, "match">;
  navigate: (screen: Screen) => void;
  canResume: boolean;
  resumeLabel: string;
  decks: CustomDeck[];
  options: { id: string; name: string; cards: string[] }[];
  saveDeck: (deck: CustomDeck) => string | null;
  deleteDeck: (id: string) => string | null;
  mode: Mode;
  setMode: (mode: Mode) => void;
  selected: string;
  setSelected: (id: string) => void;
  opponentId: string;
  setOpponentId: (id: string) => void;
  start: (skirmish: boolean) => void;
  startSession: (session: MatchSession, setup?: MatchSetup) => void;
  /** Starts the guided first match. */
  learn: () => void;
  /** Starts a prepared match (quest fights). */
  beginMatch: (setup: MatchSetup) => void;
  /** A quest fight is open in the background and can be returned to. */
  questFight: boolean;
  /** A draft match is open in the background and can be returned to. */
  draftFight?: boolean;
};
