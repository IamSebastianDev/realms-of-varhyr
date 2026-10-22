import { type Command } from "@realms/contracts";
import { t as msg } from "@realms/ui/i18n";
import { playerCommands, stepAfter, tutorialSteps } from "../../../tutorial/tutorial";
import { useCallback, useEffect, useRef } from "react";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";

/** Sending moves to the session, and the effects that keep the screen in step with it. */
export function useMatchCommands(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory>,
) {
  const {
    actor,
    clash,
    error,
    historyIndex,
    hotseat,
    match,
    online,
    present,
    screen,
    sessionSnapshot,
    setActionCard,
    setAttackers,
    setClash,
    setCoachNudge,
    setCovered,
    setDraft,
    setEnergyFlights,
    setError,
    setFactionEffects,
    setHovered,
    setLanes,
    setPanel,
    setPreviewRequest,
    setSelected,
    setSpellCasts,
    setStage,
    setTutorialStep,
    state,
    tutorial,
    tutorialStep,
    view,
    viewer,
    watching,
  } = c;
  const send = useCallback(
    (command: Command) => {
      if (screen !== "match" || historyIndex !== null || clash) return;
      if (tutorial && actor === "p1") {
        const step = tutorialSteps[tutorialStep];
        if (!step?.accept || !step.accept(command, state)) {
          setCoachNudge((n) => n + 1);
          return;
        }
      }
      if (match.kind === "replay") return;
      try {
        match.act(command);
        if (tutorial && actor === "p1")
          setTutorialStep(stepAfter(playerCommands(match.getSnapshot().commands)));
        setActionCard(null);
        setError("");
        setDraft(null);
        setStage("none");
        setAttackers([]);
        setLanes({});
        setSelected(null);
        setHovered(null);
        setPreviewRequest(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : msg("Could not send the move."));
      }
    },
    [state, actor, historyIndex, screen, match, tutorial, tutorialStep, clash],
  );
  useEffect(() => {
    if (hotseat && actor !== viewer && !state.outcome) setCovered(true);
  }, [actor, viewer, hotseat, state.outcome]);
  useEffect(() => {
    if (sessionSnapshot.error) setError(sessionSnapshot.error);
  }, [sessionSnapshot.error]);
  useEffect(() => {
    if (online) {
      setActionCard(null);
      setDraft(null);
      setStage("none");
      setAttackers([]);
      setLanes({});
    }
  }, [online, view.revision]);
  const previousSession = useRef(sessionSnapshot),
    historyRef = useRef<number | null>(null);
  historyRef.current = historyIndex;
  useEffect(() => {
    const previous = previousSession.current;
    previousSession.current = sessionSnapshot;
    if (
      watching ||
      sessionSnapshot.initial !== previous.initial ||
      sessionSnapshot.revision === previous.revision
    )
      return;
    const oldSeq = previous.state.events.at(-1)?.seq ?? 0,
      newSeq = state.events.at(-1)?.seq ?? 0;
    if (newSeq < oldSeq) {
      setClash(null);
      setSpellCasts([]);
      setEnergyFlights([]);
      setFactionEffects([]);
      return;
    }
    if (historyRef.current === null)
      present(
        previous.state,
        state,
        state.events.filter((event) => event.seq > oldSeq),
        `session-${sessionSnapshot.revision}`,
      );
  }, [sessionSnapshot, state, present, watching]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(""), 5500);
      return () => clearTimeout(t);
    }
  }, [error]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === msg("Escape")) {
        setSelected(null);
        setDraft(null);
        setStage("none");
        setPanel(null);
        setActionCard(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return { send };
}
