import { Menu, ScrollText } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import { phaseStatusLabel } from "../../lib/matchText";

import { useMatch } from "../../MatchContext";

export function TopBar() {
  const { logOpen, navigate, setLogOpen, setPanel, situation, view, viewer } = useMatch();
  return (
    <>
      <header className="topbar">
        <button
          className="brand"
          aria-label={msg("Realms of Varhyr home")}
          onClick={() => navigate("menu")}
        >
          <span className="brand-mark">
            V<span />
          </span>
          <span>
            <small>REALMS OF</small>
            <strong>VARHYR</strong>
          </span>
        </button>
        <div
          className="match-status"
          aria-label={msg("Turn {v0}, {v1} initiative", {
            v0: view.turn,
            v1: view.active === viewer ? "your" : "opponent’s",
          })}
        >
          <span>
            {msg("Turn")} {view.turn}
          </span>
          <i />
          <strong>{phaseStatusLabel(situation)}</strong>
        </div>
        <div className="match-corner">
          <button
            aria-pressed={logOpen}
            onClick={() => setLogOpen((open) => !open)}
            aria-label={logOpen ? msg("Hide battle log") : msg("Show battle log")}
            title={logOpen ? msg("Hide battle log") : msg("Show battle log")}
          >
            <ScrollText size={17} />
          </button>
          <button onClick={() => setPanel("menu")} aria-label={msg("Match menu")}>
            <Menu size={18} />
          </button>
        </div>
      </header>
    </>
  );
}
