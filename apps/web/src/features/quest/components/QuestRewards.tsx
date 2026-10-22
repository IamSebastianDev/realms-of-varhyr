import { useEffect, useState } from "react";
import { ArrowLeft, Check, Plus, Search, ShoppingBag, X } from "lucide-react";
import { factionInfo, registry } from "@realms/content";
import { FactionIcon } from "@realms/renderer/FactionIcon";
import type { RunState } from "@realms/quest";
import { ArtCard } from "@realms/ui/CardPresentation";
import { localizedCard, t as msg, useLanguage } from "@realms/ui/i18n";
import { ownedCopyCount, ownershipLimit } from "../../collection/lib/collection";
import { updateCollection, useCollection } from "../../collection/stores/collectionStore";
import { SilverIcon } from "../../../components/Crowns";
import { OwnershipPips } from "../../../components/OwnershipPips";
import {
  availableQuestCopies,
  buyQuestCards,
  closeQuestRewards,
  keepPrice,
  purchasedQuestCopies,
  settleQuest,
} from "../lib/rewards";
import { saveRun } from "../stores/questStore";

/** The final deck becomes a shop on wins and losses alike. The collection receipt owns its remaining budget. */
export function QuestRewards({
  run,
  reduced,
  leave,
}: {
  run: RunState;
  reduced: boolean;
  leave: () => void;
}) {
  useLanguage();
  const { collection } = useCollection();
  const receipt = collection.questSettlements?.[run.id];
  const [selectedCopies, setSelectedCopies] = useState<Record<string, number[]>>({});
  const selection = Object.fromEntries(
    Object.entries(selectedCopies).map(([id, indices]) => [id, indices.length]),
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false);
  function openRewards() {
    try {
      updateCollection((current) => settleQuest(current, run), { requireSave: true });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  useEffect(() => {
    openRewards();
  }, [run.id]); // A saved receipt makes reopening idempotent.
  const title = run.result === "retired" ? msg("You turned back") : msg("You have fallen");
  const rows = Object.entries(receipt?.cards ?? {})
    .flatMap(([id, copies]) => {
      const card = registry.cards[id];
      return card
        ? [
            {
              id,
              card,
              copies,
              price: keepPrice(card),
              available: availableQuestCopies(collection, receipt!, registry, id),
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        a.price - b.price || localizedCard(a.card).name.localeCompare(localizedCard(b.card).name),
    );
  const selected = rows.filter((row) => (selection[row.id] ?? 0) > 0);
  const cost = selected.reduce((sum, row) => sum + row.price * selection[row.id], 0);
  const count = selected.reduce((sum, row) => sum + selection[row.id], 0);
  const query = search.trim().toLocaleLowerCase();
  const copies = rows.flatMap((row) =>
    Array.from({ length: row.copies }, (_, index) => ({ ...row, index })),
  );
  const shown = copies.filter((row) =>
    localizedCard(row.card).name.toLocaleLowerCase().includes(query),
  );
  const valid =
    !!receipt &&
    !receipt.closed &&
    count > 0 &&
    cost <= receipt.coins &&
    selected.every((row) => selection[row.id] <= row.available);
  function toggleCopy(id: string, index: number) {
    const row = rows.find((entry) => entry.id === id);
    if (!receipt || !row || receipt.closed) return;
    if (purchasedQuestCopies(receipt, id).includes(index)) return;
    setSelectedCopies((current) => {
      const previous = current[id] ?? [];
      if (previous.includes(index))
        return { ...current, [id]: previous.filter((copy) => copy !== index) };
      const total = Object.entries(current).reduce(
        (sum, [key, indices]) =>
          sum + (registry.cards[key] ? keepPrice(registry.cards[key]) * indices.length : 0),
        0,
      );
      return previous.length >= row.available || total + row.price > receipt.coins
        ? current
        : { ...current, [id]: [...previous, index] };
    });
    setNotice("");
  }
  function buy() {
    if (!receipt || !valid) return;
    try {
      updateCollection(
        (current) =>
          buyQuestCards(current, run.id, selection, registry, receipt.revision, selectedCopies),
        { requireSave: true },
      );
      setSelectedCopies({});
      setError("");
      setNotice(msg("Added {v0} cards to your collection.", { v0: count }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function finish() {
    try {
      updateCollection((current) => closeQuestRewards(current, run.id), { requireSave: true });
      saveRun(null);
      leave();
    } catch (cause) {
      setConfirm(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <main className="quest-page quest-rewards" aria-label={msg("Quest rewards")}>
      <header className="quest-rewards-heading">
        <button
          className="builder-icon-button"
          aria-label={msg("Back to the menu")}
          title={msg("Back to the menu. Your run is saved.")}
          onClick={leave}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="quest-rewards-title">
          <h1>{title}</h1>
          <p>
            <FactionIcon faction={run.faction} />
            {msg(factionInfo[run.faction]?.name ?? run.faction)}
            <span>·</span>
            {msg("Fights won")}: {run.stats.fights}
          </p>
        </div>
        <div className="quest-rewards-wallet" aria-label={msg("Silver remaining")}>
          <SilverIcon tilt />
          <strong>{receipt?.coins ?? run.silver}</strong>
          <span>
            {msg("Silver")}
            <small>{msg("Choose cards to keep")}</small>
          </span>
        </div>
      </header>
      <section className="all-cards-panel quest-rewards-deck" aria-label={msg("Your final deck")}>
        <div className="quest-rewards-deck-heading">
          <h2>{msg("Your final deck")}</h2>
          <span>{msg("{v0} cards in your deck", { v0: run.deck.length })}</span>
        </div>
        <div className="builder-collection-bar collection-filterbar quest-rewards-tools">
          <label className="collection-search">
            <Search size={16} />
            <input
              type="search"
              placeholder={msg("Search cards…")}
              aria-label={msg("Search cards")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span>
            {shown.length} / {copies.length}
          </span>
        </div>
        <div className="collection-card-grid quest-rewards-grid">
          {shown.map((row) => {
            const picked = selectedCopies[row.id]?.includes(row.index) ?? false;
            const kept = !!receipt && purchasedQuestCopies(receipt, row.id).includes(row.index);
            const canAdd =
              !kept &&
              !receipt?.closed &&
              (selection[row.id] ?? 0) < row.available &&
              cost + row.price <= (receipt?.coins ?? 0);
            const owned = ownedCopyCount(collection.counts, row.id),
              full = owned >= ownershipLimit(row.card);
            const label = msg(picked ? "Deselect {v0}, copy {v1}" : "Select {v0}, copy {v1}", {
              v0: localizedCard(row.card).name,
              v1: row.index + 1,
            });
            return (
              <article
                key={`${row.id}:${row.index}`}
                className={`quest-rewards-card ${picked ? "selected" : ""} ${full && !kept ? "collection-full" : ""} ${kept ? "kept" : ""}`}
              >
                <ArtCard
                  card={row.card}
                  reduced={reduced}
                  selected={picked}
                  onClick={() => toggleCopy(row.id, row.index)}
                  interaction={{ "aria-label": label, "aria-disabled": !picked && !canAdd }}
                />
                <div className="collection-card-meta">
                  <span
                    className={`collection-rarity rarity-${row.card.legendary ? "legendary" : row.card.rarity}`}
                  >
                    {msg(row.card.rarity)}
                  </span>
                  <OwnershipPips card={row.card} owned={collection.counts} />
                </div>
                <div className="quest-rewards-card-controls">
                  <span className="quest-purse">
                    <SilverIcon />
                    <b>{row.price}</b>
                  </span>
                  {kept ? (
                    <span className="quest-rewards-kept">
                      <Check size={14} />
                      {msg("Kept")}
                    </span>
                  ) : (
                    <button
                      className="outline-button"
                      disabled={!picked && !canAdd}
                      aria-label={label}
                      aria-pressed={picked}
                      onClick={() => toggleCopy(row.id, row.index)}
                    >
                      {picked ? <Check size={14} /> : <Plus size={14} />}
                      <span>{picked ? msg("Selected") : msg("Select")}</span>
                    </button>
                  )}
                </div>
                <small>{full && !kept ? msg("Collection complete") : "\u00a0"}</small>
              </article>
            );
          })}
          {!shown.length && (
            <p className="collection-empty">{msg("No cards match. Try another search.")}</p>
          )}
        </div>
      </section>
      <aside className="quest-rewards-checkout" aria-label={msg("Keep your cards")}>
        <header>
          <h2>{msg("Choose cards to keep")}</h2>
          <p>{msg("Click a card to select a copy. Spend only the silver from this run.")}</p>
        </header>
        <div className="quest-rewards-basket">
          <h2>
            <ShoppingBag size={18} />
            {msg("Your selection")}
          </h2>
          {selected.length ? (
            <ul>
              {selected.map((row) => (
                <li key={row.id}>
                  <img src={row.card.art} alt="" />
                  <span>
                    <strong>{localizedCard(row.card).name}</strong>
                    <small>
                      {selection[row.id]} × <SilverIcon />
                      {row.price}
                    </small>
                  </span>
                  <b>{selection[row.id] * row.price}</b>
                  <button
                    className="builder-icon-button"
                    aria-label={msg("Remove a copy of {v0}", { v0: localizedCard(row.card).name })}
                    onClick={() => toggleCopy(row.id, selectedCopies[row.id].at(-1)!)}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="quest-rewards-empty">
              <ShoppingBag size={28} />
              <p>{msg("Select cards from your final deck.")}</p>
            </div>
          )}
        </div>
        {notice && (
          <p className="quest-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="quest-error" role="alert">
            {msg(error)}
          </p>
        )}
        {!receipt && error && (
          <button className="outline-button" onClick={openRewards}>
            {msg("Try again")}
          </button>
        )}
        <div className="quest-rewards-total">
          <span>{msg("Total")}</span>
          <span className="quest-purse">
            <SilverIcon />
            <b>{cost}</b>
          </span>
        </div>
        <div className="quest-rewards-remaining">
          <span>{msg("After purchase")}</span>
          <span className="quest-purse">
            <SilverIcon />
            {Math.max(0, (receipt?.coins ?? run.silver) - cost)}
          </span>
        </div>
        <button className="outline-button quest-rewards-primary" disabled={!valid} onClick={buy}>
          {count === 1 ? msg("Keep 1 card") : msg("Keep {v0} cards", { v0: count })}
        </button>
        <button
          className="outline-button"
          disabled={!receipt}
          onClick={() =>
            receipt?.closed || (!receipt?.coins && !count) ? finish() : setConfirm(true)
          }
        >
          {msg("Finish run")}
        </button>
      </aside>
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="choice-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={msg("Finish this run?")}
          >
            <h2>{msg("Finish this run?")}</h2>
            <p>
              {msg(
                "Unbought cards and unspent silver will be left behind. Cards already kept are in your collection.",
              )}
            </p>
            <div className="quest-actions">
              <button className="outline-button quest-rewards-primary" onClick={finish}>
                {msg("Finish run")}
              </button>
              <button className="outline-button" onClick={() => setConfirm(false)}>
                {msg("Keep choosing")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
