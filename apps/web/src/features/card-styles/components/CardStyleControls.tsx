import { Check, LockKeyhole, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CardDefinition } from "@realms/contracts";
import type { CardAppearance } from "@realms/renderer/CardStyles";
import {
  cardFinishes,
  finishLabels,
  finishDescriptions,
  defaultCardAppearance,
  includesStandardFoil,
} from "@realms/renderer/cardFinishes";
import { t as msg } from "@realms/ui/i18n";
import { CrownAmount } from "../../../components/Crowns";
import { ownedCopyCount, type Collection } from "../../collection/lib/collection";
import { updateCollection } from "../../collection/stores/collectionStore";
import { equipFinish, finishPrice, hasFinish, unlockFinish } from "../lib/cardStyles";
import "../styles/card-styles.css";

export function CardStyleControls({
  card,
  collection,
  preview,
  onPreview,
}: {
  card: CardDefinition;
  collection: Collection;
  preview: CardAppearance;
  onPreview: (appearance: CardAppearance) => void;
}) {
  const [error, setError] = useState("");
  const unlocked = preview === "original" || hasFinish(collection, card, preview);
  const equipped =
    collection.cardStyles?.equipped[card.deckLimitKey] ?? defaultCardAppearance(card);
  const ownsCard = ownedCopyCount(collection.counts, card.id) > 0;
  const update = () => {
    try {
      updateCollection(
        (current) =>
          preview !== "original" && !hasFinish(current, card, preview)
            ? unlockFinish(current, card, preview)
            : equipFinish(current, card, preview),
        { requireSave: true },
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? msg(cause.message) : msg("Could not save card style."));
    }
  };
  return (
    <section className="card-style-controls" aria-label={msg("Card styles")}>
      <header>
        <span>
          <Sparkles size={14} />
          {msg("Card style")}
        </span>
        <small>{msg(finishLabels[preview])}</small>
      </header>
      <div className="card-style-options" role="group" aria-label={msg("Preview card style")}>
        {(["original", ...cardFinishes] as const).map((appearance) => (
          <button
            key={appearance}
            aria-pressed={preview === appearance}
            onClick={() => {
              onPreview(appearance);
              setError("");
            }}
          >
            <i className={`style-sample ${appearance}`} aria-hidden="true" />
            {msg(finishLabels[appearance])}
            {appearance !== "original" && !hasFinish(collection, card, appearance) && (
              <LockKeyhole size={12} />
            )}
          </button>
        ))}
      </div>
      <p>{msg(finishDescriptions[preview])}</p>
      <div className="card-style-action">
        <button
          className="outline-button"
          onClick={update}
          disabled={
            preview === equipped || (!unlocked && (!ownsCard || collection.crowns < finishPrice))
          }
        >
          {!unlocked ? (
            <>
              {msg("Unlock {v0}", { v0: msg(finishLabels[preview]) })}
              <CrownAmount amount={finishPrice} />
            </>
          ) : preview === equipped ? (
            <>
              <Check size={14} />
              {msg("Equipped")}
            </>
          ) : (
            msg("Use this style")
          )}
        </button>
        {preview === "foil" && includesStandardFoil(card) && (
          <small>{msg("Included with legendary cards.")}</small>
        )}
        {!unlocked && (
          <small>
            {!ownsCard
              ? msg("Own this card to unlock its finishes.")
              : collection.crowns < finishPrice
                ? msg("Not enough crowns.")
                : msg("Unlock once. Use on every copy.")}
          </small>
        )}
      </div>
      {error && (
        <p className="card-style-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
