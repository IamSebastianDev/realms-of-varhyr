import { type Screen } from "../../lib/lobbyTypes";
import { type SetupMode } from "../../components/GameSetup";
import { tutorialKey } from "../../../tutorial/tutorial";
import { useAudio } from "../../../../app/providers/AudioProvider";
import { useEffect, useRef, useState } from "react";
import { type LobbyProps } from "../../lib/lobbyTypes";

/** Moving between pages, the first-run tutorial offer and the game setup dialog. */
export function useLobbyNavigation(props: LobbyProps) {
  const { screen, canResume } = props;
  const { playEffect } = useAudio();
  // Changing scene in the menu has its own sound; nothing else in the interface does.
  /** The deck builder holds a move away from it while the deck has unsaved changes. */
  const builderGuard = useRef<((proceed: () => void) => boolean) | null>(null);
  const navigate = (next: Screen) => {
    const go = () => {
      if (next !== screen && next !== "match") playEffect("ui.scene");
      props.navigate(next);
    };
    if (screen === "builder" && next !== "builder" && builderGuard.current?.(go)) return;
    go();
  };
  // New players are offered the tutorial once. Any answer, or having a match under way, settles it.
  const [offer, setOffer] = useState(() => {
    try {
      return screen === "menu" && !canResume && !localStorage.getItem(tutorialKey);
    } catch {
      return false;
    }
  });
  function settleOffer(value: string) {
    try {
      localStorage.setItem(tutorialKey, value);
    } catch {
      /* Optional. */
    }
    setOffer(false);
  }
  const [setup, setSetup] = useState<SetupMode | null>(screen === "multiplayer" ? "online" : null);
  const setupOrigin = useRef<HTMLElement | null>(null);
  const isHome = screen === "menu" || screen === "multiplayer";
  function openSetup(mode: SetupMode) {
    setupOrigin.current = document.activeElement as HTMLElement;
    if (!isHome) navigate("menu");
    setSetup(mode);
  }
  useEffect(() => {
    if (!setup) {
      setupOrigin.current?.focus();
      setupOrigin.current = null;
    }
  }, [setup]);
  function setSetupMode(mode: SetupMode) {
    setSetup(mode);
    if (mode === "practice" || mode === "hotseat") props.setMode(mode);
  }
  useEffect(() => {
    if (screen === "multiplayer") setSetup("online");
    else if (screen !== "menu") setSetup(null);
  }, [screen]);
  return {
    props,
    screen,
    canResume,
    builderGuard,
    navigate,
    offer,
    settleOffer,
    setup,
    setSetup,
    isHome,
    openSetup,
    setSetupMode,
  };
}
