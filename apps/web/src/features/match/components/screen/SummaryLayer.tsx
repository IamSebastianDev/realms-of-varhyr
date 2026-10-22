import { MatchSummary } from "../MatchSummary";
import { collectionRules } from "../../../collection/lib/collection";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import { setWantsDraftScreen } from "../../../draft/stores/draftStore";
import { setWantsQuestScreen } from "../../../quest/stores/questStore";

import { useMatch } from "../../MatchContext";

export function SummaryLayer() {
  const {
    clash,
    collection,
    collectionSaved,
    covered,
    exportReplay,
    factionSymbol,
    historyIndex,
    historyLength,
    hotseat,
    leave,
    local,
    navigate,
    reduced,
    reset,
    rewardId,
    setHistoryIndex,
    setPanel,
    setup,
    state,
    viewer,
    watching,
  } = useMatch();
  return (
    <>
      {state.outcome &&
        !clash &&
        !covered &&
        (historyIndex === null || (watching && historyIndex >= historyLength)) && (
          <MatchSummary
            state={state}
            viewer={viewer}
            registry={registry}
            reduced={reduced}
            symbol={factionSymbol(viewer)}
            reward={
              !watching &&
              (hotseat ? state.outcome === "p1" : state.outcome === viewer) &&
              rewardId &&
              collection.rewardedMatches.includes(rewardId)
                ? {
                    crowns: collectionRules.victoryCrowns,
                    boosters: collectionRules.victoryBoosters,
                    saved: collectionSaved,
                  }
                : null
            }
            onMenu={() => {
              if (setup?.quest) {
                setWantsQuestScreen(true);
                leave();
              } else if (setup?.draft) {
                setWantsDraftScreen(true);
                leave();
              } else navigate("menu");
            }}
            menuLabel={setup?.draft ? msg("Back to the draft overview") : undefined}
            onAgain={local && !setup?.quest && !setup?.draft ? () => reset(false) : undefined}
            onExport={watching ? undefined : exportReplay}
            reviewLabel={watching ? msg("Watch again") : undefined}
            onReview={
              watching
                ? () => {
                    setHistoryIndex(0);
                  }
                : () => {
                    setHistoryIndex(historyLength);
                    setPanel("debug");
                  }
            }
          />
        )}
    </>
  );
}
