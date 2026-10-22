import { type Draft } from "../../lib/matchTypes";
import { t as msg } from "@realms/ui/i18n";
import { nextPlayStage } from "../../lib/cardInteraction";
import { planChannels } from "../../lib/autoChannel";
import { registry } from "@realms/content";
import { useEffect, useRef } from "react";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";
import type { useMatchCommands } from "./useMatchCommands";
import type { useMatchLifecycle } from "./useMatchLifecycle";

/** Starting a play from the hand: deploy, cast, quick play with automatic channeling. */
export function useMatchPlay(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands> &
    ReturnType<typeof useMatchLifecycle>,
) {
  const {
    live,
    match,
    online,
    responseStep,
    send,
    setActionCard,
    setDraft,
    setError,
    setPreview,
    setPreviewRequest,
    setSelected,
    setStage,
    stage,
    state,
    view,
    you,
  } = c;
  const placesCard = (cardId: string) =>
    !!registry.cards[view.cards[cardId].definitionId].cast?.some(
      (b) => registry.abilities[b.id].placement,
    );
  function beginPlay(nextDraft: Draft) {
    setActionCard(null);
    if (nextDraft.activation !== undefined) {
      if (nextDraft.target && nextDraft.slot !== undefined)
        send({
          type: "activate",
          cardId: nextDraft.cardId,
          ability: nextDraft.activation,
          target: nextDraft.target,
          slot: nextDraft.slot,
        });
      return;
    }
    const legal = view.legal.playable.find((a) => a.cardId === nextDraft.cardId);
    if (!legal) {
      setError(msg("Generate the required energy first, and check your free slots."));
      return;
    }
    setDraft(nextDraft);
    const nextStage = nextPlayStage(
      registry.cards[view.cards[nextDraft.cardId].definitionId],
      legal,
      nextDraft,
      placesCard(nextDraft.cardId),
    );
    if (nextStage !== "none") {
      setStage(nextStage);
      return;
    }
    send({ type: "play", ...nextDraft });
  }
  /** Starts a play the way a drop would: single legal slots are taken, anything else opens the usual choice stage. */
  function quickBegin(id: string) {
    const legal = view.legal.playable.find((a) => a.cardId === id);
    if (!legal) return;
    const spell = registry.cards[view.cards[id].definitionId].type === "spell";
    setSelected(id);
    setPreviewRequest(null);
    setPreview(null);
    beginPlay(
      !spell && !legal.consumes.length && legal.slots.length === 1
        ? { cardId: id, slot: legal.slots[0] }
        : { cardId: id },
    );
  }
  /** Double-click: play the card, exhausting just enough producers first when the pool falls short. */
  function quickPlay(id: string) {
    if (
      !live ||
      stage !== "none" ||
      view.pending ||
      state.outcome ||
      view.cards[id]?.zone !== "hand"
    )
      return;
    if (view.legal.playable.some((a) => a.cardId === id)) {
      quickBegin(id);
      return;
    }
    if (view.phase !== "play" || responseStep) {
      setError(msg("Generate matching energy and check the timing first."));
      return;
    }
    const plan = planChannels(
      registry.cards[view.cards[id].definitionId].cost,
      you.energy,
      view.legal.energy,
    );
    if (!plan) {
      setError(msg("Not enough energy, even with every producer."));
      return;
    }
    if (!plan.length) {
      setError(msg("Generate the required energy first, and check your free slots."));
      return;
    }
    if (match.kind === "replay") return;
    try {
      for (const step of plan)
        match.act({ type: "energy", cardId: step.cardId, option: step.option });
      autoPlay.current = { id, until: Date.now() + 3000 };
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("Could not send the move."));
    }
  }
  const autoPlay = useRef<{ id: string; until: number } | null>(null);
  useEffect(() => {
    const pending = autoPlay.current;
    if (!pending) return;
    if (view.legal.playable.some((a) => a.cardId === pending.id)) {
      autoPlay.current = null;
      quickBegin(pending.id);
    } else if (!online || Date.now() > pending.until) {
      autoPlay.current = null;
      setError(msg("Energy is ready, but the card can't be played. Check your free slots."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.revision]);
  return { placesCard, beginPlay, quickPlay };
}
