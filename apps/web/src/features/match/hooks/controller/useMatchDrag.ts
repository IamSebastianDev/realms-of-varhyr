import { maybeRectOf } from "@realms/ui/stage";
import { type CardDrag, useCardDrag } from "../useCardDrag";
import {
  type DropZone,
  hitDropZone,
  resolveDrop,
  resolveLaneDrop,
} from "../../lib/cardInteraction";
import { handDropIndex, moveInOrder, orderedHand } from "../../lib/handOrder";
import { type PlayerId } from "@realms/contracts";
import { laneBlocks, other } from "@realms/core";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";
import type { useMatchCommands } from "./useMatchCommands";
import type { useMatchLifecycle } from "./useMatchLifecycle";
import type { useMatchPlay } from "./useMatchPlay";
import type { useMatchPreview } from "./useMatchPreview";
import type { useMatchActions } from "./useMatchActions";

/** Dragging cards onto slots, lanes and players, and what the drop would do. */
export function useMatchDrag(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands> &
    ReturnType<typeof useMatchLifecycle> &
    ReturnType<typeof useMatchPlay> &
    ReturnType<typeof useMatchPreview> &
    ReturnType<typeof useMatchActions>,
) {
  const {
    attackers,
    beginPlay,
    boardRef,
    displayedState,
    draftLanes,
    enemyPlayerRef,
    live,
    ownPlayerRef,
    panel,
    sendTarget,
    setActionCard,
    setAttackers,
    setDraft,
    damagePick,
    handOrder,
    setError,
    setHandOrder,
    setHovered,
    setLanes,
    setPreview,
    setPreviewRequest,
    setSelected,
    slotLayout,
    stage,
    state,
    targets,
    view,
    viewer,
  } = c;
  function hitZone(point: CardDrag): DropZone | null {
    return hitDropZone(
      point,
      viewer,
      {
        board: maybeRectOf(boardRef.current) ?? null,
        slots: slotLayout,
        players: {
          [viewer]: maybeRectOf(ownPlayerRef.current),
          [other(viewer)]: maybeRectOf(enemyPlayerRef.current),
        },
      },
      registry.cards[view.cards[point.cardId]?.definitionId]?.type === "spell",
    );
  }
  // The hand is arranged by the player: dragging a card along it moves it, and letting go inside the hand keeps it there.
  const hand = orderedHand(view.hand, handOrder);
  function handSlot(point: CardDrag): number | null {
    if (view.cards[point.cardId]?.zone !== "hand") return null;
    const boxes = Object.fromEntries(
      hand.map((id) => [id, maybeRectOf(document.getElementById(`hand-${id}`))]),
    );
    return handDropIndex(
      point,
      point.cardId,
      hand,
      maybeRectOf(document.querySelector(".hand-scroll")),
      boxes,
    );
  }
  const dragEnabled = live && !panel && !view.pending && !state.outcome && stage === "none";
  const {
    drag,
    start: startDrag,
    suppressClick,
  } = useCardDrag(
    dragEnabled,
    view.revision,
    (point) => {
      if (view.cards[point.cardId]?.zone === "board") {
        const lane = resolveLaneDrop(
          view,
          viewer,
          point.cardId,
          hitZone(point),
          attackers,
          draftLanes,
        );
        if (lane === null) {
          setError(msg("Drop the attacker on a highlighted lane."));
          return;
        }
        setAttackers((a) => (a.includes(point.cardId) ? a : [...a, point.cardId]));
        setLanes((l) => ({ ...l, [point.cardId]: lane }));
        setSelected(null);
        return;
      }
      const slot = handSlot(point);
      if (slot !== null) {
        setHandOrder(moveInOrder(hand, point.cardId, slot));
        return;
      }
      const drop = resolveDrop(view, viewer, registry, point.cardId, hitZone(point));
      if (!drop) {
        setError(
          view.legal.playable.some((a) => a.cardId === point.cardId)
            ? msg("Card returned to hand. Drop onto a highlighted slot or target.")
            : msg("Card returned to hand. Generate matching energy and check the timing first."),
        );
        return;
      }
      setSelected(drop.cardId);
      beginPlay(drop);
    },
    () => {
      setActionCard(null);
      setSelected(null);
      setHovered(null);
      setDraft(null);
      setPreviewRequest(null);
      setPreview(null);
      setError("");
    },
  );
  const handSpot = drag ? handSlot(drag) : null;
  const handIds = drag && handSpot !== null ? moveInOrder(hand, drag.cardId, handSpot) : hand;
  const dragDef =
    drag && view.cards[drag.cardId] ? registry.cards[view.cards[drag.cardId].definitionId] : null;
  const dropZone = drag ? hitZone(drag) : null;
  const dropPlay = drag ? resolveDrop(view, viewer, registry, drag.cardId, dropZone) : null;
  const spellDrop =
    dragDef?.type === "spell" && view.legal.playable.some((a) => a.cardId === drag?.cardId);
  const needsDropTarget =
    !!dropPlay &&
    !!view.legal.playable.find((a) => a.cardId === dropPlay.cardId)?.requiresTarget &&
    !dropPlay.target;
  const playerDropClass = (player: PlayerId) =>
    `${targets.includes(player) ? "targetable" : ""} ${spellDrop ? "spell-drop-ready" : ""} ${spellDrop && dropPlay && dropZone?.slot === undefined && dropZone?.area === "player" && dropZone.player === player ? "spell-drop-over" : ""}`;
  function choosePlayerTarget(player: PlayerId, event: React.MouseEvent) {
    if (!live || (stage !== "target" && !damagePick) || !targets.includes(player)) return;
    event.preventDefault();
    event.stopPropagation();
    sendTarget(player);
  }
  const draggingAttacker = !!drag && view.cards[drag.cardId]?.zone === "board";
  const laneAt = (zone: DropZone | null) =>
    draggingAttacker
      ? resolveLaneDrop(view, viewer, drag!.cardId, zone, attackers, draftLanes)
      : null;
  const dropLane = laneAt(dropZone);
  // While dragging over a legal lane, preview its arrow and blocker before the drop commits it.
  const planAttackers =
    dropLane !== null && !attackers.includes(drag!.cardId)
      ? [...attackers, drag!.cardId]
      : attackers;
  const planLanes = dropLane !== null ? { ...draftLanes, [drag!.cardId]: dropLane } : draftLanes;
  const visibleLanes = view.combat?.stage === "declare" ? planLanes : (view.combat?.lanes ?? {});
  const visibleBlocks =
    view.combat?.stage === "declare"
      ? laneBlocks(
          displayedState,
          [...planAttackers].sort(
            (a, b) => displayedState.cards[a].slot! - displayedState.cards[b].slot!,
          ),
          planLanes,
          registry,
        )
      : (view.combat?.blocks ?? []);
  const startAttackDrag = (id: string, event: Parameters<typeof startDrag>[1]) => {
    if (view.combat?.stage === "declare" && view.legal.lanes[id]) startDrag(id, event);
  };
  return {
    dragEnabled,
    handIds,
    drag,
    startDrag,
    suppressClick,
    dragDef,
    dropZone,
    dropPlay,
    spellDrop,
    needsDropTarget,
    playerDropClass,
    choosePlayerTarget,
    draggingAttacker,
    laneAt,
    dropLane,
    visibleLanes,
    visibleBlocks,
    startAttackDrag,
  };
}
