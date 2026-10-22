import { Lobby } from "../../../lobby/components/Lobby";
import type { Screen } from "../../../lobby/lib/lobbyTypes";
import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function MenuScreen() {
  const {
    deckOptions,
    deleteDeck,
    error,
    navigate,
    onAttach,
    onBegin,
    reduced,
    reset,
    saveDeck,
    savedDecks,
    screen,
    setSetupDeck,
    setSetupMode,
    setSetupOpponent,
    setup,
    setupDeck,
    setupMode,
    setupOpponent,
    startTutorialMatch,
    state,
  } = useMatch();
  return (
    <>
      <>
        <Lobby
          reduced={reduced}
          screen={screen as Exclude<Screen, "match">}
          navigate={navigate}
          canResume={!state.outcome}
          resumeLabel={msg("Turn {v0} · {v1}", { v0: state.turn, v1: state.players.p1.name })}
          decks={savedDecks}
          options={deckOptions}
          saveDeck={saveDeck}
          deleteDeck={deleteDeck}
          mode={setupMode}
          setMode={setSetupMode}
          selected={setupDeck}
          setSelected={setSetupDeck}
          opponentId={setupOpponent}
          setOpponentId={setSetupOpponent}
          start={(isSkirmish) => reset(isSkirmish, setupMode, setupDeck)}
          startSession={onAttach}
          learn={startTutorialMatch}
          beginMatch={onBegin}
          questFight={!!setup?.quest && !state.outcome}
          draftFight={!!setup?.draft && !state.outcome}
        />
        {error && (
          <div className="toast" role="alert">
            {msg(error)}
          </div>
        )}
      </>
    </>
  );
}
