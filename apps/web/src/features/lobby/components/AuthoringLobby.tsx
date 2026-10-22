import { sceneTransition } from "../../../lib/sceneTransition";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { usePreferences } from "@realms/ui/preferences";
import { useEffect, useState } from "react";
import { defaultDeckId } from "@realms/content";
import { Lobby } from "./Lobby";
import type { Screen } from "../lib/lobbyTypes";
import { setWantsQuestScreen, wantsQuestScreen } from "../../quest/stores/questStore";
import { setWantsDraftScreen, wantsDraftScreen } from "../../draft/stores/draftStore";
import { decksKey, parseDecks, starterOptions, type CustomDeck } from "../../decks/lib/decks";
import { randomSeed, startMatch, type MatchSetup } from "../../match/lib/session";
import { getProfile } from "../../profile/stores/profile";
import { startTutorial } from "../../tutorial/tutorial";
import { missingDeckCopies } from "../../collection/lib/collection";
import { useCollection } from "../../collection/stores/collectionStore";
import type { MatchSession } from "../../match/session/MatchSession";

/** Browsing/editing content must work even when no legal match can be created. */
export function AuthoringLobby({
  onStart,
  onSessionStart,
}: {
  onStart: (session: MatchSetup) => void;
  onSessionStart: (session: MatchSession, setup?: MatchSetup) => void;
}) {
  useLanguage();
  const { collection } = useCollection();
  const { reduced } = usePreferences();
  const [screen, setScreen] = useState<Exclude<Screen, "match">>(() => {
    if (wantsQuestScreen()) {
      setWantsQuestScreen(false);
      return "quest";
    }
    if (wantsDraftScreen()) {
      setWantsDraftScreen(false);
      return "draft";
    }
    return "menu";
  });
  const [decks, setDecks] = useState(() => {
    try {
      return parseDecks(localStorage.getItem(decksKey));
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState(defaultDeckId);
  const [opponentId, setOpponentId] = useState("auto");
  const [mode, setMode] = useState<MatchSetup["mode"]>("practice");
  const [error, setError] = useState("");
  const options = [...starterOptions, ...decks];
  useEffect(() => {
    setError("");
  }, [selected, screen]);

  function saveDeck(deck: CustomDeck): string | null {
    const next = [...decks.filter((saved) => saved.id !== deck.id), structuredClone(deck)];
    try {
      localStorage.setItem(decksKey, JSON.stringify(next));
    } catch {
      return msg("Could not save. This browser’s storage is full or unavailable.");
    }
    setDecks(next);
    setSelected(deck.id);
    return null;
  }

  function deleteDeck(id: string): string | null {
    const next = decks.filter((deck) => deck.id !== id);
    try {
      localStorage.setItem(decksKey, JSON.stringify(next));
    } catch {
      return msg("Could not save. This browser’s storage is full or unavailable.");
    }
    setDecks(next);
    if (selected === id) setSelected(defaultDeckId);
    return null;
  }

  function start(skirmish: boolean) {
    const customDeck = decks.find((deck) => deck.id === selected);
    const deck = customDeck ? defaultDeckId : selected;
    try {
      const chosen = options.find((option) => option.id === selected);
      if (chosen && missingDeckCopies(chosen.cards, collection.counts).length)
        throw new Error(msg("You do not own enough copies to play this deck."));
      const opponentDeck = options.find((option) => option.id === opponentId);
      const initial = startMatch(
        randomSeed(),
        deck,
        skirmish,
        customDeck,
        undefined,
        opponentDeck,
        getProfile().name,
        mode === "hotseat" ? undefined : getProfile().avatar,
      );
      onStart({
        initial,
        mode,
        deck,
        skirmish,
        customDeck,
        opponentDeck: opponentDeck && structuredClone(opponentDeck),
        rewardId: crypto.randomUUID(),
        rewardEligible: true,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("This deck cannot start a match."));
    }
  }

  return (
    <>
      <Lobby
        reduced={reduced}
        screen={screen}
        navigate={(next) => {
          if (next !== "match" && next !== screen) sceneTransition(() => setScreen(next));
        }}
        canResume={false}
        resumeLabel=""
        decks={decks}
        options={options}
        saveDeck={saveDeck}
        deleteDeck={deleteDeck}
        mode={mode}
        setMode={setMode}
        selected={selected}
        setSelected={setSelected}
        opponentId={opponentId}
        setOpponentId={setOpponentId}
        start={start}
        startSession={onSessionStart}
        learn={() => onStart(startTutorial())}
        beginMatch={onStart}
        questFight={false}
      />
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
