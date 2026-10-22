import { ArtCard } from "@realms/ui/CardPresentation";
import { type CardDefinition } from "@realms/contracts";
import { OwnershipPips } from "../../../../components/OwnershipPips";
import { deckCardAvailability } from "../../lib/decks";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function CardTile({
  card,
  inDeck,
  index = 0,
}: {
  card: CardDefinition;
  inDeck: boolean;
  index?: number;
}) {
  const { add, deckCards, draft, drag, endDrag, inspect, ownedCopies, reduced, remove, startDrag } =
    useDeckBuilderContext();
  const availability = deckCardAvailability(draft.cards, card.id, registry);
  const ownedState = deckCardAvailability(draft.cards, card.id, registry, ownedCopies);
  const count = availability.inDeck;
  const unavailable = availability.remaining === 0;
  const reason = availability.limitReached
    ? msg("Deck limit reached ({v0})", { v0: availability.limit })
    : !ownedState.owned
      ? msg("No copies owned")
      : msg("All owned copies are in this deck");
  const copySummary = msg("{v0} in deck · {v1} owned · deck limit {v2}", {
    v0: count,
    v1: ownedState.owned,
    v2: availability.limit,
  });
  return (
    <article
      key={card.id}
      draggable={!inDeck && !unavailable}
      onDragStart={(event) => startDrag(event, card.id, "collection")}
      onDragEnd={endDrag}
      className={`builder-card-tile ${drag?.id === card.id && drag.from === "collection" ? "dragging" : ""} ${card.legendary ? "is-legendary" : ""} ${count ? "has-copies" : ""} ${inDeck ? "in-deck" : ""} ${!inDeck && unavailable ? "unavailable" : ""}`}
      style={
        inDeck
          ? {
              zIndex: deckCards.length - index,
              ["--deck-stagger" as string]: `${index % 2 ? 10 : 0}px`,
            }
          : undefined
      }
    >
      <div className="builder-tile-art">
        {inDeck && count > 2 && (
          <span
            className="builder-card-back copy-back-2"
            aria-hidden
            style={{ backgroundImage: `url("${card.art}")` }}
          />
        )}
        {inDeck && count > 1 && (
          <span
            className="builder-card-back copy-back-1"
            aria-hidden
            style={{ backgroundImage: `url("${card.art}")` }}
          />
        )}
        <ArtCard
          card={card}
          reduced={reduced}
          onClick={() => {
            if (inDeck) remove(card.id);
            else if (!unavailable) add(card.id);
          }}
          interaction={{
            "aria-label": inDeck
              ? msg("Remove {v0} from deck", { v0: card.name })
              : msg("Add {v0} to deck", { v0: card.name }),
            "aria-disabled": (!inDeck && unavailable) || undefined,
            title: inDeck
              ? msg("Click to remove one copy · right-click to inspect")
              : msg("{v0} · {v1} · right-click to inspect", {
                  v0: unavailable ? reason : "Click to add one copy",
                  v1: copySummary,
                }),
            onContextMenu: (event) => {
              event.preventDefault();
              inspect(card);
            },
          }}
        />
      </div>
      <div className="builder-tile-meta">
        <OwnershipPips card={card} owned={ownedCopies} inDeck={count} />
      </div>
    </article>
  );
}
