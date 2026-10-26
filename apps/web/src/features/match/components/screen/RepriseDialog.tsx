import { ArtCard } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

/** Reprise: pick a spell in your discard pile. It is then cast for free through the usual casting flow. */
export function RepriseDialog() {
  const { covered, reduced, send, thinking, view, watching } = useMatch();
  const pending = view.pending;
  if (watching || pending?.kind !== "reprise" || covered || thinking) return null;
  return (
    <PeekBackdrop back={msg("Back to the choice")}>
      <div className="choice-dialog mulligan-dialog">
        <h2>
          {msg(pending.sourceName)}
          {msg(": cast a spell from your discard pile for free")}
        </h2>
        <div className="choice-options mulligan-options">
          {pending.options.map((id) => (
            <div key={id}>
              <ArtCard
                detail={false}
                reduced={reduced}
                card={registry.cards[view.cards[id].definitionId]}
                onClick={() => send({ type: "choose", choiceId: pending.id, option: id })}
              />
            </div>
          ))}
        </div>
      </div>
    </PeekBackdrop>
  );
}
