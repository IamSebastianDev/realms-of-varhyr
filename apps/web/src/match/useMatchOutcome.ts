import { useEffect } from "react";
import { registry } from "@realms/content";
import type { MatchSetup } from "../session";
import type { CustomDeck } from "../decks";
import { claimVictory } from "../collection";
import { updateCollection } from "../collectionStore";
import { trackMatch } from "../goalsStore";
import { matchResult } from "../goals";
import { reportFight } from "../quest/questStore";
import { reportDraftResult } from "../draft/draftStore";
import type { SessionSnapshot } from "./MatchSession";

/**
 * Everything a finished match pays out or reports, in one place: the collection's victory reward, quest and draft results,
 * and the daily goals. Replays and the tutorial report nothing.
 */
export function useMatchOutcome({
  setup,
  snapshot,
  watching,
  online,
  rewardId,
  rewardEligible,
  customDeck,
  deck,
}: {
  setup?: MatchSetup;
  snapshot: SessionSnapshot;
  watching: boolean;
  online: boolean;
  rewardId?: string;
  rewardEligible: boolean;
  customDeck?: CustomDeck;
  deck: string;
}) {
  const { initial, commands, state } = snapshot,
    sessionSnapshot = snapshot;
  const collectionOutcome = sessionSnapshot.seat
    ? state.outcome === sessionSnapshot.seat
      ? "p1"
      : state.outcome === "draw"
        ? "draw"
        : state.outcome
          ? "p2"
          : null
    : state.outcome;
  useEffect(() => {
    updateCollection((current) =>
      claimVictory(current, rewardId, collectionOutcome, rewardEligible),
    );
  }, [rewardId, collectionOutcome, rewardEligible]);
  // Goals count finished matches you played yourself: not replays, not the tutorial, and in hot seat only the first player.
  useEffect(() => {
    if (!state.outcome || !setup?.quest || watching) return;
    reportFight({
      run: setup.quest.run,
      node: setup.quest.node,
      won: state.outcome === "p1",
      life: Math.max(0, state.players.p1.life),
    });
  }, [state.outcome]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.outcome || !setup?.draft || watching || online) return;
    reportDraftResult(
      setup.draft.preset,
      setup.draft.run,
      setup.draft.match,
      state.outcome === "p1" ? "won" : state.outcome === "draw" ? "draw" : "lost",
    );
  }, [state.outcome]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.outcome || watching || setup?.tutorial) return;
    trackMatch(
      matchResult(initial, state, commands, sessionSnapshot.seat ?? "p1", {
        id: sessionSnapshot.matchId || String(initial.seed),
        online,
        deckId: customDeck?.id ?? deck,
        registry,
      }),
    );
  }, [state.outcome]);
}
