import { BoardPositionLabel } from "../BoardPositionLabel";
import { other } from "@realms/core";
import { registry } from "@realms/content";
import { resolveDrop } from "../../lib/cardInteraction";

import { useMatch } from "../../MatchContext";

export function LaneLabels() {
  const {
    drag,
    dragDef,
    draggingAttacker,
    hoverLane,
    laneAt,
    laneAtX,
    selectedActivation,
    selectedLegal,
    slotLayout,
    stage,
    view,
    viewer,
  } = useMatch();
  return (
    <>
      <div className="lane-labels" aria-hidden="true">
        {view.players[viewer].board.map((_, lane) => {
          const top = slotLayout.find((s) => s.player === other(viewer) && s.slot === lane),
            bottom = slotLayout.find((s) => s.player === viewer && s.slot === lane);
          if (!top || !bottom) return null;
          const under = (drag ? laneAtX(drag.x) : hoverLane) === lane;
          // Lanes you could drop on keep their name so the target is clear.
          const droppable = draggingAttacker
            ? laneAt({ player: other(viewer), slot: lane }) !== null
            : !!drag &&
              dragDef?.type !== "spell" &&
              !!resolveDrop(view, viewer, registry, drag.cardId, {
                player: viewer,
                slot: lane,
              });
          const choosing =
            stage === "position" &&
            !!(selectedActivation?.slots ?? selectedLegal?.slots)?.includes(lane);
          return (
            <div
              key={lane}
              className={`lane-label ${under || droppable || choosing ? "shown" : ""}`}
              style={{ left: bottom.x, width: bottom.width, top: "50%" }}
            >
              <BoardPositionLabel slot={lane} />
            </div>
          );
        })}
      </div>
    </>
  );
}
