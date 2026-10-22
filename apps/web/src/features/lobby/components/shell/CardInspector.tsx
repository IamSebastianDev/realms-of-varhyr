import { CardDetail } from "@realms/ui/CardDetail";
import { CardPurchase } from "../../../store/components/CardPurchase";
import { Plus, X } from "lucide-react";
import { buyCollectionCard } from "../../../collection/lib/collection";
import { deckCardAvailability } from "../../../decks/lib/decks";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import { updateCollection } from "../../../collection/stores/collectionStore";

import { useLobbyContext } from "../../LobbyContext.tsx";

export function CardInspector() {
  const {
    add,
    collection,
    detailRef,
    draft,
    inspected,
    props,
    screen,
    setInspected,
    trapDetailFocus,
  } = useLobbyContext();
  return (
    <>
      {inspected && (
        <div className="modal-backdrop collection-modal" onClick={() => setInspected(null)}>
          <section
            ref={detailRef}
            onKeyDown={trapDetailFocus}
            className="collection-card-detail"
            role="dialog"
            aria-modal="true"
            aria-label={msg("{v0} details", { v0: inspected.name })}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="collection-close"
              aria-label={msg("Close card details")}
              onClick={() => setInspected(null)}
              autoFocus
            >
              <X size={20} />
            </button>
            <CardDetail card={inspected} animated reduced={props.reduced}>
              <CardPurchase
                card={inspected}
                collection={collection}
                buy={() => updateCollection((current) => buyCollectionCard(current, inspected))}
              />
              {screen === "builder" && (
                <button
                  className="gold-button"
                  disabled={!deckCardAvailability(draft.cards, inspected.id, registry).remaining}
                  onClick={() => add(inspected.id)}
                >
                  {msg("Add to deck")}
                  <Plus size={16} />
                </button>
              )}
            </CardDetail>
          </section>
        </div>
      )}
    </>
  );
}
