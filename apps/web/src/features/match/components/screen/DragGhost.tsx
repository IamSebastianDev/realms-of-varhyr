import { ArtCard } from "@realms/ui/CardPresentation";
import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function DragGhost() {
  const { drag, dragDef, draggingAttacker, dropLane, dropPlay, needsDropTarget, view } = useMatch();
  return (
    <>
      {drag && dragDef && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <ArtCard detail={false} card={dragDef} className="drag-card" />
          <span className={dropPlay || dropLane !== null ? "valid" : ""}>
            {draggingAttacker
              ? dropLane !== null
                ? msg("Release to attack this lane")
                : msg("Choose a highlighted lane")
              : dropPlay
                ? dropPlay.consume
                  ? view.legal.playable.find((a) => a.cardId === drag.cardId)?.returns
                    ? msg("Release to return")
                    : msg("Release to Consume")
                  : dropPlay.target || dragDef.type === "spell"
                    ? needsDropTarget
                      ? msg("Release to choose a target")
                      : msg("Release to cast")
                    : msg("Release to deploy")
                : view.legal.playable.some((a) => a.cardId === drag.cardId)
                  ? msg("Choose a highlighted slot or target")
                  : msg("Needs energy or legal timing")}
          </span>
        </div>
      )}
    </>
  );
}
