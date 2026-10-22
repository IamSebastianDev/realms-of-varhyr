import type { LobbyProps } from "../../lib/lobbyTypes";
import { useLobbyNavigation } from "./useLobbyNavigation";
import { useLobbyCollection } from "./useLobbyCollection";
import { useLobbyDeck } from "./useLobbyDeck";

/** Everything the menu shell knows and can do, built from small hooks that each add to the result of the previous ones. */
export function useLobby(props: LobbyProps) {
  const c0 = useLobbyNavigation(props);
  const c1 = { ...c0, ...useLobbyCollection(c0) };
  const c2 = { ...c1, ...useLobbyDeck(c1) };
  return c2;
}

export type LobbyController = ReturnType<typeof useLobby>;
