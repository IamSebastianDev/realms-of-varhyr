import { Eye } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import { playerName } from "../../lib/matchText";

import { useMatch } from "../../MatchContext";

export function PrivacyCover() {
  const { actor, covered, setCovered, setHovered, setSelected, setViewer, state } = useMatch();
  return (
    <>
      {covered && (
        <div className="modal-backdrop privacy">
          <div className="privacy-card">
            <span className="brand-mark">V</span>
            <h2>{playerName(state.players[actor].name)}</h2>
            {state.combat?.stage === "review" ? (
              <p>{msg("Review the lanes and blockers, then confirm combat.")}</p>
            ) : state.combat?.stage === "response" ? (
              <p>{msg("Spend your fallen creatures’ energy.")}</p>
            ) : null}
            <button
              className="gold-button"
              onClick={() => {
                setViewer(actor);
                setCovered(false);
                setSelected(null);
                setHovered(null);
              }}
            >
              {msg("Reveal my hand")}
              <Eye size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
