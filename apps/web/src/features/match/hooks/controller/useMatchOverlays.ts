import { maybeRectOf, stageHeight, stageWidth } from "@realms/ui/stage";
import { creatureActions } from "../../lib/creatureActions";
import { effectiveStats } from "@realms/core";
import { t as msg } from "@realms/ui/i18n";
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
import type { useMatchBoard } from "./useMatchBoard";

/** Where the preview card and the creature action menu are placed. */
export function useMatchOverlays(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands> &
    ReturnType<typeof useMatchLifecycle> &
    ReturnType<typeof useMatchPlay> &
    ReturnType<typeof useMatchPreview> &
    ReturnType<typeof useMatchActions> &
    ReturnType<typeof useMatchDrag> &
    ReturnType<typeof useMatchBoard>,
) {
  const {
    actionCard,
    attackers,
    boardRef,
    closePreview,
    covered,
    draftLanes,
    drag,
    panel,
    preview,
    previewRef,
    previewRequest,
    setPreview,
    setPreviewRequest,
    slotLayout,
    state,
    undoable,
    view,
    viewer,
  } = c;
  useEffect(() => {
    setPreview(null);
    if (
      !previewRequest ||
      actionCard ||
      drag ||
      panel ||
      covered ||
      (view.pending && view.pending.kind !== "mulligan") ||
      state.outcome
    )
      return;
    if (previewRequest.pinned) {
      setPreview(previewRequest);
      return;
    }
    const timer = setTimeout(() => setPreview(previewRequest), 420);
    return () => clearTimeout(timer);
  }, [previewRequest, actionCard, drag, panel, covered, view.pending, state.outcome]);
  useEffect(() => {
    setPreviewRequest(null);
    setPreview(null);
  }, [view.revision, viewer]);
  useEffect(() => {
    const clear = (e: KeyboardEvent) => {
      if (e.key === msg("Escape")) {
        setPreviewRequest(null);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);
  useEffect(() => {
    if (!previewRequest?.pinned) return;
    const outside = (event: PointerEvent) => {
      if (event.button !== 2 && !previewRef.current?.contains(event.target as Node)) closePreview();
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [previewRequest?.pinned]);
  const previewCard = preview && view.cards[preview.cardId],
    previewDef = previewCard ? registry.cards[previewCard.definitionId] : null;
  const previewStats =
    previewCard && previewDef && previewDef.type !== "spell"
      ? effectiveStats(view, previewCard.id, registry)
      : undefined;
  const previewHeight = Math.min(650, stageHeight() - 24),
    previewWidth =
      stageWidth() >= 701 ? Math.min(600, stageWidth() - 24) : Math.min(270, stageWidth() - 24);
  const previewX = preview
    ? Math.max(
        12,
        Math.min(
          stageWidth() - previewWidth - 12,
          preview.right + 14 + previewWidth < stageWidth()
            ? preview.right + 14
            : preview.left - previewWidth - 14,
        ),
      )
    : 12;
  const previewY = preview
    ? Math.max(12, Math.min(stageHeight() - previewHeight - 12, preview.top))
    : 12;
  const actionInstance = actionCard ? view.cards[actionCard] : null;
  const actionSlot = actionInstance
    ? slotLayout.find(
        (s) => s.player === actionInstance.controller && s.slot === actionInstance.slot,
      )
    : null;
  const boardBounds = maybeRectOf(boardRef.current);
  const availableActions = actionCard
    ? creatureActions(view, actionCard, undoable, attackers, draftLanes)
    : [];
  const useEnergyArc =
    availableActions.length > 1 &&
    availableActions.every(
      (action) =>
        (action.kind === "channel" || action.kind === "activate") &&
        action.output &&
        Object.entries(action.output).length === 1 &&
        Object.values(action.output)[0] > 0,
    );
  const energyAnchor = () => {
    const bounds = maybeRectOf(boardRef.current);
    return actionSlot && bounds
      ? {
          left: bounds.left + actionSlot.x,
          top: bounds.top + actionSlot.y,
          width: actionSlot.width,
          height: actionSlot.height,
        }
      : null;
  };
  const actionPosition =
    actionSlot && boardBounds
      ? {
          left: Math.max(
            10,
            Math.min(
              stageWidth() - 234,
              boardBounds.left + actionSlot.x + actionSlot.width / 2 - 112,
            ),
          ),
          top: Math.max(
            10,
            Math.min(stageHeight() - 230, boardBounds.top + actionSlot.y + actionSlot.height + 10),
          ),
        }
      : { left: 10, top: 100 };
  return {
    previewCard,
    previewDef,
    previewStats,
    previewHeight,
    previewWidth,
    previewX,
    previewY,
    actionInstance,
    availableActions,
    useEnergyArc,
    energyAnchor,
    actionPosition,
  };
}
