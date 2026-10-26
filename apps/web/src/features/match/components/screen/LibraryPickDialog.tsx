import { ArtCard } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

/** Search results: one entry per distinct card in the library; the chosen card goes to the hand. */
export function LibraryPickDialog() {
  const { covered, reduced, send, thinking, view, watching } = useMatch();
  return (
    <>
      {!watching && view.pending?.kind === "library-pick" && !covered && !thinking && (
        <PeekBackdrop back={msg("Back to the choice")}>
          <div className="choice-dialog mulligan-dialog">
            <h2>
              {msg(view.pending.sourceName)}
              {msg(": choose a card from your library")}
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
