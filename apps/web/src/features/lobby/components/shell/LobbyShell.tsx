import { LobbyHeader } from "./LobbyHeader";
import { ScreenBody } from "./ScreenBody";
import { TutorialOffer } from "./TutorialOffer";
import { SetupDialog } from "./SetupDialog";
import { BoosterDialog } from "./BoosterDialog";
import { CardInspector } from "./CardInspector";
import { useLobbyContext } from "../../LobbyContext.tsx";

export function LobbyShell() {
  const { isHome, screen } = useLobbyContext();
  return (
    <div className={`lobby ${isHome ? "menu-screen" : ""}`} data-screen={screen}>
      <div className="world-bg" />
      <div className="world-vignette" />
      <LobbyHeader />
      <ScreenBody />
      <TutorialOffer />
      <SetupDialog />
      <BoosterDialog />
      <CardInspector />
    </div>
  );
}
