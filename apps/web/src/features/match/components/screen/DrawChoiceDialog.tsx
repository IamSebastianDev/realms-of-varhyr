import { useLayoutEffect, useRef } from "react";
import { DrawChoice } from "../DrawChoice";
import { announceDraw } from "../../lib/drawFx";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function DrawChoiceDialog() {
  const { covered, discardTop, reduced, send, thinking, view, viewer, watching, you } = useMatch();
  const open = !watching && view.pending?.kind === "draw" && !covered && !thinking,
    pendingId = view.pending?.kind === "draw" ? view.pending.id : null,
    dealt = useRef<string | null>(null);
  // The cards fly in from the library when the dialog first shows, once per choice (not again after a look at the board).
  useLayoutEffect(() => {
    if (!open || !pendingId || reduced || dealt.current === pendingId) return;
    dealt.current = pendingId;
    const options = (view.pending!.options as string[]).filter((id) => view.cards[id]);
    announceDraw({
      id: `choice-${pendingId}`,
      player: viewer,
      cardIds: options,
      count: options.length,
      lead: 250,
    });
  }, [open, pendingId]); // eslint-disable-line react-hooks/exhaustive-deps
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
