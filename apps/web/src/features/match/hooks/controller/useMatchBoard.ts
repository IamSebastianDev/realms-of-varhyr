import { creatureActions } from "../../lib/creatureActions";
import { registry } from "@realms/content";
import { useEffect } from "react";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";
import type { useMatchCommands } from "./useMatchCommands";
import type { useMatchLifecycle } from "./useMatchLifecycle";
import type { useMatchPlay } from "./useMatchPlay";
import type { useMatchPreview } from "./useMatchPreview";
import type { useMatchActions } from "./useMatchActions";
import type { useMatchDrag } from "./useMatchDrag";

/** Clicking cards on the board. */
export function useMatchBoard(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands> &
    ReturnType<typeof useMatchLifecycle> &
    ReturnType<typeof useMatchPlay> &
    ReturnType<typeof useMatchPreview> &
    ReturnType<typeof useMatchActions> &
    ReturnType<typeof useMatchDrag>,
) {
  const {
    actionCard,
    actionPopoverRef,
    attackers,
    beginPlay,
    covered,
    draft,
    damagePick,
    draftLanes,
    historyIndex,
    inspectBoard,
    live,
    panel,
    performCreatureAction,
    sendTarget,
    setActionCard,
    setDraft,
    setPreview,
    setPreviewRequest,
    setSelected,
    setStage,
    stage,
    suppressClick,
    targets,
    undoable,
    view,
    viewer,
  } = c;
  function selectBoard(id: string) {
    if (!live || suppressClick()) return;
    if (stage === "consume" && draft && targets.includes(id)) {
      beginPlay({
        ...draft,
        consume: id,
        ...(registry.cards[view.cards[draft.cardId].definitionId].type === "spell"
          ? {}
          : { slot: view.cards[id].slot! }),
      });
      return;
    }
    if ((damagePick || (stage === "target" && draft)) && targets.includes(id)) {
      sendTarget(id);
      return;
    }
    if (stage !== "none") return;
    const actions = creatureActions(view, id, undoable, attackers, draftLanes);
    setPreviewRequest(null);
    setPreview(null);
    if (actions.length === 1) {
      performCreatureAction(id, actions[0]);
      return;
    }
    if (actions.length > 1) {
      setActionCard((current) => (current === id ? null : id));
      setSelected(null);
      setDraft(null);
      return;
    }
    inspectBoard(id);
    setDraft(null);
    setStage("none");
  }
  useEffect(() => {
    setActionCard(null);
  }, [view.revision, viewer, panel, covered, historyIndex]);
  useEffect(() => {
    if (!actionCard) return;
    const outside = (event: PointerEvent) => {
      if (!actionPopoverRef.current?.contains(event.target as Node)) setActionCard(null);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [actionCard]);
  return { selectBoard };
}
