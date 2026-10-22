import { PilePicker } from "../PilePicker";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function RaisePicker() {
  const {
    covered,
    live,
    reduced,
    sendTarget,
    setDraft,
    setSelected,
    setStage,
    stage,
    targets,
    view,
  } = useMatch();
  return (
    <>
      {live &&
        stage === "target" &&
        !covered &&
        targets.length > 0 &&
        view.cards[targets[0]]?.zone === "discard" && (
          <PilePicker
            reduced={reduced}
            title={msg("Choose a creature to raise")}
            cards={targets.map((id) => ({ id, card: registry.cards[view.cards[id].definitionId] }))}
            choose={sendTarget}
            cancel={() => {
              setDraft(null);
              setStage("none");
              setSelected(null);
            }}
          />
        )}
    </>
  );
}
