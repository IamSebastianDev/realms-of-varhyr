import { createContext, useContext, type ReactNode } from "react";
import type { LobbyController } from "./hooks/lobby/useLobby";

const LobbyContext = createContext<LobbyController | null>(null);

export function LobbyProvider({
  value,
  children,
}: {
  value: LobbyController;
  children: ReactNode;
}) {
  return <LobbyContext.Provider value={value}>{children}</LobbyContext.Provider>;
}

/** The menu shell: which page is open, the deck being edited, the collection and the dialogs above them. */
export function useLobbyContext(): LobbyController {
  const ctl = useContext(LobbyContext);
  if (!ctl) throw new Error("useLobbyContext must be used inside a LobbyProvider.");
  return ctl;
}
