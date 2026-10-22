import { GameSetup } from "../GameSetup";
import { setActiveDraft } from "../../../draft/stores/draftStore";

import { useLobbyContext } from "../../LobbyContext.tsx";

export function SetupDialog() {
  const { navigate, ownedCopies, props, screen, setSetup, setSetupMode, setup } = useLobbyContext();
  return (
    <>
      {setup && (
        <GameSetup
          mode={setup}
          setMode={setSetupMode}
          close={() => {
            setSetup(null);
            if (screen === "multiplayer") navigate("menu");
          }}
          options={props.options}
          selected={props.selected}
          setSelected={props.setSelected}
          ownedCopies={ownedCopies}
          opponentId={props.opponentId}
          setOpponentId={props.setOpponentId}
          start={props.start}
          startQuest={() => {
            setSetup(null);
            navigate("quest");
          }}
          openDraft={(preset) => {
            setActiveDraft(preset);
            setSetup(null);
            navigate("draft");
          }}
          startSession={props.startSession}
        />
      )}
    </>
  );
}
