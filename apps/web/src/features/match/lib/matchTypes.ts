import type { MatchSession } from "../session/MatchSession";
import type { TutorialScript } from "./localMatch";
import type { PlayDraft } from "./cardInteraction";
import type { MatchSetup } from "./session";

export type Mode = "practice" | "hotseat";

/** A card play being assembled: the card, then optionally a slot, a consumed card, a target or an activation. */
export type Draft = PlayDraft & { activation?: number; target?: string };

/** Where a card preview should appear: the screen rectangle of the card it explains. */
export type PreviewRequest = {
  pinned?: boolean;
  cardId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type LiveMatch = { match: MatchSession; setup?: MatchSetup; script?: TutorialScript };

export type MatchScreenProps = {
  match: MatchSession;
  setup?: MatchSetup;
  script?: TutorialScript;
  leave: () => void;
  onBegin: (setup: MatchSetup) => void;
  onAttach: (session: MatchSession, setup?: MatchSetup) => void;
};
