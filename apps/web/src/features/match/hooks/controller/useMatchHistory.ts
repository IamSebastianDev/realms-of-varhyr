import { useCallback, useEffect } from "react";

import type { useMatchBasics } from "./useMatchBasics";
import type { useMatchUiState } from "./useMatchUiState";
import type { useMatchFrame } from "./useMatchFrame";

/** Stepping through a finished or ongoing match, and the replay autoplay timer. */
export function useMatchHistory(
  c: ReturnType<typeof useMatchBasics> &
    ReturnType<typeof useMatchUiState> &
    ReturnType<typeof useMatchFrame>,
) {
  const {
    autoplay,
    clash,
    historyIndex,
    historyLength,
    match,
    present,
    reduced,
    sessionSnapshot,
    setAutoplay,
    setHistoryIndex,
    setSelected,
    stepping,
    viewer,
  } = c;
  /** Every session supplies review frames; a single step forward also presents that exchange. */
  const stepTo = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(target, historyLength)),
        from = Math.min(historyIndex ?? historyLength, historyLength);
      if (next === from) return;
      if (next === from + 1) {
        const before = match.frame(from, viewer),
          after = match.frame(next, viewer),
          seen = before.view.events.at(-1)?.seq ?? 0;
        stepping.current = true;
        present(
          before.state,
          after.state,
          after.view.events.filter((event) => event.seq > seen),
          `replay-${next}`,
        );
      }
      setHistoryIndex(next);
      setSelected(null);
    },
    [match, sessionSnapshot, historyLength, historyIndex, viewer, present],
  );
  useEffect(() => {
    if (!autoplay || historyIndex === null || clash) return;
    if (historyIndex >= historyLength) {
      setAutoplay(false);
      return;
    }
    const timer = setTimeout(() => stepTo(historyIndex + 1), reduced ? 500 : 1300);
    return () => clearTimeout(timer);
  }, [autoplay, historyIndex, historyLength, clash, stepTo, reduced]);
  return { stepTo };
}
