import { t as msg, useLanguage } from "@realms/ui/i18n";
import type { CardDefinition } from "@realms/contracts";
import { ArtCard } from "@realms/ui/CardPresentation";

type Props = {
  title: string;
  cards: { id: string; card: CardDefinition }[];
  reduced: boolean;
  choose: (id: string) => void;
  cancel: () => void;
};

/** Pick one card out of a pile (for example Raise from the discard pile). */
export function PilePicker({ title, cards, reduced, choose, cancel }: Props) {
  useLanguage();
  return (
    <div className="modal-backdrop" onClick={cancel}>
      <section
        className="pile-picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className="pile-picker-cards">
          {cards.map(({ id, card }) => (
            <ArtCard
              key={id}
              detail={false}
              reduced={reduced}
              card={card}
              selected={false}
              disabled={false}
              className="pile-picker-card"
              interaction={{ id: `pile-${id}` }}
              onClick={() => choose(id)}
            />
          ))}
        </div>
        <button className="outline-button" onClick={cancel}>
          {msg("Cancel")}
        </button>
      </section>
    </div>
  );
}
