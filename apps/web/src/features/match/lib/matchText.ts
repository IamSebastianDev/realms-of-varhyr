import type { PlayerId, PlayerView } from "@realms/contracts";
import { t as msg } from "@realms/ui/i18n";

/** What the match screen says in words, as pure functions of the situation: easy to read and to test. */
export type MatchSituation = {
  view: PlayerView;
  viewer: PlayerId;
  watching: boolean;
  online: boolean;
  /** The viewer may act right now. */
  live: boolean;
  thinking: boolean;
  botGate: { type: string } | null;
  connection?: { connected?: boolean; busy?: boolean; message?: string } | null;
  stage: "none" | "mode" | "consume" | "position" | "target";
  selectedActivation?: { slots?: number[] };
  /** The card being played returns a friendly creature to the hand as its cost instead of sacrificing it. */
  returns?: boolean;
  undoable: string[];
  attackers: string[];
};

/** The sentence under the board telling the player what to do next. */
export function turnPrompt({
  view,
  watching,
  online,
  live,
  thinking,
  botGate,
  connection,
  stage,
  selectedActivation,
  returns,
  undoable,
  attackers,
}: MatchSituation): string | undefined {
  const responseStep = view.combat?.stage === "response" || !!view.responseStep;
  return watching
    ? msg("Watching a recorded match.")
    : online && !live
      ? connection?.connected
        ? connection?.busy
          ? msg("Sending your move…")
          : msg("Opponent’s turn…")
        : connection?.message
      : thinking
        ? botGate
          ? botGate.type === "confirm-combat"
            ? msg("The opponent’s attack is set. Review the arrows, then resolve combat.")
            : view.phase === "play"
              ? msg("The opponent is ready to attack.")
              : msg("The opponent is done. Begin your turn.")
          : view.combat?.stage === "review"
            ? msg("Lanes are set. The opponent is reviewing the attack…")
            : msg("Opponent’s turn…")
        : view.pending?.kind === "damage-target"
          ? msg("{v0}: choose a highlighted target to take {v1} damage.", {
              v0: msg(view.pending.sourceName),
              v1: view.pending.amount,
            })
          : stage === "mode"
            ? msg("Choose one effect.")
            : stage === "consume"
              ? returns
                ? msg("Choose a friendly creature to return to your hand.")
                : msg("Choose a friendly creature to Consume.")
              : stage === "position"
                ? msg("Choose a highlighted position. Deployment is permanent.")
                : stage === "target"
                  ? selectedActivation?.slots
                    ? msg("Choose a creature or holding from your hand to rally.")
                    : msg("Choose a highlighted target.")
                  : responseStep
                    ? msg("The fallen leave energy behind. Cast a spell or close the window.")
                    : view.phase === "draw"
                      ? msg("Draw two. Keep one.")
                      : view.phase === "play"
                        ? undoable.length
                          ? msg("Click a channelled creature to undo. Drag a card to play.")
                          : msg("Click a ready field card for actions. Drag a card to play.")
                        : view.combat?.stage === "declare"
                          ? attackers.length
                            ? msg(
                                "Gold arrows hit the player; cyan arrows meet a blocker. Drag an attacker to another lane to change it.",
                              )
                            : msg(
                                "Drag a ready creature onto a highlighted lane, or click it to choose one.",
                              )
                          : view.combat?.stage === "review"
                            ? msg(
                                "Defenders in the targeted lanes block automatically. Review the arrows, then confirm combat.",
                              )
                            : responseStep
                              ? msg(
                                  "The fallen leave energy behind. Cast a spell or close the window.",
                                )
                              : msg("End your turn to ready your field cards.");
}

/** The label of the big phase button. */
export function phaseButtonLabel({
  view,
  watching,
  online,
  live,
  thinking,
  botGate,
  connection,
  attackers,
}: MatchSituation): string {
  const responseStep = view.combat?.stage === "response" || !!view.responseStep;
  return watching
    ? msg("Replay")
    : online && !live
      ? connection?.connected
        ? connection?.busy
          ? msg("Sending…")
          : msg("Opponent’s turn")
        : msg("Disconnected")
      : thinking && botGate
        ? botGate.type === "confirm-combat"
          ? msg("Resolve combat")
          : view.phase === "play"
            ? msg("Enemy combat")
            : msg("Your turn")
        : responseStep
          ? msg("Close response step")
          : view.phase === "play"
            ? msg("Enter combat")
            : view.combat?.stage === "declare"
              ? attackers.length
                ? msg("Attack with {v0}", { v0: attackers.length })
                : msg("Skip combat")
              : view.combat?.stage === "review"
                ? msg("Confirm combat")
                : responseStep
                  ? msg("Close response step")
                  : msg("End turn");
}

/** The short phase name in the top bar. */
export function phaseStatusLabel({ view, viewer, online, thinking }: MatchSituation): string {
  const responseStep = view.combat?.stage === "response" || !!view.responseStep,
    actor = view.legal.actor;
  return online && actor !== viewer
    ? msg("Opponent’s turn")
    : thinking
      ? msg("Opponent’s turn")
      : view.combat?.stage === "review"
        ? msg("Review combat")
        : responseStep
          ? msg("Response energy")
          : view.phase === "play"
            ? msg("Play & channel")
            : view.phase === "attack"
              ? msg("Select attackers")
              : view.phase === "draw"
                ? msg("Choose a card")
                : msg("End turn");
}

/** The built-in names of the two seats are translated; a chosen name is shown as it is. */
export const playerName = (name: string) =>
  name === "You" || name === "Sparring partner" ? msg(name) : name;
