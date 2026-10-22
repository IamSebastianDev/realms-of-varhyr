import { ArrowLeft, BarChart3 } from "lucide-react";
import { ArtCard } from "@realms/ui/CardPresentation";
import { CardFilterBar } from "../../../decks/components/CardFilters";
import { OwnershipPips } from "../../../../components/OwnershipPips";
import { t as msg } from "@realms/ui/i18n";
import { ownedCopyCount } from "../../../collection/lib/collection";
import { registry } from "@realms/content";

import { useLobbyContext } from "../../LobbyContext.tsx";

export function CollectionBrowser() {
  const {
    cards,
    filters,
    inspect,
    matches,
    navigate,
    ownedCopies,
    ownership,
    props,
    setFilters,
    setOwnership,
  } = useLobbyContext();
  return (
    <>
      <main className="collection-page collection-wide">
        <div className="collection-heading collection-subhead">
          <button
            className="builder-icon-button"
            aria-label={msg("Back to decks")}
            title={msg("Back to decks")}
            onClick={() => navigate("builder")}
          >
            <ArrowLeft size={16} />
          </button>
          <h1>{msg("Collection")}</h1>
          <button className="outline-button" onClick={() => navigate("stats")}>
            <BarChart3 size={15} />
            {msg("Statistics")}
          </button>
        </div>
        <div className="collection-columns">
          <section className="all-cards-panel" aria-label={msg("All cards")}>
            {cards.length !== Object.keys(registry.cards).length && (
              <div className="collection-panel-heading">
                <span>
                  {cards.length} / {Object.keys(registry.cards).length}
                </span>
              </div>
            )}
            <div className="builder-collection-bar collection-filterbar">
              <CardFilterBar
                filters={filters}
                setFilters={setFilters}
                ownership={ownership}
                setOwnership={setOwnership}
                count={cards.length}
                hidden={matches.length - cards.length}
              />
            </div>
            {!cards.length && (
              <p className="collection-empty">
                {ownership.unowned
                  ? msg("No cards match. Try another search or filter.")
                  : msg(
                      "No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.",
                    )}
              </p>
            )}
            <div className="collection-card-grid">
              {cards.map((card) => (
                <article
                  key={card.id}
                  className={ownedCopyCount(ownedCopies, card.id) > 0 ? undefined : "unowned-card"}
                >
                  <ArtCard card={card} reduced={props.reduced} onClick={() => inspect(card)} />
                  <div className="collection-card-meta">
                    <span
                      className={`collection-rarity rarity-${card.legendary ? "legendary" : card.rarity}`}
                    >
                      {msg(card.rarity)}
                    </span>
                    <OwnershipPips card={card} owned={ownedCopies} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
