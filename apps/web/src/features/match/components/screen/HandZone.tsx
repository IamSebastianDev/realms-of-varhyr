import { rectOf } from "@realms/ui/stage";
import { ArtCard } from "@realms/ui/CardPresentation";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";
import { KEEP_FLIGHT, useArrivingCards } from "../../lib/drawFx";

export function HandZone() {
  const {
    clearHoverPreview,
    drag,
    dragEnabled,
    live,
    pinPreview,
    quickBegin,
    quickPlay,
    reduced,
    requestPreview,
    selected,
    selectedLegal,
    sendTarget,
    setDraft,
    setStage,
    stage,
    startDrag,
    suppressClick,
    targets,
    view,
  } = useMatch();
  const arriving = useArrivingCards();
  return (
    <>
      <section className="hand-zone">
        {stage === "none" && live && view.freeCast && (
          <div className="hand-caption">
            <p>
              {msg("Cast {v0} for free", {
                v0: msg(registry.cards[view.cards[view.freeCast.cardId].definitionId].name),
              })}
            </p>
            <button className="outline-button" onClick={() => quickBegin(view.freeCast!.cardId)}>
              {msg("Cast")}
            </button>
          </div>
        )}
        {stage !== "none" && (
          <div className="hand-caption">
            <p>
              {stage === "mode"
                ? msg("Choose the effect")
                : stage === "consume"
                  ? selectedLegal?.returns
                    ? msg("Choose what to return")
                    : msg("Choose what to Consume")
                  : stage === "position"
                    ? msg("Choose your position")
                    : msg("Choose your target")}
            </p>
          </div>
        )}
        <div className="hand-scroll" style={{ ["--n" as string]: view.hand.length }}>
          {view.hand.map((id, i) => (
            <ArtCard
              detail={false}
              reduced={reduced}
              key={id}
              card={registry.cards[view.cards[id].definitionId]}
              selected={selected === id}
              disabled={!targets.includes(id) && !view.legal.playable.some((a) => a.cardId === id)}
              className={`hand-card ${arriving[id] ? `draw-in ${arriving[id].mode}` : ""} ${targets.includes(id) ? "rally-target" : ""} ${drag?.cardId === id ? "drag-source" : ""} ${dragEnabled && view.legal.playable.some((a) => a.cardId === id) ? "draggable" : ""}`}
              interaction={{
                id: `hand-${id}`,
                style: {
                  ["--fan" as string]: i - (view.hand.length - 1) / 2,
                  ["--draw-delay" as string]: `${(arriving[id]?.delay ?? 0) + (arriving[id]?.mode === "fade" ? KEEP_FLIGHT * 0.8 : 480)}ms`,
                },
                onContextMenu: (e) => {
                  e.preventDefault();
                  pinPreview(id, rectOf(e.currentTarget));
                },
                onPointerDown: (e) => startDrag(id, e),
                onDoubleClick: () => quickPlay(id),
                onPointerEnter: (e) => {
                  if (e.pointerType !== "touch" && !drag)
                    requestPreview(id, rectOf(e.currentTarget));
                },
                onPointerLeave: clearHoverPreview,
                onFocus: (e) => requestPreview(id, rectOf(e.currentTarget)),
                onBlur: clearHoverPreview,
              }}
              onClick={() => {
                if (!live || suppressClick()) return;
                if (stage === "target" && targets.includes(id)) {
                  sendTarget(id);
                  return;
                }
                if (stage !== "none") return;
                pinPreview(id, rectOf(document.getElementById(`hand-${id}`)!));
                setDraft(null);
                setStage("none");
              }}
            />
          ))}
          {!view.hand.length && <div className="empty-hand">{msg("No cards in hand")}</div>}
        </div>
      </section>
    </>
  );
}
