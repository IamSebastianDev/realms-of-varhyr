import { toStageX } from "@realms/ui/stage";
import { useRef, type CSSProperties } from "react";
import { CombatArrows } from "../CombatArrows";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { LaneBands } from "./LaneBands";
import { BoardCanvas } from "./BoardCanvas";
import { TurnBanner } from "./TurnBanner";
import { SlotLabels } from "./SlotLabels";
import { LaneLabels } from "./LaneLabels";
import { KeyRows } from "./KeyRows";
import { useMatch } from "../../MatchContext";

export function BoardScene() {
  const {
    ambient,
    boardRef,
    clash,
    drag,
    dropPlay,
    dropZone,
    laneAtX,
    setHoverLane,
    slotLayout,
    spellDrop,
    view,
    visibleBlocks,
    visibleLanes,
  } = useMatch();
  const lastHoverLane = useRef<number | null>(null);
  return (
    <div
      ref={boardRef}
      className={`board-scene ${spellDrop ? "spell-drop-ready" : ""} ${spellDrop && dropPlay && dropZone?.area !== "player" ? "spell-drop-over" : ""}`}
      style={{ "--ambient": ambient } as CSSProperties}
      onPointerMove={(e) => {
        if (!drag) {
          const lane = laneAtX(toStageX(e.clientX));
          if (lastHoverLane.current !== lane) {
            lastHoverLane.current = lane;
            setHoverLane(lane);
          }
        }
      }}
      onPointerLeave={() => {
        if (lastHoverLane.current !== null) {
          lastHoverLane.current = null;
          setHoverLane(null);
        }
      }}
    >
      {spellDrop && (
        <span className="spell-drop-hint">
          {view.legal.playable.find((a) => a.cardId === drag?.cardId)?.requiresTarget
            ? msg("Drop on a target, or release here to choose")
            : msg("Drop anywhere here to cast")}
        </span>
      )}
      <LaneBands />
      <div className="board-mist" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <BoardCanvas />
      <TurnBanner />
      <SlotLabels />
      <CombatArrows
        view={view}
        slots={slotLayout}
        lanes={clash || view.combat?.stage === "response" ? {} : visibleLanes}
        blocks={visibleBlocks}
        registry={registry}
      />
      <LaneLabels />
      <div className="board-divider">
        <i />
        <span>✦</span>
        <i />
      </div>
      <KeyRows />
    </div>
  );
}
