import { ArtCard } from "@realms/ui/CardPresentation";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function HandZone() {
  const {
    clearHoverPreview,
    drag,
    dragEnabled,
    live,
    pinPreview,
    quickPlay,
    reduced,
    requestPreview,
    selected,
    sendTarget,
    setDraft,
    setStage,
    stage,
    startDrag,
    suppressClick,
    targets,
    view,
  } = useMatch();
  return (
    <>
      <section className="hand-zone">
        {stage !== "none" && (
          <div className="hand-caption">
            <p>
              {stage === "consume"
                ? msg("Choose what to Consume")
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
              className={`hand-card ${targets.includes(id) ? "rally-target" : ""} ${drag?.cardId === id ? "drag-source" : ""} ${dragEnabled && view.legal.playable.some((a) => a.cardId === id) ? "draggable" : ""}`}
              interaction={{
                id: `hand-${id}`,
                style: { ["--fan" as string]: i - (view.hand.length - 1) / 2 },
                onContextMenu: (e) => {
                  e.preventDefault();
                  pinPreview(id, e.currentTarget.getBoundingClientRect());
                },
                onPointerDown: (e) => startDrag(id, e),
                onDoubleClick: () => quickPlay(id),
                onPointerEnter: (e) => {
                  if (e.pointerType !== "touch" && !drag)
                    requestPreview(id, e.currentTarget.getBoundingClientRect());
                },
                onPointerLeave: clearHoverPreview,
                onFocus: (e) => requestPreview(id, e.currentTarget.getBoundingClientRect()),
                onBlur: clearHoverPreview,
              }}
              onClick={() => {
                if (!live || suppressClick()) return;
                if (stage === "target" && targets.includes(id)) {
                  sendTarget(id);
                  return;
                }
                if (stage !== "none") return;
                pinPreview(id, document.getElementById(`hand-${id}`)!.getBoundingClientRect());
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
