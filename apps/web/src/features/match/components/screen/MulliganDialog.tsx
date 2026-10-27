import { rectOf } from "@realms/ui/stage";
import { ArrowRight } from "lucide-react";
import { ArtCard } from "@realms/ui/CardPresentation";
import { PeekBackdrop } from "../Peek";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function MulliganDialog() {
  const {
    clearHoverPreview,
    covered,
    live,
    mulliganPick,
    online,
    pinPreview,
    reduced,
    requestPreview,
    send,
    setMulliganPick,
    thinking,
    view,
    watching,
  } = useMatch();
  return (
    <>
      {!watching && view.pending?.kind === "mulligan" && !covered && !thinking && (
        <PeekBackdrop back={msg("Back to your hand")}>
          <div className="choice-dialog mulligan-dialog">
            <h2>
              {msg("Replace up to")} {view.pending.max} {msg("cards")}
            </h2>
            <div className="choice-options mulligan-options">
              {view.pending.options.map((id) => {
                const picked = mulliganPick.includes(id),
                  full = !picked && mulliganPick.length >= (view.pending as { max: number }).max;
                return (
                  <div
                    key={id}
                    className={`mulligan-card ${picked ? "picked" : ""} ${full ? "locked" : ""}`}
                  >
                    <ArtCard
                      detail={false}
                      reduced={reduced}
                      card={registry.cards[view.cards[id].definitionId]}
                      interaction={{
                        id: `mull-${id}`,
                        onPointerEnter: (e) => {
                          if (e.pointerType !== "touch")
                            requestPreview(id, rectOf(e.currentTarget));
                        },
                        onPointerLeave: clearHoverPreview,
                        onFocus: (e) => requestPreview(id, rectOf(e.currentTarget)),
                        onBlur: clearHoverPreview,
                        onContextMenu: (e) => {
                          e.preventDefault();
                          pinPreview(id, rectOf(e.currentTarget));
                        },
                      }}
                      onClick={() =>
                        setMulliganPick((list) =>
                          picked ? list.filter((x) => x !== id) : full ? list : [...list, id],
                        )
                      }
                    />
                    <span className="mulligan-mark">{picked ? msg("Replace") : msg("Keep")}</span>
                  </div>
                );
              })}
            </div>
            <button
              className="gold-button mulligan-confirm"
              disabled={!!online && !live}
              onClick={() => {
                const cardIds = mulliganPick;
                setMulliganPick([]);
                send({ type: "mulligan", cardIds });
              }}
            >
              {mulliganPick.length
                ? msg("Replace {v0} {v1}", {
                    v0: mulliganPick.length,
                    v1: mulliganPick.length === 1 ? "card" : "cards",
                  })
                : msg("Keep this hand")}
              <ArrowRight size={14} />
            </button>
          </div>
        </PeekBackdrop>
      )}
    </>
  );
}
