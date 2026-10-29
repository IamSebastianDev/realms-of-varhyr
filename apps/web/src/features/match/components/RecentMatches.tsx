import { useState } from "react";
import { Eye } from "lucide-react";
import { registry } from "@realms/content";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { recentMatches, replayOf, type RecentMatch } from "../lib/recentMatches";
import { ReplayMatchSession, type MatchSession } from "../session/MatchSession";

const results = {
  won: () => msg("Won"),
  lost: () => msg("Lost"),
  draw: () => msg("Draw"),
};
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The matches you finished lately, each one watchable again from where you sat. */
export function RecentMatches({ watch }: { watch: (session: MatchSession) => void }) {
  useLanguage();
  const [entries] = useState<RecentMatch[]>(() => recentMatches());
  const [error, setError] = useState("");
  const open = (entry: RecentMatch) => {
    try {
      setError("");
      watch(new ReplayMatchSession(replayOf(entry, registry)));
    } catch {
      setError(msg("This match can no longer be replayed."));
    }
  };
  return (
    <section className="settings-group recent-matches" aria-label={msg("Recent matches")}>
      <div>
        <h2>{msg("Recent matches")}</h2>
        {entries.length ? (
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <span className={`recent-result ${entry.result}`}>{results[entry.result]()}</span>
                <span className="recent-title">
                  {entry.deckName} · {entry.opponentName}
                </span>
                <small>
                  {msg("Turn")} {entry.turns} · {when(entry.at)}
                </small>
                <button className="outline-button" onClick={() => open(entry)}>
                  <Eye size={16} />
                  {msg("Watch")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{msg("Matches you finish on this device appear here.")}</p>
        )}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
