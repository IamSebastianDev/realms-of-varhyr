import { ArrowRight, Moon, Sparkles, Swords } from "lucide-react";
import { PhaseTransitionProgress } from "../PhaseTransitionProgress";
import { t as msg } from "@realms/ui/i18n";

import { CombatForecast } from "./CombatForecast";
import { useMatch } from "../../MatchContext";

export function PhaseAction() {
  const {
    advanceEnabled,
    botGate,
    mainLabel,
    phaseAdvance,
    phaseIndex,
    prompt,
    setDraft,
    setPreview,
    setPreviewRequest,
    setSelected,
    setStage,
    stage,
    thinking,
    transitioning,
  } = useMatch();
  return (
    <>
      <div className="floating-action">
        <div className="action-guidance">
          <p id="turn-guidance" role="status">
            {msg(prompt ?? "")}
          </p>
          {stage !== "none" && (
            <button
              className="outline-button"
              onClick={() => {
                setDraft(null);
                setStage("none");
                setSelected(null);
                setPreviewRequest(null);
                setPreview(null);
              }}
            >
              {msg("Cancel")}
            </button>
          )}
          <CombatForecast />
        </div>
        <button
          ref={phaseAdvance.buttonRef}
          className={`gold-button primary-action ${thinking ? "is-enemy" : ""} ${transitioning ? "is-transitioning" : ""}`}
          title={msg("{v0} (Space)", { v0: mainLabel })}
          aria-describedby={advanceEnabled ? "turn-guidance phase-shortcut-hint" : "turn-guidance"}
          aria-keyshortcuts="Space"
          aria-busy={transitioning || undefined}
          disabled={!advanceEnabled || transitioning}
          onClick={phaseAdvance.click}
        >
          <span className="phase-orbit" aria-hidden>
            {[Sparkles, Swords, Moon].map((Icon, n) => (
              <i
                key={n}
                className={`phase-bauble ${n === phaseIndex ? "is-now" : n < phaseIndex ? "is-done" : ""}`}
                style={{ ["--a" as string]: `${-150 + n * 60}deg` }}
              >
                <Icon size={13} strokeWidth={2.2} />
              </i>
            ))}
          </span>
          {thinking && !botGate ? (
            <>
              <span className="thinking-dots">···</span>
              {msg("Opponent’s turn")}
            </>
          ) : (
            <>
              <span className="phase-button-label">
                {mainLabel}
                <small id="phase-shortcut-hint">
                  {transitioning ? msg("Changing phase…") : msg("Space")}
                </small>
              </span>
              <ArrowRight size={17} />
            </>
          )}
          {phaseAdvance.transitionStartedAt !== null && (
            <PhaseTransitionProgress startedAt={phaseAdvance.transitionStartedAt} />
          )}
        </button>
      </div>
    </>
  );
}
