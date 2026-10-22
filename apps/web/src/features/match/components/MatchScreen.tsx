import { useMatchController } from "../hooks/controller/useMatchController";
import { MatchProvider } from "../MatchContext";
import type { MatchScreenProps } from "../lib/matchTypes";
import { MatchView } from "./screen/MatchView";
import { MenuScreen } from "./screen/MenuScreen";

/** One match, from the first card to the summary. While the match is paused for a menu page it shows that page instead. */
export function MatchScreen(props: MatchScreenProps) {
  const controller = useMatchController(props);
  return (
    <MatchProvider value={controller}>
      {controller.screen === "match" ? <MatchView /> : <MenuScreen />}
    </MatchProvider>
  );
}
