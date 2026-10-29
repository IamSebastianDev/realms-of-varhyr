import type { CommandEnvelope, GameState, PlayerId, Registry } from "@realms/contracts";
import { RULES_VERSION } from "@realms/core";
import { registry } from "@realms/content";
import { MatchAuthority } from "@realms/multiplayer/authority";
import type { MatchSnapshot } from "@realms/multiplayer/protocol";
import { onlineReplay, type ReplayFile } from "./replayFile";

/**
 * The last few matches played on this machine, kept whole enough to watch again: the start position and every command.
 * The replay is recomputed from those, so a stored match is a few tens of kilobytes rather than a recording of every board.
 */
export const recentMatchesKey = "varhyr-recent-matches-v1";
export const MAX_RECENT_MATCHES = 12;

export type RecentMatch = {
  id: string;
  /** ISO time the match finished. */
  at: string;
  rules: string;
  content: string;
  /** The seat the replay is seen from. */
  seat: PlayerId;
  deckName: string;
  opponentName: string;
  mode: "practice" | "hotseat" | "quest" | "draft";
  result: "won" | "lost" | "draw";
  turns: number;
  initial: GameState;
  commands: CommandEnvelope[];
};

const isEntry = (value: unknown): value is RecentMatch => {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<RecentMatch>;
  return (
    typeof m.id === "string" &&
    typeof m.at === "string" &&
    typeof m.deckName === "string" &&
    typeof m.opponentName === "string" &&
    (m.seat === "p1" || m.seat === "p2") &&
    (m.result === "won" || m.result === "lost" || m.result === "draw") &&
    typeof m.turns === "number" &&
    Array.isArray(m.commands) &&
    !!m.initial &&
    typeof m.initial === "object"
  );
};

function read(): RecentMatch[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(recentMatchesKey) ?? "[]");
    return Array.isArray(data) ? data.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Newest first. Matches from another rules or content version cannot be replayed on this build and are left out. */
export function recentMatches(content = registry.version): RecentMatch[] {
  return read().filter((m) => m.rules === RULES_VERSION && m.content === content);
}

/** Keep a finished match. The oldest fall off first, and a full store drops more of them rather than failing. */
export function saveRecentMatch(entry: RecentMatch) {
  let kept = [entry, ...read().filter((m) => m.id !== entry.id)].slice(0, MAX_RECENT_MATCHES);
  while (kept.length) {
    try {
      localStorage.setItem(recentMatchesKey, JSON.stringify(kept));
      return;
    } catch {
      kept = kept.slice(0, -1);
    }
  }
}

export function clearRecentMatches() {
  try {
    localStorage.removeItem(recentMatchesKey);
  } catch {
    /* Nothing to forget. */
  }
}

/** The replay of a stored match: the same file a player could export, seen from the stored seat. Throws if it no longer plays out. */
export function replayOf(entry: RecentMatch, reg: Registry = registry): ReplayFile {
  const authority = new MatchAuthority(reg, entry.id, entry.initial);
  const steps: MatchSnapshot[] = [authority.snapshot(entry.seat)];
  for (const envelope of entry.commands) {
    const result = authority.act(envelope.actor, {
      id: crypto.randomUUID(),
      revision: authority.snapshot(envelope.actor).view.revision,
      intent: { kind: "command", command: envelope.command },
    });
    if (result.error) throw new Error(result.error);
    steps.push(authority.snapshot(entry.seat));
  }
  return onlineReplay(steps, entry.seat);
}
