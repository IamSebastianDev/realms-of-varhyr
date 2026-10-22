import { BuilderDialog } from "../BuilderDialog";
import { CardBackPicker } from "../../../card-backs/components/CardBackFace";
import { Check, Copy, Download, Plus, Trash2, Upload } from "lucide-react";
import { ShowcasePicker } from "../ShowcasePicker";
import { deckRules } from "@realms/contracts";
import { formatNumber, t as msg } from "@realms/ui/i18n";
import { newDeck } from "../../lib/deckBuilderHelpers";
import { starterOptions } from "../../lib/decks";

import { LeaveDialog } from "./LeaveDialog";
import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function DeckDialogs() {
  const {
    change,
    codeRef,
    confirmDelete,
    copyCode,
    copyMessage,
    deckCode,
    decks,
    dialog,
    download,
    draft,
    errors,
    fileRef,
    guard,
    importCode,
    importError,
    load,
    maxCurve,
    openSharing,
    removeDeck,
    saved,
    setConfirmDelete,
    setDeckCode,
    setDialog,
    setEditing,
    setImportError,
    sharing,
    sharingOrigin,
    summary,
  } = useDeckBuilderContext();
  return (
    <>
      {dialog === "deck" && (
        <BuilderDialog
          title={msg("Deck actions")}
          origin={sharingOrigin.current}
          close={() => setDialog(null)}
        >
          <label>
            {msg("Load deck")}
            <select
              aria-label={msg("Load deck")}
              value={saved ? draft.id : "draft"}
              onChange={(event) => {
                const id = event.target.value;
                setDialog(null);
                if (id !== draft.id) guard(() => load(id));
              }}
            >
              <option value="draft">{msg("Current draft")}</option>
              <optgroup label={msg("Starter decks")}>
                {starterOptions.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {msg(deck.name)}
                  </option>
                ))}
              </optgroup>
              {decks.length > 0 && (
                <optgroup label={msg("Your decks")}>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {msg(deck.name)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <div className="builder-manage-actions">
            <button
              className="outline-button"
              onClick={() => {
                setDialog(null);
                guard(() => change(newDeck()));
              }}
            >
              <Plus size={16} />
              {msg("New deck")}
            </button>
            <button
              className="outline-button"
              onClick={() => {
                change({
                  ...draft,
                  id: newDeck().id,
                  name: msg("{v0} (copy)", { v0: draft.name.slice(0, 53) }),
                });
                setDialog(null);
              }}
            >
              <Copy size={16} />
              {msg("Duplicate deck")}
            </button>
            <button
              className="outline-button"
              onClick={() => {
                setDialog(null);
                guard(() => openSharing("import"));
              }}
            >
              <Upload size={16} />
              {msg("Import deck")}
            </button>
            <button
              className="outline-button"
              disabled={!draft.cards.length}
              onClick={() => openSharing("export")}
            >
              <Download size={16} />
              {msg("Export deck")}
            </button>
          </div>
          {saved &&
            (confirmDelete ? (
              <div
                className="builder-delete-confirm"
                role="alertdialog"
                aria-label={msg("Delete deck")}
              >
                <p>{msg("Delete “{v0}”? This can’t be undone.", { v0: saved.name })}</p>
                <div className="builder-dialog-actions">
                  <button className="outline-button" onClick={() => setConfirmDelete(false)}>
                    {msg("Keep deck")}
                  </button>
                  <button
                    className="gold-button danger"
                    data-autofocus
                    onClick={() => {
                      removeDeck();
                      setConfirmDelete(false);
                      setDialog(null);
                      setEditing(false);
                    }}
                  >
                    <Trash2 size={15} />
                    {msg("Delete deck")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="outline-button builder-delete"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                {msg("Delete deck")}
              </button>
            ))}
          <p>
            {deckRules.minimumCards} {msg("cards minimum ·")} {deckRules.copiesPerCard}{" "}
            {msg("copies per card ·")} {deckRules.copiesPerLegendary} {msg("per legendary")}
          </p>
        </BuilderDialog>
      )}
      {dialog === "details" && (
        <BuilderDialog
          title={msg("Deck details")}
          origin={sharingOrigin.current}
          close={() => setDialog(null)}
        >
          <div className="deck-detail-fields">
            <label className="deck-detail-name">
              {msg("Name")}
              <input
                data-autofocus
                aria-label={msg("Deck name")}
                placeholder={msg("Name your deck")}
                maxLength={60}
                value={draft.name}
                onChange={(event) => change({ ...draft, name: event.target.value })}
              />
            </label>
            <div className="deck-detail-back">
              <span>
                {msg("Card back")}
                <small>{msg("Shown on the back of this deck’s cards.")}</small>
              </span>
              <CardBackPicker value={draft.back} onChange={(back) => change({ ...draft, back })} />
            </div>
            <div className="deck-detail-back">
              <span>
                {msg("Deck box art")}
                <small>
                  {msg(
                    "Up to three cards from this deck. Without a choice, its rarest cards are shown.",
                  )}
                </small>
              </span>
              <ShowcasePicker
                deck={draft}
                onChange={(showcase) => {
                  const { showcase: _old, ...rest } = draft;
                  change(showcase.length ? { ...rest, showcase } : rest);
                }}
              />
            </div>
          </div>
          <p className="deck-detail-count">
            {summary.total} {msg("cards ·")} {summary.unique} {msg("unique")}
          </p>
          <div className="deck-metrics">
            <span>
              <b>{summary.freeProducers}</b> {msg("Free producers")}
            </span>
            <span>
              <b>{summary.producers}</b> {msg("All producers")}
            </span>
            <span>
              <b>
                {formatNumber(summary.averageCost, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </b>{" "}
              {msg("Average cost")}
            </span>
          </div>
          <div className="deck-curve-heading">{msg("Energy cost curve")}</div>
          <div
            className="deck-cost-curve"
            role="img"
            aria-label={msg("Energy cost curve: {v0}", {
              v0: summary.curve
                .map((count, cost) => `${cost === 6 ? "6+" : cost} cost: ${count} cards`)
                .join(", "),
            })}
          >
            {summary.curve.map((count, cost) => (
              <div
                key={cost}
                title={msg("{v0} cards costing {v1}", {
                  v0: count,
                  v1: cost === 6 ? "6+" : cost,
                })}
              >
                <span>{count || ""}</span>
                <i style={{ height: `${Math.max(2, (count / maxCurve) * 70)}px` }} />
                <small>{cost === 6 ? "6+" : cost}</small>
              </div>
            ))}
          </div>
          <p role="status">{errors.length ? errors.join(" ") : msg("Ready to play.")}</p>
        </BuilderDialog>
      )}
      <LeaveDialog />
      {sharing && (
        <BuilderDialog
          title={sharing === "export" ? msg("Export deck") : msg("Import deck")}
          origin={sharingOrigin.current}
          close={() => setDialog(null)}
        >
          <p>
            {sharing === "export"
              ? msg("Copy this deck code to share it, or download a file.")
              : msg("Paste a deck code or choose an exported deck file. It opens as a new draft.")}
          </p>
          <textarea
            ref={codeRef}
            aria-label={msg("Deck code")}
            readOnly={sharing === "export"}
            value={deckCode}
            onChange={(event) => {
              setDeckCode(event.target.value);
              setImportError("");
            }}
            spellCheck={false}
          />
          {importError && (
            <p className="builder-dialog-error" role="alert">
              {msg(importError)}
            </p>
          )}
          {copyMessage && <p role="status">{msg(copyMessage)}</p>}
          <div className="builder-dialog-actions">
            {sharing === "export" ? (
              <>
                <button className="outline-button" onClick={download}>
                  <Download size={15} />
                  {msg("Download file")}
                </button>
                <button className="gold-button" onClick={() => void copyCode()}>
                  <Copy size={15} />
                  {msg("Copy deck code")}
                </button>
              </>
            ) : (
              <>
                <button className="outline-button" onClick={() => fileRef.current?.click()}>
                  <Upload size={15} />
                  {msg("Choose file")}
                </button>
                <button
                  className="gold-button"
                  disabled={!deckCode.trim()}
                  onClick={() => {
                    try {
                      importCode(deckCode);
                    } catch (error) {
                      setImportError(
                        error instanceof Error ? error.message : msg("Could not read this deck."),
                      );
                    }
                  }}
                >
                  {msg("Import deck")}
                  <Check size={15} />
                </button>
              </>
            )}
          </div>
        </BuilderDialog>
      )}
    </>
  );
}
