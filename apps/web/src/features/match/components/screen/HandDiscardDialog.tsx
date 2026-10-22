import { ArtCard } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function HandDiscardDialog() {
  const { covered, reduced, send, thinking, view, watching } = useMatch();
  return (
    <>
      {!watching && view.pending?.kind === "hand-discard" && !covered && !thinking && (
        <PeekBackdrop back={msg("Back to the choice")}>
          <div className="choice-dialog mulligan-dialog">
            <h2>
              {msg(view.pending.sourceName)}
              {msg(": choose a card to discard")}
            </h2>
            <div className="choice-options mulligan-options">
              {view.pending.options.map((id) => (
                <div key={id}>
                  <ArtCard
                    detail={false}
                    reduced={reduced}
                    card={registry.cards[view.cards[id].definitionId]}
                    onClick={() => send({ type: "choose", choiceId: view.pending!.id, option: id })}
                  />
                </div>
              ))}
            </div>
          </div>
        </PeekBackdrop>
      )}
    </>
  );
}
