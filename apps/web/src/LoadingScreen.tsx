import { useEffect, useState } from "react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { preloadAssets, type PreloadProgress } from "./preloadAssets";

/** Covers the app while art loads, then fades away. Never blocks for long: preloading has a time limit. */
export function LoadingScreen() {
  useLanguage();
  const [progress, setProgress] = useState<PreloadProgress>({
    done: 0,
    total: 1,
    label: msg("Loading"),
  });
  const [phase, setPhase] = useState<"loading" | "leaving" | "gone">("loading");
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData) {
      setPhase("gone");
      return;
    }
    let alive = true;
    const minimum = new Promise((resolve) => setTimeout(resolve, 900));
    void Promise.all([
      preloadAssets((next) => {
        if (alive) setProgress(next);
      }),
      minimum,
    ]).then(() => {
      if (alive) setPhase("leaving");
    });
    return () => {
      alive = false;
    };
  }, []);
  if (phase === "gone") return null;
  const ratio = progress.total ? Math.min(1, progress.done / progress.total) : 0;
  return (
    <div
      className="loading-screen"
      data-phase={phase}
      role="status"
      aria-live="polite"
      onTransitionEnd={(event) => {
        if (phase === "leaving" && event.target === event.currentTarget) setPhase("gone");
      }}
    >
      <div className="loading-center">
        <svg className="loading-mark" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="loading-ring" cx="60" cy="60" r="52" pathLength="100" />
          <path className="loading-v" d="M32 34 L60 90 L88 34" pathLength="100" />
          <path className="loading-v-inner" d="M46 34 L60 62 L74 34" pathLength="100" />
        </svg>
        <h1>Realms of Varhyr</h1>
        <div
          className="loading-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <i style={{ transform: `scaleX(${ratio})` }} />
        </div>
        <p>
          {phase === "leaving" ? msg("Ready") : `${progress.label} · ${Math.round(ratio * 100)}%`}
        </p>
      </div>
    </div>
  );
}
