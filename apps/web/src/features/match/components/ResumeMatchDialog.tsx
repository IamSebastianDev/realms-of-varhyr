import { Play } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import type { GameState } from "@realms/contracts";

/** Shown over the lobby when the browser reloaded in the middle of a match. There is no way to dismiss it without choosing:
 * the match is either carried on or counted as a loss. */
export function ResumeMatchDialog({
  state,
  hotseat,
  onContinue,
  onConcede,
}: {
  state: GameState;
  hotseat: boolean;
  onContinue: () => void;
  onConcede: () => void;
}) {
  const { p1, p2 } = state.players;
  return (
    <div className="modal-backdrop">
      <section
        className="choice-dialog resume-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="resume-title"
      >
        <h2 id="resume-title">{msg("Match in progress")}</h2>
        <p className="resume-position">
          <span>{hotseat ? `${p1.name} · ${p2.name}` : p2.name}</span>
          <span>
            {msg("Turn")} {state.turn}
          </span>
          <span>
            {p1.life} : {p2.life}
          </span>
        </p>
        <div className="resume-actions">
          <button className="gold-button" autoFocus onClick={onContinue}>
            <Play size={17} />
            {msg("Continue")}
          </button>
          <button className="outline-button danger" onClick={onConcede}>
            {msg("Concede")}
          </button>
        </div>
      </section>
    </div>
  );
}
