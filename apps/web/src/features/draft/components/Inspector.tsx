import { X } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import { CardDetail } from "@realms/ui/CardDetail";
import type { CardDefinition } from "@realms/contracts";

/** Reads cards in a dialog, as the collection does. */
export function Inspector({
  card,
  reduced,
  close,
}: {
  card: CardDefinition;
  reduced: boolean;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop collection-modal" onClick={close}>
      <section
        className="collection-card-detail"
        role="dialog"
        aria-modal="true"
        aria-label={msg("{v0} details", { v0: card.name })}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === msg("Escape")) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <button
          className="collection-close"
          aria-label={msg("Close card details")}
          onClick={close}
          autoFocus
        >
          <X size={20} />
        </button>
        <CardDetail card={card} animated reduced={reduced} />
      </section>
    </div>
  );
}
