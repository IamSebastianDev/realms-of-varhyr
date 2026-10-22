import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function ReplayBar() {
  const {
    autoplay,
    historyIndex,
    historyLength,
    leave,
    setAutoplay,
    setHistoryIndex,
    stepTo,
    watching,
  } = useMatch();
  return (
    <>
      {historyIndex !== null && (
        <div className={`replay-bar ${watching ? "watching" : ""}`}>
          <Eye size={16} />
          <span>
            {watching ? msg("Replay") : msg("Viewing")} {msg("· step")} {historyIndex} {msg("of")}{" "}
            {historyLength}
          </span>
          {watching && (
            <span className="replay-controls">
              <button
                aria-label={msg("First step")}
                disabled={historyIndex === 0}
                onClick={() => {
                  setAutoplay(false);
                  stepTo(0);
                }}
              >
                <SkipBack size={14} />
              </button>
              <button
                aria-label={msg("Previous step")}
                disabled={historyIndex === 0}
                onClick={() => {
                  setAutoplay(false);
                  stepTo(historyIndex - 1);
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="replay-play"
                aria-label={autoplay ? msg("Pause") : msg("Play")}
                onClick={() => {
                  if (historyIndex >= historyLength) stepTo(0);
                  setAutoplay((a) => !a);
                }}
              >
                {autoplay ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                aria-label={msg("Next step")}
                disabled={historyIndex >= historyLength}
                onClick={() => {
                  setAutoplay(false);
                  stepTo(historyIndex + 1);
                }}
              >
                <ChevronRight size={15} />
              </button>
              <button
                aria-label={msg("Last step")}
                disabled={historyIndex >= historyLength}
                onClick={() => {
                  setAutoplay(false);
                  stepTo(historyLength);
                }}
              >
                <SkipForward size={14} />
              </button>
            </span>
          )}
          {watching ? (
            <button onClick={() => leave()}>
              {msg("Close replay")}
              <X size={13} />
            </button>
          ) : (
            <button onClick={() => setHistoryIndex(null)}>
              {msg("Return to live match")}
              <Play size={13} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
