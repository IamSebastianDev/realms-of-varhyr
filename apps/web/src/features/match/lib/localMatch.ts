import { BrowserBot } from "./browserBot";
import { registry } from "@realms/content";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { opponentCommand, opponentMoves } from "../../tutorial/tutorial";
import type { MatchSetup } from "./session";
import { trackSavedMatch, type SavedMatch } from "./savedMatch";
import { LiveMatchSession } from "../session/MatchSession";
import { LoopbackRoom, type Opponent } from "../session/LoopbackRoom";

/** Tutorial progress shared between the screen and the scripted opponent. */
export type TutorialScript = { active: boolean };

/** A match on this machine: the online host's authority, with the other seat played in-process (or shared on screen).
 * Given a saved match it continues from its last move. Every match but the tutorial is saved as it is played. */
export function createLocalMatch(
  setup: MatchSetup,
  reduced = false,
  saved?: Pick<SavedMatch, "matchId" | "commands">,
): { session: LiveMatchSession; script: TutorialScript } {
  const script: TutorialScript = { active: !!setup.tutorial };
  const bot = setup.mode === "hotseat" ? null : new BrowserBot(registry);
  const authority = saved
    ? MatchAuthority.resume(registry, saved.matchId, setup.initial, saved.commands)
    : new MatchAuthority(registry, crypto.randomUUID(), setup.initial);
  const opponent: Opponent | undefined =
    setup.mode === "hotseat"
      ? undefined
      : {
          seat: "p2",
          play: (state, log) =>
            (script.active ? opponentCommand(state, opponentMoves(log)) : null) ??
            bot!.choose(state),
          delay: (state) => (state.combat?.stage === "review" ? 1800 : reduced ? 130 : 650),
          dispose: () => bot!.dispose(),
        };
  const session = new LiveMatchSession(new LoopbackRoom(authority, opponent));
  if (!setup.tutorial) trackSavedMatch(session, setup);
  return { session, script };
}
