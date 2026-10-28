import { type CreatureAction } from "../../lib/creatureActions";
import { t as msg } from "@realms/ui/i18n";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";
import type { useMatchCommands } from "./useMatchCommands";
import type { useMatchLifecycle } from "./useMatchLifecycle";
import type { useMatchPlay } from "./useMatchPlay";
import type { useMatchPreview } from "./useMatchPreview";

/** Choosing targets and acting with a creature on the board. */
export function useMatchActions(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands> &
    ReturnType<typeof useMatchLifecycle> &
    ReturnType<typeof useMatchPlay> &
    ReturnType<typeof useMatchPreview>,
) {
  const {
    damagePick,
    draft,
    live,
    match,
    placesCard,
    selectedActivation,
    send,
    setActionCard,
    setAttackers,
    setCoachNudge,
    setDraft,
    setEnergyFlights,
    setError,
    setHovered,
    setLanes,
    setPreview,
    setPreviewRequest,
    setSelected,
    setStage,
    stage,
    tutorial,
    view,
    viewer,
  } = c;
  function sendTarget(target: string) {
    if (damagePick) {
      send({ type: "choose", choiceId: damagePick.id, option: target });
      return;
    }
    if (!draft) return;
    if (draft.activation !== undefined) {
      if (selectedActivation?.slots) {
        setPreviewRequest(null);
        setPreview(null);
        setDraft({ ...draft, target });
        setStage("position");
        setSelected(target);
        return;
      }
      send({ type: "activate", cardId: draft.cardId, ability: draft.activation, target });
    } else if (placesCard(draft.cardId, draft.mode) && draft.slot === undefined) {
      setPreviewRequest(null);
      setPreview(null);
      setDraft({ ...draft, target });
      setStage("position");
    } else send({ type: "play", ...draft, target });
  }
  function performCreatureAction(id: string, action: CreatureAction) {
    if (!live || stage !== "none") return;
    setActionCard(null);
    setPreviewRequest(null);
    setPreview(null);
    if (action.kind === "channel") send({ type: "energy", cardId: id, option: action.option });
    else if (action.kind === "activate") {
      const legal = view.legal.activations.find(
        (a) => a.cardId === id && a.ability === action.ability,
      );
      if (!legal) return;
      if (action.target)
        send({ type: "activate", cardId: id, ability: action.ability, target: action.target });
      else if (legal.requiresTarget) {
        setDraft({ cardId: id, activation: action.ability });
        setStage("target");
        setSelected(id);
      } else send({ type: "activate", cardId: id, ability: action.ability });
    } else if (action.kind === "attack") {
      setAttackers((a) => (a.includes(id) ? a : [...a, id]));
      setLanes((l) => ({ ...l, [id]: action.lane }));
      setSelected(null);
      setHovered(null);
    } else if (action.kind === "withdraw") {
      setAttackers((a) => a.filter((x) => x !== id));
      setLanes((l) => {
        const { [id]: _removed, ...rest } = l;
        return rest;
      });
      setSelected(null);
      setHovered(null);
    } else {
      if (tutorial) {
        setCoachNudge((n) => n + 1);
        return;
      }
      try {
        if (match.kind === "replay") return;
        match.undoChannel(id, viewer);
        setEnergyFlights([]);
        setSelected(null);
        setHovered(null);
        setDraft(null);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : msg("Cannot undo this energy."));
      }
    }
  }
  return { sendTarget, performCreatureAction };
}
