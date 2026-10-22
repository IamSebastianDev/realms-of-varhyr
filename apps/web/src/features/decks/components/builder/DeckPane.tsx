import {
  ArrowLeft,
  Check,
  Layers,
  MoreHorizontal,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import { CrownAmount } from "../../../../components/Crowns";
import { deckRules } from "@realms/contracts";
import { formatNumber, t as msg } from "@realms/ui/i18n";
import { groups } from "../../lib/deckBuilderHelpers";
import { starterOptions } from "../../lib/decks";

import { DeckRow } from "./DeckRow";
import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function DeckPane() {
  const {
    add,
    buyMissing,
    canBuyMissing,
    canUndo,
    deckCards,
    deckCost,
    deckEntries,
    deckGalleryRef,
    draft,
    drag,
    dropZone,
    errors,
    guard,
    isSaved,
    load,
    maxCurve,
    message,
    openDialog,
    over,
    purchase,
    save,
    setDeckCost,
    setEditing,
    shownDeckCards,
    summary,
    undo,
  } = useDeckBuilderContext();
  return (
    <aside
      className={`builder-deck ${drag?.from === "collection" ? "drop-ready" : ""} ${over === "deck" ? "drop-over" : ""}`}
      aria-label={msg("Cards in deck")}
      {...dropZone("deck", "collection", (id) => add(id))}
    >
      <div className="dk-head">
        <h2 className="sr-only">
          {msg("Your deck")} {summary.total} {msg("cards")}
        </h2>
        <button
          className="builder-icon-button"
          aria-label={msg("Back to decks")}
          title={msg("Back to decks")}
          onClick={() => guard(() => setEditing(false))}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="dk-title"
          aria-label={msg("Deck details: {v0}", {
            v0: draft.name.trim() || msg("Untitled deck"),
          })}
          title={msg("Name, card back and energy overview")}
          onClick={() => openDialog("details")}
        >
          <span className={draft.name.trim() ? "" : "is-empty"}>
            {draft.name.trim() || msg("Name your deck")}
          </span>
          <SlidersHorizontal size={13} aria-hidden />
        </button>
        <div className="builder-deck-actions">
          <button
            className="builder-icon-button"
            aria-label={msg("Undo deck edit")}
            disabled={!canUndo}
            onClick={undo}
            title={msg("Undo the last edit")}
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="gold-button builder-save"
            disabled={!draft.name.trim() || !!isSaved}
            onClick={() => {
              save();
            }}
          >
            {isSaved ? msg("Saved") : msg("Save")}
            <Check size={14} />
          </button>
          <button
            className="builder-icon-button"
            aria-label={msg("Deck actions")}
            title={msg("Load, new, duplicate, import or export")}
            onClick={() => openDialog("deck")}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>
      <div
        className={`dk-progress ${errors.length ? "incomplete" : "valid"}`}
        title={
          errors.length
            ? errors.join(" ")
            : msg("Ready to play · {v0} unique cards", { v0: summary.unique })
        }
      >
        <span>
          {!errors.length && <Check size={13} />}
          <b>{summary.total}</b> / {deckRules.minimumCards} {msg("cards")}
        </span>
        <i aria-hidden>
          <u
            style={{
              width: `${Math.min(100, (summary.total / deckRules.minimumCards) * 100)}%`,
            }}
          />
        </i>
      </div>
      {purchase.copies > 0 && (
        <div className="deck-purchase" role="status">
          <span>
            <b>{purchase.copies}</b> {msg("cards to collect")}
            <CrownAmount amount={purchase.crowns} />
          </span>
          <button
            className="gold-button"
            disabled={!canBuyMissing}
            title={!canBuyMissing ? msg("Not enough crowns.") : undefined}
            onClick={buyMissing}
          >
            <ShoppingBag size={14} />
            {msg("Buy missing cards")}
          </button>
        </div>
      )}
      <div
        className="builder-deck-grid"
        ref={deckGalleryRef}
        tabIndex={0}
        aria-label={msg("Cards in deck")}
      >
        {!deckCards.length ? (
          <div className="collection-empty deck-empty">
            <Layers size={26} />
            <p>{msg("Your deck starts here.")}</p>
            <div className="deck-empty-starters">
              {starterOptions.map((deck) => (
                <button key={deck.id} className="outline-button" onClick={() => load(deck.id)}>
                  {msg(deck.name)}
                </button>
              ))}
            </div>
          </div>
        ) : !shownDeckCards.length ? (
          <div className="collection-empty">
            {msg("No cards costing")} {deckCost === 6 ? "6+" : deckCost} {msg("in this deck.")}
          </div>
        ) : (
          groups.map((group) => {
            const rows = deckEntries.filter((entry) => entry.card.type === group.type);
            const total = rows.reduce((sum, entry) => sum + entry.count, 0);
            return rows.length ? (
              <section key={group.type} className="dk-group" aria-label={msg(group.name)}>
                <h3>
                  {msg(group.name)}
                  <span>{total}</span>
                </h3>
                <ul>
                  {rows.map((entry) => (
                    <DeckRow key={entry.card.id} {...entry} />
                  ))}
                </ul>
              </section>
            ) : null;
          })
        )}
      </div>
      {!!deckCards.length && (
        <div className="dk-curve" role="group" aria-label={msg("Filter deck by energy cost")}>
          {summary.curve.map((count, cost) => (
            <button
              key={cost}
              aria-pressed={deckCost === cost}
              aria-label={msg("{v0} cards costing {v1}", {
                v0: count,
                v1: cost === 6 ? "6 or more" : cost,
              })}
              title={msg("{v0} cards costing {v1} · click to filter", {
                v0: count,
                v1: cost === 6 ? "6+" : cost,
              })}
              disabled={!count}
              onClick={() => setDeckCost(deckCost === cost ? null : cost)}
            >
              <span>{count || ""}</span>
              <i style={{ height: `${Math.max(2, (count / maxCurve) * 30)}px` }} />
              <small>{cost === 6 ? "6+" : cost}</small>
            </button>
          ))}
        </div>
      )}
      <div className="builder-deck-footer">
        <span role="status" title={errors.map((issue) => msg(issue)).join(" ")}>
          {message ||
            (errors.length
              ? errors[0]
              : isSaved
                ? msg("Saved on this device.")
                : msg("Draft saved automatically."))}
        </span>
        <button onClick={() => openDialog("details")} title={msg("Deck details")}>
          {summary.freeProducers} {msg("free producers ·")}{" "}
          {formatNumber(summary.averageCost, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}{" "}
          {msg("avg. cost")}
        </button>
      </div>
    </aside>
  );
}
