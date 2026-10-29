import { useRef, useState } from "react";
import { useLanguage } from "@realms/ui/i18n";
import { usePreferences } from "@realms/ui/preferences";
import { AuthoringLobby } from "../features/lobby/components/AuthoringLobby";
import { MatchScreen } from "../features/match/components/MatchScreen";
import { ResumeMatchDialog } from "../features/match/components/ResumeMatchDialog";
import { createLocalMatch } from "../features/match/lib/localMatch";
import type { LiveMatch } from "../features/match/lib/matchTypes";
import { clearSavedMatch, loadSavedMatch } from "../features/match/lib/savedMatch";
import type { MatchSetup } from "../features/match/lib/session";
import type { MatchSession } from "../features/match/session/MatchSession";
import { Onboarding } from "../features/onboarding/components/Onboarding";
import { hasAccount } from "../features/onboarding/lib/onboardingState";
import { sceneTransition } from "../lib/sceneTransition";
import { CardStylesProvider } from "./providers/CardStylesProvider";

/** Chooses what fills the window: first-run onboarding, the lobby, or the match in progress. */
export function App() {
  useLanguage();
  const { reduced } = usePreferences();
  const [onboarded, setOnboarded] = useState(hasAccount);
  const [live, setLive] = useState<LiveMatch | null>(null);
  // A match left unfinished by a reload, read once when the page opens.
  const [unfinished, setUnfinished] = useState(() => (hasAccount() ? loadSavedMatch() : null));
  const liveRef = useRef(live);
  liveRef.current = live;
  const replace = (next: LiveMatch | null) => {
    liveRef.current?.match.leave();
    sceneTransition(() => setLive(next));
  };
  const begin = (setup: MatchSetup) => {
    const { session, script } = createLocalMatch(setup, reduced);
    replace({ match: session, setup, script });
  };
  const attach = (session: MatchSession, setup?: MatchSetup) => replace({ match: session, setup });
  /** Carry the interrupted match on, or concede it: the same loss as giving up in the match, so results are recorded. */
  const settle = (concede: boolean) => {
    const found = unfinished;
    setUnfinished(null);
    if (!found) return;
    try {
      const { session, script } = createLocalMatch(found.saved.setup, reduced, found.saved);
      if (concede) session.act({ type: "concede" });
      replace({ match: session, setup: found.saved.setup, script });
    } catch {
      clearSavedMatch(found.saved.matchId);
    }
  };
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;
  return (
    <CardStylesProvider>
      {!live ? (
        <>
          <AuthoringLobby onStart={begin} onSessionStart={attach} />
          {unfinished && (
            <ResumeMatchDialog
              state={unfinished.state}
              hotseat={unfinished.saved.setup.mode === "hotseat"}
              onContinue={() => settle(false)}
              onConcede={() => settle(true)}
            />
          )}
        </>
      ) : (
        <MatchScreen
          key={live.match.getSnapshot().matchId}
          {...live}
          leave={() => replace(null)}
          onBegin={begin}
          onAttach={attach}
        />
      )}
    </CardStylesProvider>
  );
}
