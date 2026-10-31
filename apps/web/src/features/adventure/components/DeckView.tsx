import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RunState } from "@realms/adventure";
import { ArtCard, CardHoverButton } from "@realms/ui/CardPresentation";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { cardCost } from "../../decks/lib/deckTools";
import { adventureContent } from "../stores/adventureStore";

export function DeckView({
  run,
  reduced,
  close,
}: {
  run: RunState;
  reduced: boolean;
  close: () => void;
}) {
  useLanguage();
  const [cards, setCards] = useState(false);
  const counts = new Map<string, number>();
  for (const id of run.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries = [...counts]
    .map(([id, count]) => ({ card: adventureContent.cards[id]!, count }))
    .sort((a, b) => cardCost(a.card) - cardCost(b.card) || (a.card.name < b.card.name ? -1 : 1));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);
  return (
    <div
      className="adv-offer adv-deckview"
      role="dialog"
      aria-modal="true"
      aria-label={msg("Your deck")}
    >
      <header>
        <h2>{msg("Your adventure deck")}</h2>
        <span>{msg("{v0} cards", { v0: run.deck.length })}</span>
        <div className="adv-deckview-tabs" role="group" aria-label={msg("View")}>
          <button aria-pressed={!cards} onClick={() => setCards(false)}>
            {msg("List")}
          </button>
          <button aria-pressed={cards} onClick={() => setCards(true)}>
            {msg("Cards")}
          </button>
        </div>
        <button className="adv-x" aria-label={msg("Close")} onClick={close}>
          <X size={18} />
        </button>
      </header>
      {cards ? (
        <div className="adv-offer-cards deck">
          {entries.map(({ card, count }) => (
            <div key={card.id} className="adv-offer-card">
              <ArtCard card={card} reduced={reduced} />
              {count > 1 && <small className="count">×{count}</small>}
            </div>
          ))}
        </div>
      ) : (
        <aside className="builder-deck adv-deckview-list">
          <DeckList run={run} />
        </aside>
      )}
    </div>
  );
}

const groups = [
  { type: "creature", name: "Creatures" },
  { type: "holding", name: "Holdings" },
  { type: "spell", name: "Spells" },
] as const;

/** The run deck as a read-only list in the deck builder's style, grouped by type. */
export function DeckList({ run }: { run: RunState }) {
  useLanguage();
  const counts = new Map<string, number>();
  for (const id of run.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries = [...counts]
    .map(([id, count]) => ({ card: adventureContent.cards[id]!, count }))
    .sort((a, b) => cardCost(a.card) - cardCost(b.card) || (a.card.name < b.card.name ? -1 : 1));
  return (
    <div className="builder-deck-grid" tabIndex={0} aria-label={msg("Cards in deck")}>
      {groups.map((group) => {
        const rows = entries.filter((entry) => entry.card.type === group.type);
        if (!rows.length) return null;
        return (
          <section key={group.type} className="dk-group" aria-label={msg(group.name)}>
            <h3>
              {msg(group.name)}
              <span>{rows.reduce((sum, row) => sum + row.count, 0)}</span>
            </h3>
            <ul>
              {rows.map(({ card, count }) => (
                <li key={card.id} className={`dk-row ${card.legendary ? "is-legendary" : ""}`}>
                  <span
                    className="dk-art"
                    aria-hidden
                    style={{ backgroundImage: `url("${card.art}")` }}
                  />
                  <span className="dk-cost" title={msg("Energy cost")}>
                    {cardCost(card)}
                  </span>
                  <CardHoverButton
                    card={card}
                    className="dk-name"
                    ariaLabel={msg("Inspect {v0}", { v0: card.name })}
                    onClick={() => {}}
                  >
                    {msg(card.name)}
                  </CardHoverButton>
                  <span className="dk-copies">
                    <b>×{count}</b>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
