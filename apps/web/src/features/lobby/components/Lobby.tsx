import { DraftPage } from "../../draft/components/DraftPage";
import { AdventurePage } from "../../adventure/components/AdventurePage";
import { useLobby } from "../hooks/lobby/useLobby";
import { LobbyProvider } from "../LobbyContext";
import type { LobbyProps } from "../lib/lobbyTypes";
import { LobbyShell } from "./shell/LobbyShell";

/** The menu: the home page, your decks, packs, the store and the rest. The draft and the adventure take the whole window instead. */
export function Lobby(props: LobbyProps) {
  const lobby = useLobby(props);
  const { navigate } = lobby;
  if (props.screen === "draft")
    return (
      <DraftPage
        reduced={props.reduced}
        leave={() => navigate("menu")}
        liveMatch={!!props.draftFight}
        resume={() => navigate("match")}
        beginFight={props.beginMatch}
        attachMatch={props.startSession}
      />
    );
  if (props.screen === "adventure")
    return (
      <AdventurePage
        reduced={props.reduced}
        leave={() => navigate("menu")}
        liveMatch={props.adventureFight}
        resume={() => navigate("match")}
        beginFight={props.beginMatch}
      />
    );
  return (
    <LobbyProvider value={lobby}>
      <LobbyShell />
    </LobbyProvider>
  );
}
