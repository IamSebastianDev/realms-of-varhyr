import { useEffect } from "react";
import { registry, starterDefinitions } from "@realms/content";
import type { MatchSetup } from "../lib/session";
import type { CustomDeck } from "../../decks/lib/decks";
import { claimVictory } from "../../collection/lib/collection";
import { updateCollection } from "../../collection/stores/collectionStore";
import { trackMatch } from "../../goals/stores/goalsStore";
import { matchResult } from "../../goals/lib/goals";
import { buildRecord } from "../../stats/lib/record";
import { recordFinishedMatch } from "../../stats/stores/ledgerStore";
import { reportFight } from "../../quest/stores/questStore";
import { reportDraftResult } from "../../draft/stores/draftStore";
import type { SessionSnapshot } from "../session/MatchSession";

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
  played: onlineDeck,
}: {
  setup?: MatchSetup;
  snapshot: SessionSnapshot;
  watching: boolean;
  online: boolean;
  rewardId?: string;
  rewardEligible: boolean;
  customDeck?: CustomDeck;
  deck: string;
  /** The deck brought to an online room. */
  played?: { id: string; name: string; cards: string[] };
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
  // The match ledger keeps one record per finished match you played yourself. Hot seat has no single player to credit.
  useEffect(() => {
    if (!state.outcome || watching || setup?.tutorial || setup?.mode === "hotseat") return;
    const played = online
      ? onlineDeck
      : (customDeck ?? starterDefinitions.find((s) => s.id === deck));
    if (!played) return;
    const built = buildRecord(initial, state, sessionSnapshot.seat ?? "p1", {
      id: sessionSnapshot.matchId || String(initial.seed),
      at: new Date().toISOString(),
      mode: online
        ? "online"
        : setup?.quest
          ? "quest"
          : setup?.draft
            ? "draft"
            : (setup?.mode ?? "practice"),
      deckId: played.id,
      deckName: played.name,
      cards: played.cards,
      registry,
      online,
    });
    if (built) recordFinishedMatch(built.record, built.cards);
  }, [state.outcome]); // eslint-disable-line react-hooks/exhaustive-deps
}
