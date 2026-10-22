import type { MatchScreenProps } from "../../lib/matchTypes";
import { useMatchBasics } from "./useMatchBasics";
import { useMatchUiState } from "./useMatchUiState";
import { useMatchFrame } from "./useMatchFrame";
import { useMatchHistory } from "./useMatchHistory";
import { useMatchCommands } from "./useMatchCommands";
import { useMatchLifecycle } from "./useMatchLifecycle";
import { useMatchPlay } from "./useMatchPlay";
import { useMatchPreview } from "./useMatchPreview";
import { useMatchActions } from "./useMatchActions";
import { useMatchDrag } from "./useMatchDrag";
import { useMatchBoard } from "./useMatchBoard";
import { useMatchOverlays } from "./useMatchOverlays";
import { useMatchHud } from "./useMatchHud";

/** Everything the match screen knows and can do, built from small hooks that each add to the result of the previous ones. */
export function useMatchController(props: MatchScreenProps) {
  const c0 = useMatchBasics(props);
  const c1 = { ...c0, ...useMatchUiState(c0) };
  const c2 = { ...c1, ...useMatchFrame(c1) };
  const c3 = { ...c2, ...useMatchHistory(c2) };
  const c4 = { ...c3, ...useMatchCommands(c3) };
  const c5 = { ...c4, ...useMatchLifecycle(c4) };
  const c6 = { ...c5, ...useMatchPlay(c5) };
  const c7 = { ...c6, ...useMatchPreview(c6) };
  const c8 = { ...c7, ...useMatchActions(c7) };
  const c9 = { ...c8, ...useMatchDrag(c8) };
  const c10 = { ...c9, ...useMatchBoard(c9) };
  const c11 = { ...c10, ...useMatchOverlays(c10) };
  const c12 = { ...c11, ...useMatchHud(c11) };
  return c12;
}

export type MatchController = ReturnType<typeof useMatchController>;
