import { useSyncExternalStore } from "react";
import type { MatchSession } from "../session/MatchSession";
const noSubscription = () => () => {};
const emptySnapshot = () => null;
export function useMatchSession(session: MatchSession): ReturnType<MatchSession["getSnapshot"]>;
export function useMatchSession(
  session: MatchSession | null,
): ReturnType<MatchSession["getSnapshot"]> | null;
export function useMatchSession(session: MatchSession | null) {
  return useSyncExternalStore(
    session?.subscribe ?? noSubscription,
    session?.getSnapshot ?? emptySnapshot,
    session?.getSnapshot ?? emptySnapshot,
  );
}
