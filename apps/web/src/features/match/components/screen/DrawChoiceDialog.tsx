import { DrawChoice } from "../DrawChoice";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function DrawChoiceDialog() {
  const { covered, discardTop, reduced, send, thinking, view, watching, you } = useMatch();
  return (
    <>
      {!watching && view.pending?.kind === "draw" && !covered && !thinking && (
        <DrawChoice
          reduced={reduced}
          cards={(view.pending.options as string[]).map((id) => ({
            id,
            card: registry.cards[view.cards[id].definitionId],
          }))}
          discardCount={you.discard.length}
          discardTop={discardTop(you.discard)}
          libraryCount={you.deckCount}
          choose={(keep, other) =>
            send({ type: "choose", choiceId: view.pending!.id, option: keep, other })
          }
        />
      )}
    </>
  );
}
