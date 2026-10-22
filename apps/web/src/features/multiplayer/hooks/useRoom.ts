import { useSyncExternalStore } from "react";
import type { RtcRoom, RoomState } from "../lib/RtcRoom";
const empty: RoomState = {
  role: "host",
  code: "",
  phase: "closed",
  connected: false,
  busy: false,
  message: "",
  snapshot: null,
};
const noSubscription = () => () => {};
const emptySnapshot = () => empty;
export function useRoom(room?: RtcRoom | null) {
  return useSyncExternalStore(
    room?.subscribe ?? noSubscription,
    room?.getSnapshot ?? emptySnapshot,
    room?.getSnapshot ?? emptySnapshot,
  );
}
