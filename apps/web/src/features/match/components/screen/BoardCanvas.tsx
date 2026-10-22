import { Suspense } from "react";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import { lazy } from "react";
const Board = lazy(() =>
  import("@realms/renderer/Board").then((module) => ({ default: module.Board })),
);

import { useMatch } from "../../MatchContext";

export function BoardCanvas() {
  const {
    ambient,
    beginPlay,
    draft,
    hoverBoard,
    inspectBoard,
    live,
    posesRef,
    reduced,
    selectBoard,
    selected,
    selectedActivation,
    selectedLegal,
    setSlotLayout,
    stage,
    startAttackDrag,
    targets,
    view,
    viewer,
    visibleAttacks,
    visibleBlocks,
  } = useMatch();
  return (
    <>
      <Suspense
        fallback={<div className="board-loading">{msg("The sanctum is taking shape…")}</div>}
      >
        <Board
          view={view}
          viewer={viewer}
          registry={registry}
          selected={selected}
          placementSlots={
            stage === "position" ? (selectedActivation?.slots ?? selectedLegal?.slots) : undefined
          }
          attacks={visibleAttacks}
          blocks={visibleBlocks}
          targets={targets}
          onSelect={selectBoard}
          onInspect={inspectBoard}
          onSlot={(slot) => {
            if (
              live &&
              draft &&
              stage === "position" &&
              (draft.activation !== undefined ||
                registry.cards[view.cards[draft.cardId].definitionId].type !== "spell")
            )
              beginPlay({ ...draft, slot });
          }}
          onHover={hoverBoard}
          onDragStart={startAttackDrag}
          onLayout={setSlotLayout}
          reduced={reduced}
          poses={posesRef}
          ambient={ambient}
        />
      </Suspense>
    </>
  );
}
