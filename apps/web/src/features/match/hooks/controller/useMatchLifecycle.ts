import { type CustomDeck, decksKey, starterOptions } from "../../../decks/lib/decks";
import { type DeckName, randomSeed, startMatch } from "../../lib/session";
import { type GameState } from "@realms/contracts";
import { type Mode } from "../../lib/matchTypes";
import { type Screen } from "../../../lobby/lib/lobbyTypes";
import { defaultDeckId } from "@realms/content";
import { getProfile } from "../../../profile/stores/profile";
import { missingDeckCopies } from "../../../collection/lib/collection";
import { t as msg } from "@realms/ui/i18n";
import { sceneTransition } from "../../../../lib/sceneTransition";
import { startTutorial, tutorialKey } from "../../../tutorial/tutorial";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";
import type { useMatchHistory } from "./useMatchHistory";
import type { useMatchCommands } from "./useMatchCommands";

/** Leaving the screen: menu navigation, saving decks, starting another match, the tutorial and replay export. */
export function useMatchLifecycle(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame> &
    ReturnType<typeof useMatchHistory> &
    ReturnType<typeof useMatchCommands>,
) {
  const {
    collection,
    customDeck,
    deck,
    deckOptions,
    initial,
    leave,
    local,
    match,
    mode,
    onBegin,
    rewardId,
    savedDecks,
    screen,
    script,
    setActionCard,
    setConfirmConcede,
    setDraft,
    setEnergyFlights,
    setError,
    setHovered,
    setPanel,
    setPreview,
    setPreviewRequest,
    setSavedDecks,
    setScreen,
    setSelected,
    setSetupDeck,
    setStage,
    setTutorial,
    setupDeck,
    setupOpponent,
    state,
    viewer,
    watching,
  } = c;
  function navigate(next: Screen) {
    if (!local && next !== "match") {
      leave();
      return;
    }
    const apply = (fn: () => void) => (next === screen ? fn() : sceneTransition(fn));
    apply(() => {
      setScreen(next);
      setPanel(null);
      setActionCard(null);
      setSelected(null);
      setHovered(null);
      setPreviewRequest(null);
      setPreview(null);
      setDraft(null);
      setStage("none");
      setEnergyFlights([]);
    });
  }
  function saveDeck(next: CustomDeck): string | null {
    const decks = [...savedDecks.filter((d) => d.id !== next.id), structuredClone(next)];
    try {
      localStorage.setItem(decksKey, JSON.stringify(decks));
    } catch {
      return msg("Could not save. This browser’s storage is full or unavailable.");
    }
    setSavedDecks(decks);
    setSetupDeck(next.id);
    return null;
  }
  function deleteDeck(id: string): string | null {
    const decks = savedDecks.filter((d) => d.id !== id);
    try {
      localStorage.setItem(decksKey, JSON.stringify(decks));
    } catch {
      return msg("Could not save. This browser’s storage is full or unavailable.");
    }
    setSavedDecks(decks);
    if (setupDeck === id) setSetupDeck(defaultDeckId);
    return null;
  }
  function reset(
    isSkirmish: boolean,
    nextMode: Mode = mode,
    nextDeck: string = customDeck?.id ?? deck,
    nextSeed: number = randomSeed(),
    override?: CustomDeck,
    nextOpponent: string = setupOpponent,
  ) {
    if (!local) return;
    const custom =
      override ??
      savedDecks.find((d) => d.id === nextDeck) ??
      (customDeck?.id === nextDeck ? customDeck : undefined);
    const starter: DeckName = starterOptions.some((d) => d.id === nextDeck)
      ? nextDeck
      : defaultDeckId;
    const chosen = custom ?? starterOptions.find((d) => d.id === starter);
    if (chosen && missingDeckCopies(chosen.cards, collection.counts).length) {
      setError(msg("You do not own enough copies to play this deck."));
      return;
    }
    let next: GameState, chosenOpponent;
    try {
      chosenOpponent = deckOptions.find((d) => d.id === nextOpponent);
      next = startMatch(
        nextSeed,
        starter,
        isSkirmish,
        custom,
        undefined,
        chosenOpponent,
        getProfile().name,
        nextMode === "hotseat" ? undefined : getProfile().avatar,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : msg("This deck cannot start a match."));
      return;
    }
    onBegin({
      initial: next,
      mode: nextMode,
      deck: starter,
      skirmish: isSkirmish,
      customDeck: custom ? structuredClone(custom) : undefined,
      opponentDeck: chosenOpponent ? structuredClone(chosenOpponent) : undefined,
      rewardId: crypto.randomUUID(),
      rewardEligible: true,
    });
  }
  function startTutorialMatch() {
    if (!local) return;
    try {
      localStorage.setItem(tutorialKey, "started");
    } catch {
      /* Optional. */
    }
    onBegin(startTutorial());
  }
  function endTutorial(finished: boolean) {
    try {
      localStorage.setItem(tutorialKey, finished ? "done" : "skipped");
    } catch {
      /* Optional. */
    }
    if (script) script.active = false;
    setTutorial(false);
  }
  /** Saves what this seat saw, never more: the same file whether the match was local or online. */
  function exportReplay() {
    if (match.kind === "replay") return;
    try {
      const file = match.exportReplay(
          mode === "hotseat" ? viewer : "p1",
          rewardId ?? String(initial.seed),
        ),
        url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" })),
        a = document.createElement("a");
      a.href = url;
      a.download = `varhyr-replay-${file.matchId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("Could not save the replay."));
    }
  }
  /** Giving up is always allowed, even while the opponent is deciding. */
  function concede() {
    if (state.outcome || watching || match.kind === "replay") return;
    try {
      match.act({ type: "concede" }, viewer);
      setConfirmConcede(false);
      setPanel(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("Could not send the move."));
    }
  }
  return {
    navigate,
    saveDeck,
    deleteDeck,
    reset,
    startTutorialMatch,
    endTutorial,
    exportReplay,
    concede,
  };
}
