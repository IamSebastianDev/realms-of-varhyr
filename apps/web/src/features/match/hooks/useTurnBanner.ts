import { useEffect, useRef, useState } from "react";
import type { PlayerId, PlayerView } from "@realms/contracts";
import { t as msg } from "@realms/ui/i18n";

export type TurnBanner = { id: number; text: string; tone: "own" | "enemy" | "combat" };

/** The "Your turn" / "Opponent's turn" / "Combat" banner that flashes across the board when play passes. */
export function useTurnBanner({
  view,
  viewer,
  screen,
  historyIndex,
  covered,
  tutorial,
  reduced,
  clash,
}: {
  view: PlayerView;
  viewer: PlayerId;
  screen: string;
  historyIndex: number | null;
  covered: boolean;
  tutorial: boolean;
  reduced: boolean;
  clash: unknown;
}): TurnBanner | null {
  const [banner, setBanner] = useState<TurnBanner | null>(null),
    bannerSeen = useRef<{ turn: number; active: PlayerId; combat: boolean } | null>(null);
  useEffect(() => {
    const now = { turn: view.turn, active: view.active, combat: !!view.combat };
    const before = bannerSeen.current;
    bannerSeen.current = now;
    if (
      !before ||
      screen !== "match" ||
      historyIndex !== null ||
      covered ||
      tutorial ||
      reduced ||
      clash ||
      view.outcome
    )
      return;
    let next: { text: string; tone: "own" | "enemy" | "combat" } | null = null;
    if (now.active !== before.active || now.turn !== before.turn)
      next =
        now.active === viewer
          ? { text: msg("Your turn"), tone: "own" }
          : { text: msg("Opponent’s turn"), tone: "enemy" };
    else if (now.combat && !before.combat && view.combat?.stage === "declare")
      next = { text: msg("Combat"), tone: "combat" };
    if (!next) return;
    const id = Date.now();
    setBanner({ id, ...next });
    const t = setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 1500);
    return () => clearTimeout(t);
  }, [view.turn, view.active, view.combat?.stage]);
  return banner;
}
