import { useRef, useState } from "react";
import { useLanguage } from "@realms/ui/i18n";
import { usePreferences } from "@realms/ui/preferences";
import { AuthoringLobby } from "../features/lobby/components/AuthoringLobby";
import { MatchScreen } from "../features/match/components/MatchScreen";
import { createLocalMatch } from "../features/match/lib/localMatch";
import type { LiveMatch } from "../features/match/lib/matchTypes";
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
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;
  return (
    <CardStylesProvider>
      {!live ? (
        <AuthoringLobby onStart={begin} onSessionStart={attach} />
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
