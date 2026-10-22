import { ArrowRight } from "lucide-react";
import { Energy } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function ResponseEnergyDialog() {
  const { covered, send, thinking, view } = useMatch();
  return (
    <>
      {view.pending && view.pending.kind === "response-energy" && !covered && !thinking && (
        <PeekBackdrop back={msg("Back to the choice")}>
          <div className="choice-dialog">
            <h2>
              {msg(view.pending.sourceName)}
              {msg(": choose its energy")}
            </h2>
            <div className="choice-options">
              {view.pending.options.map((pool, i) => (
                <button
                  className="energy-choice"
                  key={i}
                  onClick={() => send({ type: "choose", choiceId: view.pending!.id, option: i })}
                >
                  <Energy pool={pool} />
                  <span>
                    {msg("Choose this output")}
                    <ArrowRight size={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </PeekBackdrop>
      )}
    </>
  );
}
