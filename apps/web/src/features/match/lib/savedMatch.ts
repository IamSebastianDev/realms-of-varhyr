import type { CommandEnvelope, GameState } from "@realms/contracts";
import { RULES_VERSION, replay } from "@realms/core";
import { registry } from "@realms/content";
import type { MatchSetup } from "./session";
import type { LiveMatchSession } from "../session/MatchSession";

/** The match in progress on this machine. One slot: starting another match replaces it. */
export const savedMatchKey = "varhyr-saved-match-v1";

export type SavedMatch = {
  version: 1;
  rules: string;
  content: string;
  matchId: string;
  savedAt: string;
  /** How the match began, including its start position; the rest is the command log. */
  setup: MatchSetup;
  commands: CommandEnvelope[];
};

/** A saved match together with the position its commands lead to. */
export type ResumableMatch = { saved: SavedMatch; state: GameState };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The saved match if it is whole, belongs to this build and still replays to a position that is not over. */
export function parseSavedMatch(text: string | null): ResumableMatch | null {
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (
      !isObject(data) ||
      data.version !== 1 ||
      data.rules !== RULES_VERSION ||
      data.content !== registry.version ||
      typeof data.matchId !== "string" ||
      !Array.isArray(data.commands) ||
      !isObject(data.setup) ||
      !isObject(data.setup.initial)
    )
      return null;
    const saved = data as SavedMatch;
    const state: GameState = replay(saved.setup.initial, saved.commands, registry);
    return state.outcome ? null : { saved, state };
  } catch {
    return null;
  }
}

export function loadSavedMatch(): ResumableMatch | null {
  try {
    const found = parseSavedMatch(localStorage.getItem(savedMatchKey));
    if (!found) clearSavedMatch();
    return found;
  } catch {
    return null;
  }
}

/** Forget the saved match; with an id, only if that match is the one saved. */
export function clearSavedMatch(matchId?: string) {
  try {
    if (matchId) {
      const stored = localStorage.getItem(savedMatchKey);
      if (!stored || (JSON.parse(stored) as { matchId?: unknown }).matchId !== matchId) return;
    }
    localStorage.removeItem(savedMatchKey);
  } catch {
    /* Storage is optional; the match itself is unaffected. */
  }
}

/** Keep the saved match current: written after every accepted move, removed when the match ends. */
export function trackSavedMatch(session: LiveMatchSession, setup: MatchSetup) {
  let written = -1;
  const save = () => {
    const { matchId, revision, commands, state } = session.getSnapshot();
    if (revision === written) return;
    written = revision;
    if (state.outcome) {
      clearSavedMatch(matchId);
      return;
    }
    const entry: SavedMatch = {
      version: 1,
      rules: RULES_VERSION,
      content: registry.version,
      matchId,
      savedAt: new Date().toISOString(),
      setup,
      commands: [...commands],
    };
    try {
      localStorage.setItem(savedMatchKey, JSON.stringify(entry));
    } catch {
      /* A full or blocked store only costs resumability. */
    }
  };
  save();
  session.subscribe(save);
}
