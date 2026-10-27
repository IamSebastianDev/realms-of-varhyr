import { maybeRectOf } from "@realms/ui/stage";
import { useState } from "react";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";
import type { useMatchCommands } from "./useMatchCommands";
import type { useMatchLifecycle } from "./useMatchLifecycle";
import type { useMatchPlay } from "./useMatchPlay";

/** Card previews and the hover and pin behaviour around them. */
export function useMatchPreview(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands> &
    ReturnType<typeof useMatchLifecycle> &
    ReturnType<typeof useMatchPlay>,
) {
  const {
    boardRef,
    previewRequest,
    setActionCard,
    setHovered,
    setPreview,
    setPreviewRequest,
    setSelected,
    slotLayout,
    stage,
    view,
  } = c;
  function inspectBoard(id: string) {
    const card = view.cards[id],
      slot = slotLayout.find((s) => s.player === card?.controller && s.slot === card?.slot),
      rect = maybeRectOf(boardRef.current);
    if (slot && rect)
      pinPreview(id, {
        left: rect.left + slot.x,
        top: rect.top + slot.y,
        right: rect.left + slot.x + slot.width,
        bottom: rect.top + slot.y + slot.height,
      });
  }
  function pinPreview(id: string, rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">) {
    setActionCard(null);
    setSelected(id);
    setPreviewRequest({
      cardId: id,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      pinned: true,
    });
  }
  function closePreview() {
    setSelected(null);
    setPreviewRequest(null);
    setPreview(null);
  }
  function clearHoverPreview() {
    setPreviewRequest((current) => (current?.pinned ? current : null));
  }
  function requestPreview(id: string, rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">) {
    if (stage !== "none" || previewRequest?.pinned) return;
    setPreviewRequest({
      cardId: id,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  }
  // Lane names stay hidden until the pointer is over that lane (the column of both rows).
  const [hoverLane, setHoverLane] = useState<number | null>(null);
  const laneAtX = (x: number) => {
    const board = maybeRectOf(boardRef.current);
    if (!board) return null;
    return (
      slotLayout.find((s) => x >= board.left + s.x && x <= board.left + s.x + s.width)?.slot ?? null
    );
  };
  function hoverBoard(id: string | null) {
    if (stage !== "none") return;
    setHovered(id);
    if (previewRequest?.pinned) return;
    const card = id ? view.cards[id] : null,
      slot = card
        ? slotLayout.find((s) => s.player === card.controller && s.slot === card.slot)
        : null,
      rect = maybeRectOf(boardRef.current);
    if (id && slot && rect)
      setPreviewRequest({
        cardId: id,
        left: rect.left + slot.x,
        top: rect.top + slot.y,
        right: rect.left + slot.x + slot.width,
        bottom: rect.top + slot.y + slot.height,
      });
    else setPreviewRequest(null);
  }
  return {
    inspectBoard,
    pinPreview,
    closePreview,
    clearHoverPreview,
    requestPreview,
    hoverLane,
    setHoverLane,
    laneAtX,
    hoverBoard,
  };
}
