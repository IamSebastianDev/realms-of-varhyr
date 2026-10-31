import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ArtCard } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

/** Search results: the chosen card goes to the hand. A multiple search picks a set, then Apply. */
export function LibraryPickDialog() {
  const { covered, reduced, send, thinking, view, watching } = useMatch();
  const pending = view.pending;
  if (watching || pending?.kind !== "library-pick" || covered || thinking) return null;
  return (
    <PeekBackdrop back={msg("Back to the choice")}>
      <div className="choice-dialog mulligan-dialog">
        <h2>
          {msg(pending.sourceName)}
          {msg(": choose a card from your library")}
        </h2>
        {pending.limit ? (
          <MultiPick key={pending.id} />
        ) : (
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
        )}
      </div>
    </PeekBackdrop>
  );
}

function energyOf(definitionId: string) {
  const cost = registry.cards[definitionId].cost;
  return cost.generic + Object.values(cost.factions).reduce((sum, n) => sum + n, 0);
}

function MultiPick() {
  const { live, online, reduced, send, view } = useMatch();
  const pending = view.pending as Extract<
    NonNullable<typeof view.pending>,
    { kind: "library-pick" }
  >;
  const limit = pending.limit!;
  const [picked, setPicked] = useState<string[]>([]);
  const spent = picked.reduce((sum, id) => sum + energyOf(view.cards[id].definitionId), 0);
  const left = limit.budget - spent;
  return (
    <>
      <p>
        {msg("Up to {v0} creatures, {v1} energy in total", { v0: limit.picks, v1: limit.budget })}
        {" · "}
        {msg("{v0} picked, {v1} energy left", { v0: picked.length, v1: left })}
      </p>
      <div className="choice-options mulligan-options">
        {pending.options.map((id) => {
          const on = picked.includes(id),
            locked =
              !on && (picked.length >= limit.picks || energyOf(view.cards[id].definitionId) > left);
          return (
            <div
              key={id}
              className={`mulligan-card ${on ? "picked" : ""} ${locked ? "locked" : ""}`}
            >
              <ArtCard
                detail={false}
                reduced={reduced}
                card={registry.cards[view.cards[id].definitionId]}
                onClick={() =>
                  setPicked((list) =>
                    on ? list.filter((x) => x !== id) : locked ? list : [...list, id],
                  )
                }
              />
              <span className="mulligan-mark">{on ? msg("Take") : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="builder-dialog-actions">
        <button
          className="outline-button"
          disabled={!!online && !live}
          onClick={() => send({ type: "choose", choiceId: pending.id, option: "stop" })}
        >
          {msg("Cancel")}
        </button>
        <button
          className="gold-button mulligan-confirm"
          disabled={(!!online && !live) || !picked.length}
          onClick={() =>
            send({ type: "choose", choiceId: pending.id, option: "apply", picks: picked })
          }
        >
          {msg("Apply")}
          <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}
