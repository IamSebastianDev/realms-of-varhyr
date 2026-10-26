import { FactionIcon } from "@realms/renderer/FactionIcon";
import { type MatchSituation, phaseButtonLabel, turnPrompt } from "../../lib/matchText";
import { type PlayerId } from "@realms/contracts";
import { t as msg } from "@realms/ui/i18n";
import { other } from "@realms/core";
import { registry } from "@realms/content";
import { useEffect } from "react";
import { usePhaseAdvance } from "../usePhaseAdvance";
import { useProfile } from "../../../profile/stores/profile";

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
import type { useMatchOverlays } from "./useMatchOverlays";

/** The phase button, the turn prompt and the situation text. */
export function useMatchHud(
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
    ReturnType<typeof useMatchBoard> &
    ReturnType<typeof useMatchOverlays>,
) {
  const {
    actionCard,
    attackers,
    botGate,
    clash,
    connection,
    covered,
    draftLanes,
    drag,
    hotseat,
    live,
    match,
    online,
    panel,
    rewardId,
    screen,
    selectedActivation,
    selectedLegal,
    send,
    sessionSnapshot,
    skipEmptyWindows,
    stage,
    state,
    thinking,
    tutorial,
    undoable,
    view,
    viewer,
    watching,
  } = c;
  const profile = useProfile(),
    ownArt = !watching && !hotseat;
  // A portrait id travels with each player; an older match without one still shows your own profile avatar.
  const artFor = (id: PlayerId): string | undefined =>
    view.players[id].avatar ?? (id === viewer && ownArt ? profile.avatar : undefined);
  const discardTop = (pile: string[]) =>
    pile.length ? registry.cards[view.cards[pile[pile.length - 1]]?.definitionId] : undefined;
  const laneOccupant = (lane: number) => {
    const id = view.players[other(viewer)].board[lane];
    return id ? msg(registry.cards[view.cards[id].definitionId].name) : msg("Open · hits player");
  };
  const situation: MatchSituation = {
    view,
    viewer,
    watching,
    online,
    live,
    thinking,
    botGate,
    connection,
    stage,
    selectedActivation,
    returns: !!selectedLegal?.returns,
    undoable,
    attackers,
  };
  const prompt = turnPrompt(situation);
  const factionSymbol = (id: PlayerId) => {
    const tally: Record<string, number> = {};
    for (const c of Object.values(state.cards))
      if (c.owner === id)
        for (const f of registry.cards[c.definitionId]?.factions ?? [])
          tally[f] = (tally[f] ?? 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    return <FactionIcon faction={top ?? "neutral"} />;
  };
  const enemyPhase = view.combat ? 1 : view.phase === "play" ? 0 : 2;
  const mainLabel = phaseButtonLabel(situation);
  const phaseIndex = enemyPhase;
  function mainAction() {
    if (thinking && botGate) {
      if (match.kind === "live") match.advanceOpponent();
      return;
    }
    if (view.combat?.stage === "declare") send({ type: "attack", attackers, lanes: draftLanes });
    else if (view.combat?.stage === "review") send({ type: "confirm-combat" });
    else send({ type: "end" });
  }
  const advanceEnabled =
    (live || (thinking && !!botGate && !covered && screen === "match")) &&
    !clash &&
    !view.pending &&
    !view.outcome &&
    !panel &&
    !drag &&
    !actionCard &&
    stage === "none";
  const advancePhaseKey = `${rewardId ?? sessionSnapshot.matchId}:${view.turn}:${view.active}:${view.phase}:${view.combat?.stage ?? ""}:${view.responseStep ?? ""}`;
  const windowKey = `${view.revision}:${view.responseStep ?? ""}`;
  const skippable =
    skipEmptyWindows &&
    !!view.responseStep &&
    view.responseStep === viewer &&
    view.legal.actor === viewer &&
    !tutorial &&
    !view.pending &&
    !view.outcome &&
    view.legal.playable.length === 0 &&
    live;
  useEffect(() => {
    if (!skippable) return;
    const t = setTimeout(() => send({ type: "end" }), 450);
    return () => clearTimeout(t);
  }, [skippable, windowKey, send]);
  const phaseAdvance = usePhaseAdvance(
    { enabled: advanceEnabled, phaseKey: advancePhaseKey },
    mainAction,
  );
  const transitioning = phaseAdvance.transitionStartedAt !== null;
  return {
    artFor,
    discardTop,
    laneOccupant,
    situation,
    prompt,
    factionSymbol,
    mainLabel,
    phaseIndex,
    advanceEnabled,
    phaseAdvance,
    transitioning,
  };
}
