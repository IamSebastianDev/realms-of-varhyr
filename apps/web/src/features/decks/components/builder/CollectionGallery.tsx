import { Search } from "lucide-react";
import { defaultOwnership } from "../CardFilters";
import { initialBuilderFilters } from "../../lib/deckTools";
import { t as msg } from "@realms/ui/i18n";

import { CardTile } from "./CardTile";
import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function CollectionGallery() {
  const { allCards, cards, ownership, setFilters, setOwnership } = useDeckBuilderContext();
  return (
    <>
      <div className="builder-collection-gallery" aria-label={msg("Browse collection cards")}>
        {!cards.length ? (
          <div className="collection-empty">
            <Search size={24} />
            <p>
              {allCards.length && !ownership.unowned
                ? msg(
                    "No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.",
                  )
                : msg("No cards match these filters.")}
            </p>
            <button
              className="outline-button"
              onClick={() => {
                setFilters(initialBuilderFilters);
                setOwnership(defaultOwnership);
              }}
            >
              {msg("Reset filters")}
            </button>
          </div>
        ) : (
          cards.map((card) => <CardTile key={card.id} card={card} inDeck={false} />)
        )}
      </div>
    </>
  );
}
