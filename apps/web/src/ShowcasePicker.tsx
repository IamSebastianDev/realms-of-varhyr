import { Check, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { registry } from "@realms/content";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { BuilderDialog } from "./BuilderDialog";
import type { CustomDeck } from "./decks";
import { showcaseOf } from "./DeckShelf";

/** The deck builder's deck box button: shows the art now on the box and opens a dialog to pick up to three cards of the deck. */
export function ShowcasePicker({
  deck,
  onChange,
}: {
  deck: CustomDeck;
  onChange: (cards: string[]) => void;
}) {
  useLanguage();
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null);
  const chosen = (deck.showcase ?? []).filter((id) => deck.cards.includes(id));
  const unique = [...new Set(deck.cards)]
    .filter((id) => registry.cards[id])
    .sort((a, b) => registry.cards[a]!.name.localeCompare(registry.cards[b]!.name));
  const toggle = (id: string) =>
    onChange(
      chosen.includes(id)
        ? chosen.filter((entry) => entry !== id)
        : chosen.length < 3
          ? [...chosen, id]
          : chosen,
    );
  return (
    <>
      <button
        ref={trigger}
        className="showcase-button"
        aria-haspopup="dialog"
        aria-label={msg("Deck box art")}
        title={msg("Deck box art")}
        onClick={() => setOpen(true)}
      >
        {showcaseOf(deck).map((card) => (
          <img key={card.id} src={card.art} alt="" draggable={false} />
        ))}
      </button>
      {open && (
        <BuilderDialog
          title={msg("Deck box art")}
          origin={trigger.current}
          close={() => setOpen(false)}
        >
          <p className="showcase-hint">
            {chosen.length
              ? msg("{v0} of 3 chosen", { v0: chosen.length })
              : msg("Nothing chosen: the rarest cards are shown.")}
          </p>
          <div
            className="showcase-grid"
            role="listbox"
            aria-multiselectable="true"
            aria-label={msg("Deck box art")}
          >
            {unique.map((id) => {
              const card = registry.cards[id]!,
                on = chosen.includes(id);
              return (
                <button
                  key={id}
                  role="option"
                  aria-selected={on}
                  disabled={!on && chosen.length >= 3}
                  className={on ? "on" : ""}
                  title={card.name}
                  onClick={() => toggle(id)}
                >
                  <img src={card.art} alt="" draggable={false} />
                  <span>{card.name}</span>
                  {on && <Check size={15} />}
                </button>
              );
            })}
          </div>
          <div className="builder-dialog-actions">
            <button
              className="outline-button"
              disabled={!chosen.length}
              onClick={() => onChange([])}
            >
              <RotateCcw size={15} />
              {msg("Use the rarest cards")}
            </button>
            <button className="gold-button" data-autofocus onClick={() => setOpen(false)}>
              {msg("Done")}
            </button>
          </div>
        </BuilderDialog>
      )}
    </>
  );
}
