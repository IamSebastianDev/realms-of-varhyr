import { DraftPage } from "../../draft/components/DraftPage";
import { QuestPage } from "../../quest/components/QuestPage";
import { useLobby } from "../hooks/lobby/useLobby";
import { LobbyProvider } from "../LobbyContext";
import type { LobbyProps } from "../lib/lobbyTypes";
import { LobbyShell } from "./shell/LobbyShell";

/** The menu: the home page, your decks, packs, the store and the rest. The draft and the quest take the whole window instead. */
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
  if (props.screen === "quest")
    return (
      <QuestPage
        reduced={props.reduced}
        leave={() => navigate("menu")}
        liveMatch={props.questFight}
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
