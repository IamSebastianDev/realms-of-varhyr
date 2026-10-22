import { type PlayerId } from "@realms/contracts";
import { arenaForMatch } from "../../lib/arenas";
import { factionInfo, registry } from "@realms/content";
import { other } from "@realms/core";
import { useDraftForecast } from "../useDraftForecast";
import { useEffect, useMemo } from "react";
import { useMatchPresentation } from "../useMatchPresentation";
import { useTurnBanner } from "../useTurnBanner";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";

/** The frame on screen: which moment of the match is shown, the view for this seat, and what a pending play can still target. */
export function useMatchFrame(
  c: ReturnType<typeof useMatchBasics> & ReturnType<typeof useMatchUiState>,
) {
  const {
    attackers,
    boardRef,
    bot,
    connection,
    covered,
    draft,
    enemyPoolRef,
    historyIndex,
    hotseat,
    initial,
    lanes,
    match,
    online,
    poolRef,
    reduced,
    screen,
    sessionSnapshot,
    slotLayout,
    sound,
    stage,
    tutorial,
    viewer,
    watching,
  } = c;
  const {
    clash,
    setClash,
    posesRef,
    energyFlights,
    setEnergyFlights,
    spellCasts,
    setSpellCasts,
    clashBatches,
    factionEffects,
    setFactionEffects,
    present,
    stepping,
  } = useMatchPresentation({
    sound,
    reduced,
    covered,
    slotLayout,
    viewer,
    hotseat,
    initial,
    screen,
    historyIndex,
    boardRef,
    poolRef,
    enemyPoolRef,
  });
  const frame = useMemo(
    () => match.frame(historyIndex, viewer),
    [match, sessionSnapshot, historyIndex, viewer],
  );
  const displayedState = clash ? clash.steps[clash.i].state : frame.state;
  const view = useMemo(() => {
    if (!clash) return frame.view;
    // Animation overlays only public board changes; hands and legal actions keep the received seat's view.
    const base = frame.view,
      pick = (id: PlayerId) => ({
        ...base.players[id],
        life: displayedState.players[id].life,
        board: displayedState.players[id].board,
        discard: displayedState.players[id].discard,
        energy: displayedState.players[id].energy,
      });
    return {
      ...base,
      players: { p1: pick("p1"), p2: pick("p2") },
      cards: displayedState.cards,
      combat: displayedState.combat,
    };
  }, [frame, displayedState, viewer, clash, match]);
  const ambient = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const side of ["p1", "p2"] as PlayerId[])
      for (const id of view.players[side].board)
        if (id)
          for (const f of registry.cards[view.cards[id].definitionId]?.factions ?? [])
            tally[f] = (tally[f] ?? 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    return factionInfo[top ?? ""]?.color ?? "#d1bd86";
  }, [view]);
  const arena = useMemo(() => arenaForMatch(initial, registry), [initial]);
  const banner = useTurnBanner({
    view,
    viewer,
    screen,
    historyIndex,
    covered,
    tutorial,
    reduced,
    clash,
  });
  const actor = view.legal.actor,
    thinking = !!bot?.thinking,
    botGate = bot?.gate ?? null;
  const live =
    screen === "match" &&
    !watching &&
    historyIndex === null &&
    !clash &&
    !covered &&
    !thinking &&
    actor === viewer &&
    (!online || (!!connection?.connected && !connection.busy));
  // The opponent waits while the screen is busy showing the last move or the player is looking elsewhere.
  const hold = !!clash || covered || historyIndex !== null || screen !== "match";
  useEffect(() => {
    if (match.kind === "live") match.setHold(hold);
  }, [match, hold]);
  useEffect(() => {
    if (match.kind === "live" && hotseat) match.setSeat(viewer);
  }, [match, hotseat, viewer]);
  const selectedLegal = view.legal.playable.find((a) => a.cardId === draft?.cardId);
  const undoable = live && view.phase === "play" ? match.undoable(viewer) : [];
  const visibleAttacks =
    view.combat?.stage === "declare" ? attackers : (view.combat?.attackers ?? []);
  const draftLanes = useMemo(
    () =>
      Object.fromEntries(
        attackers.map((id) => [id, lanes[id] ?? displayedState.cards[id]?.slot ?? 0]),
      ),
    [attackers, lanes, displayedState],
  );
  const draftForecast = useDraftForecast({ match, view, attackers, draftLanes });
  const forecast = view.combat?.stage === "declare" ? draftForecast : sessionSnapshot.forecast;
  const selectedActivation = view.legal.activations.find(
    (a) => a.cardId === draft?.cardId && a.ability === draft?.activation,
  );
  const slotTargets =
    draft?.slot !== undefined ? selectedLegal?.slotTargets?.[draft.slot] : undefined;
  const targets =
    stage === "target"
      ? (selectedActivation?.targets ?? slotTargets ?? selectedLegal?.targets ?? [])
      : stage === "consume"
        ? (selectedLegal?.consumes ?? [])
        : [];
  const you = view.players[viewer],
    opponent = view.players[other(viewer)],
    responseStep = view.combat?.stage === "response" || !!view.responseStep;
  return {
    clash,
    setClash,
    posesRef,
    energyFlights,
    setEnergyFlights,
    spellCasts,
    setSpellCasts,
    clashBatches,
    factionEffects,
    setFactionEffects,
    present,
    stepping,
    displayedState,
    view,
    ambient,
    arena,
    banner,
    actor,
    thinking,
    botGate,
    live,
    selectedLegal,
    undoable,
    visibleAttacks,
    draftLanes,
    forecast,
    selectedActivation,
    targets,
    you,
    opponent,
    responseStep,
  };
}
