import { botCommand } from "@realms/core/bot";
import { registry } from "@realms/content";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { opponentCommand, opponentMoves } from "../../tutorial/tutorial";
import type { MatchSetup } from "./session";
import { LiveMatchSession } from "../session/MatchSession";
import { LoopbackRoom, type Opponent } from "../session/LoopbackRoom";

/** Tutorial progress shared between the screen and the scripted opponent. */
export type TutorialScript = { active: boolean };

/** A match on this machine: the online host's authority, with the other seat played in-process (or shared on screen). */
export function createLocalMatch(
  setup: MatchSetup,
  reduced = false,
): { session: LiveMatchSession; script: TutorialScript } {
  const script: TutorialScript = { active: !!setup.tutorial };
  const authority = new MatchAuthority(registry, crypto.randomUUID(), setup.initial);
  const opponent: Opponent | undefined =
    setup.mode === "hotseat"
      ? undefined
      : {
          seat: "p2",
          play: (state, log) =>
            (script.active ? opponentCommand(state, opponentMoves(log)) : null) ??
            botCommand(state, registry),
          delay: (state) => (state.combat?.stage === "review" ? 1800 : reduced ? 130 : 650),
        };
  return { session: new LiveMatchSession(new LoopbackRoom(authority, opponent)), script };
}
