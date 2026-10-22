import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function ConnectionStrip() {
  const { connection, match, online, watching } = useMatch();
  return (
    <>
      {online && !watching && (
        <div
          className={`online-connection-strip ${connection?.connected ? "connected" : "offline"}`}
          role="status"
        >
          <span className="online-status-dot" />
          <span>
            {msg("Room")} {connection?.code} ·{" "}
            {connection?.connected
              ? connection?.busy
                ? msg("Sending move…")
                : msg("Connected")
              : connection?.message}
          </span>
          {!connection?.connected && (
            <button onClick={() => match.kind === "live" && match.reconnect()}>
              {msg("Reconnect")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
