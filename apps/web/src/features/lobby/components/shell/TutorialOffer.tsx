import { GraduationCap } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";

import { useLobbyContext } from "../../LobbyContext.tsx";

export function TutorialOffer() {
  const { offer, props, settleOffer } = useLobbyContext();
  return (
    <>
      {offer && (
        <div className="modal-backdrop" onClick={() => settleOffer("skipped")}>
          <section
            className="choice-dialog tutorial-offer"
            role="dialog"
            aria-modal="true"
            aria-label={msg("Learn to play")}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{msg("New to Varhyr?")}</h2>
            <div className="tutorial-offer-actions">
              <button
                className="gold-button"
                autoFocus
                onClick={() => {
                  settleOffer("started");
                  props.learn();
                }}
              >
                <GraduationCap size={17} />
                {msg("Start the tutorial")}
              </button>
              <button className="outline-button" onClick={() => settleOffer("skipped")}>
                {msg("I’ll figure it out")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
