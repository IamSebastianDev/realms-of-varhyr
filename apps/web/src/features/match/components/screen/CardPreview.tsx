import { CardDetail } from "@realms/ui/CardDetail";
import { X } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import { positionName } from "@realms/contracts";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function CardPreview() {
  const {
    actionCard,
    closePreview,
    covered,
    drag,
    panel,
    preview,
    previewCard,
    previewDef,
    previewHeight,
    previewRef,
    previewStats,
    previewWidth,
    previewX,
    previewY,
    reduced,
    state,
    view,
  } = useMatch();
  return (
    <>
      {preview &&
        previewCard &&
        previewDef &&
        !actionCard &&
        !drag &&
        !panel &&
        !covered &&
        (!view.pending || view.pending.kind === "mulligan") &&
        !state.outcome && (
          <div
            className="preview-anchor"
            aria-hidden
            style={{
              left: preview.left,
              top: preview.top,
              width: preview.right - preview.left,
              height: preview.bottom - preview.top,
            }}
          />
        )}
      {preview &&
        previewCard &&
        previewDef &&
        !actionCard &&
        !drag &&
        !panel &&
        !covered &&
        (!view.pending || view.pending.kind === "mulligan") &&
        !state.outcome && (
          <aside
            ref={previewRef}
            className={`hover-preview ${preview.pinned ? "pinned-preview" : ""}`}
            role={preview.pinned ? "dialog" : "tooltip"}
            aria-label={msg("{v0} preview", { v0: previewDef.name })}
            style={{
              ["--px" as string]: `${previewX}px`,
              ["--py" as string]: `${previewY}px`,
              width: previewWidth,
              maxHeight: previewHeight,
            }}
          >
            {preview.pinned && (
              <button
                className="preview-close"
                aria-label={msg("Close card preview")}
                onClick={closePreview}
              >
                <X size={16} />
              </button>
            )}
            <CardDetail
              card={previewDef}
              animated
              reduced={reduced}
              stats={
                previewStats
                  ? { ...previewStats, defense: previewStats.defense - previewCard.damage }
                  : undefined
              }
              state={
                previewCard.zone === "board" ? (
                  <>
                    {msg(positionName(previewCard.slot) ?? "")} ·{" "}
                    {previewCard.exhausted
                      ? msg("Exhausted · can still block")
                      : previewDef.type === "holding"
                        ? msg("Ready · can block{v0}", {
                            v0: previewDef.abilities.some((b) => registry.abilities[b.id].activate)
                              ? " or activate"
                              : "",
                          })
                        : msg("Ready to channel or attack{v0}", {
                            v0: previewDef.abilities.some((b) => registry.abilities[b.id].activate)
                              ? " · can activate"
                              : "",
                          })}
                    {previewCard.damage > 0
                      ? msg(" · {v0} damage", { v0: previewCard.damage })
                      : ""}
                  </>
                ) : undefined
              }
            ></CardDetail>
          </aside>
        )}
    </>
  );
}
