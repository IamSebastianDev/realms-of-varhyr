import { useEffect, useState } from "react";
import type { PlayerView } from "@realms/contracts";
import type { Forecast } from "@realms/multiplayer/protocol";
import type { MatchSession } from "./MatchSession";

/** What the attack being drafted would do, asked of whoever holds the real state (the host, exactly as it is online). */
export function useDraftForecast({
  match,
  view,
  attackers,
  draftLanes,
}: {
  match: MatchSession;
  view: PlayerView;
  attackers: string[];
  draftLanes: Record<string, number>;
}): Forecast {
  const [draftForecast, setDraftForecast] = useState<Forecast>(null);
  useEffect(() => {
    if (match.kind !== "live" || view.combat?.stage !== "declare" || !attackers.length) {
      setDraftForecast(null);
      return;
    }
    let stale = false;
    match.forecast({ attackers, lanes: draftLanes }).then(
      (next) => {
        if (!stale) setDraftForecast(next);
      },
      () => {
        if (!stale) setDraftForecast(null);
      },
    );
    return () => {
      stale = true;
    };
  }, [match, attackers, draftLanes, view.revision, view.combat?.stage]);
  return draftForecast;
}
