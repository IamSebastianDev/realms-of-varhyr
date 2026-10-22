import { type CardDefinition } from "@realms/contracts";
import { CardHoverButton } from "@realms/ui/CardPresentation";
import { Minus, Plus } from "lucide-react";
import { cardCost } from "../../lib/deckTools";
import { deckCardAvailability } from "../../lib/decks";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function DeckRow({
  card,
  count,
  unowned,
}: {
  card: CardDefinition;
  count: number;
  unowned: boolean;
}) {
  const { add, draft, drag, endDrag, inspect, ownedCopies, remove, startDrag } =
    useDeckBuilderContext();
  const availability = deckCardAvailability(draft.cards, card.id, registry);
  const ownedAll = !unowned && count >= (ownedCopies[card.id] ?? 0);
  const reason = availability.limitReached
    ? msg("Deck limit reached ({v0})", { v0: availability.limit })
    : !availability.owned
      ? msg("No copies owned")
      : msg("All owned copies are in this deck");
  return (
    <li
      key={`${card.id}${unowned ? ":unowned" : ""}`}
      className={`dk-row ${card.legendary ? "is-legendary" : ""} ${unowned ? "not-owned" : ""} ${drag?.id === card.id && drag.from === "deck" ? "dragging" : ""}`}
      draggable
      onDragStart={(event) => startDrag(event, card.id, "deck")}
      onDragEnd={endDrag}
      onContextMenu={(event) => {
        event.preventDefault();
        inspect(card);
      }}
    >
      <span className="dk-art" aria-hidden style={{ backgroundImage: `url("${card.art}")` }} />
      <span className="dk-cost" title={msg("Energy cost")}>
        {cardCost(card)}
      </span>
      <CardHoverButton
        card={card}
        className="dk-name"
        ariaLabel={msg("Inspect {v0}", { v0: card.name })}
        onClick={() => inspect(card)}
      >
        {msg(card.name)}
      </CardHoverButton>
      <span className="dk-copies">
        <button
          aria-label={msg("Remove one {v0}", { v0: card.name })}
          onClick={() => remove(card.id)}
        >
          <Minus size={13} />
        </button>
        <b
          aria-label={
            unowned
              ? msg("{v0} copies you don’t own", { v0: count })
              : msg("{v0} copies", { v0: count })
          }
        >
          {count}
        </b>
        <button
          aria-label={msg("Add one {v0}", { v0: card.name })}
          disabled={
            ownedAll || (unowned ? availability.limitReached : availability.remaining === 0)
          }
          title={availability.remaining === 0 || ownedAll ? reason : undefined}
          onClick={() => add(card.id)}
        >
          <Plus size={13} />
        </button>
      </span>
    </li>
  );
}
