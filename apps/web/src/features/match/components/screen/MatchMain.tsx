import { BattleLog } from "../BattleLog";

import { OpponentBanner } from "./OpponentBanner";
import { OwnBanner } from "./OwnBanner";
import { PhaseAction } from "./PhaseAction";
import { BoardScene } from "./BoardScene";
import { useMatch } from "../../MatchContext";

export function MatchMain() {
  const { logOpen, setLogOpen, view, viewer } = useMatch();
  return (
    <main className={`arena-shell ${logOpen ? "with-log" : ""}`}>
      <section className="battlefield">
        <OpponentBanner />
        <BoardScene />
        <OwnBanner />
        <PhaseAction />
      </section>
      {logOpen && (
        <BattleLog
          events={view.events}
          cards={view.cards}
          viewer={viewer}
          onClose={() => setLogOpen(false)}
        />
      )}
    </main>
  );
}
