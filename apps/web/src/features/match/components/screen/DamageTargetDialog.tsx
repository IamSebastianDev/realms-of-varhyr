import { ArtCard } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

/** A triggered ability that deals damage asks what to hit: an enemy creature or holding, or the enemy player. */
export function DamageTargetDialog() {
  const { covered, reduced, send, thinking, view, watching } = useMatch();
  const pending = view.pending;
  if (watching || pending?.kind !== "damage-target" || covered || thinking) return null;
  return (
    <PeekBackdrop back={msg("Back to the choice")}>
      <div className="choice-dialog mulligan-dialog">
        <h2>
          {msg(pending.sourceName)}
          {msg(": deal {v0} damage to a target", { v0: pending.amount })}
        </h2>
        <div className="choice-options mulligan-options">
          {pending.options.map((id) =>
            view.cards[id] ? (
              <div key={id}>
                <ArtCard
                  detail={false}
                  reduced={reduced}
                  card={registry.cards[view.cards[id].definitionId]}
                  onClick={() => send({ type: "choose", choiceId: pending.id, option: id })}
                />
              </div>
            ) : (
              <div key={id}>
                <button
                  className="outline-button"
                  onClick={() => send({ type: "choose", choiceId: pending.id, option: id })}
                >
                  {view.players[id as "p1" | "p2"].name}
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    </PeekBackdrop>
  );
}
