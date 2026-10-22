import { Coach } from "../../../tutorial/Coach";
import { t as msg } from "@realms/ui/i18n";
import {
  opponentMoves,
  opponentNote,
  scriptFinished,
  tutorialSteps,
} from "../../../tutorial/tutorial";

import { useMatch } from "../../MatchContext";

export function TutorialCoach() {
  const {
    actor,
    botGate,
    coachNudge,
    commands,
    covered,
    endTutorial,
    historyIndex,
    navigate,
    screen,
    setTutorialStep,
    state,
    tutorial,
    tutorialStep,
  } = useMatch();
  return (
    <>
      {(() => {
        if (!tutorial || screen !== "match" || covered || state.outcome || historyIndex !== null)
          return null;
        const step = tutorialSteps[tutorialStep],
          progress = { index: tutorialStep, total: tutorialSteps.length };
        if (actor === "p2" && step.id !== "finish") {
          if (scriptFinished(opponentMoves(commands))) return null;
          const note = opponentNote(opponentMoves(commands));
          return (
            <Coach
              tone="opponent"
              title={note.title}
              text={note.text}
              progress={progress}
              focus={botGate ? [".primary-action"] : []}
              nudge={coachNudge}
              onSkip={() => endTutorial(false)}
            />
          );
        }
        const finish = step.id === "finish";
        return (
          <Coach
            tone={finish ? "finish" : "player"}
            title={step.title}
            text={step.text}
            progress={progress}
            focus={step.focus?.(state) ?? []}
            nudge={coachNudge}
            next={step.next}
            onNext={() => (finish ? endTutorial(true) : setTutorialStep((i) => i + 1))}
            secondary={finish ? msg("Main menu") : undefined}
            onSecondary={() => {
              endTutorial(true);
              navigate("menu");
            }}
            onSkip={() => endTutorial(false)}
          />
        );
      })()}
    </>
  );
}
