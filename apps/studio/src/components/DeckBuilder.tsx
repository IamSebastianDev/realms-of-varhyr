import { useEffect, useMemo, useState } from "react";
import { factionInfo } from "@realms/content";
import { deckRules } from "@realms/contracts/deckRules";
import {
  deckProblems,
  deckSize,
  deckStats,
  generateDeck,
  limitOf,
  poolFor,
  type Starter,
} from "../lib/decks";
import * as fs from "../lib/fs";
import { FactionDots } from "./SetOverview";
import { compareCards, glance, named, slug, slugify, type Stored } from "../lib/model";

const label = (id: string) => (factionInfo[id]?.name ?? id).replace(/^The /, "");
const same = (a: Starter | null, b: Starter | null) => JSON.stringify(a) === JSON.stringify(b);

/** Build, generate and save the starter deck of one faction. The deck is stored in that faction's file. */
export function DeckBuilder({ repo, cards }: { repo: fs.Repo; cards: Stored[] }) {
  const [status, onStatus] = useState("");
  const [factions, setFactions] = useState<fs.StoredFaction[]>([]);
  const [file, setFile] = useState("");
  const [deck, setDeck] = useState<Starter | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    const list = await fs.readFactions(repo);
    setFactions(list.filter((entry) => entry.data.id !== "neutral"));
    return list;
  };
  useEffect(() => {
    void load().then((list) =>
      setFile(
        (current) =>
          current ||
          list.find((entry) => entry.data.starter?.default)?.file ||
          list.find((entry) => entry.data.id !== "neutral")?.file ||
          "",
      ),
    );
  }, [repo]);

  const faction = factions.find((entry) => entry.file === file);
  const saved: Starter | null = faction?.data.starter ?? null;
  useEffect(() => {
    setDeck(saved ? structuredClone(saved) : null);
    setError("");
  }, [file, factions]);

  const factionOrder = useMemo(() => Object.keys(factionInfo).filter((id) => id !== "neutral"), []);
  const pool = useMemo(
    () =>
      faction
        ? poolFor(cards, faction.data.id).sort((a, b) => compareCards(a, b, factionOrder))
        : [],
    [cards, faction, factionOrder],
  );
  const byId = useMemo(() => new Map(cards.map((card) => [card.data.id as string, card])), [cards]);
  if (!faction)
    return (
      <main className="studio-sets">
        <p className="studio-hint">
          This folder has no faction files in <code>assets/factions</code>.
        </p>
      </main>
    );

  const dirty = !same(deck, saved);
  const problems = deck ? deckProblems(deck.cards, cards) : [];
  const stats = deck ? deckStats(deck.cards, cards) : null;
  const copies = (id: string) => deck?.cards[id] ?? 0;
  const keyUsed = (data: Record<string, any>) =>
    Object.entries(deck?.cards ?? {}).reduce(
      (sum, [id, n]) =>
        (byId.get(id)?.data.deckLimitKey ?? id) === (data.deckLimitKey ?? data.id) ? sum + n : sum,
      0,
    );
  const set = (change: Partial<Starter>) =>
    setDeck((current) => current && { ...current, ...change });
  const bump = (id: string, by: number) =>
    setDeck((current) => {
      if (!current) return current;
      const next = { ...current.cards },
        count = (next[id] ?? 0) + by;
      if (count <= 0) delete next[id];
      else next[id] = count;
      return { ...current, cards: next };
    });
  const create = () =>
    setDeck({
      id: slugify(faction.data.short ?? faction.data.id),
      name: `${label(faction.data.id)} starter`,
      cards: {},
    });
  const others = factions.filter((entry) => entry.file !== file);
  const idTaken = !!deck && others.some((entry) => entry.data.starter?.id === deck.id);
  const idProblem =
    deck &&
    (!slug.test(deck.id)
      ? "The ID needs lowercase letters, digits and hyphens."
      : idTaken
        ? "Another faction already uses this deck ID."
        : "");
  const blocked = !deck || !!idProblem || !deck.name.trim() || !Object.keys(deck.cards).length;

  const save = async () => {
    if (!deck || blocked) return;
    setError("");
    try {
      const entry: Starter = {
        id: deck.id,
        name: deck.name.trim(),
        ...(deck.default ? { default: true } : {}),
        cards: deck.cards,
      };
      await fs.writeFaction(repo, file, { ...faction.data, starter: entry });
      if (deck.default)
        for (const other of others)
          if (other.data.starter?.default)
            await fs.writeFaction(repo, other.file, {
              ...other.data,
              starter: Object.fromEntries(
                Object.entries(other.data.starter).filter(([key]) => key !== "default"),
              ),
            });
      await load();
      onStatus(
        problems.length
          ? `Saved ${entry.name}. It cannot start a game until it has ${deckRules.minimumCards} legal cards.`
          : `Saved ${entry.name}. Run npm run import:cards to use it in the game.`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const remove = async () => {
    const { starter: _gone, ...rest } = faction.data;
    try {
      await fs.writeFaction(repo, file, rest);
      await load();
      onStatus(`Removed the ${label(faction.data.id)} starter deck.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const text = query.toLowerCase().trim();
  const shown = pool.filter(
    (card) => !text || card.data.name.toLowerCase().includes(text) || card.data.id.includes(text),
  );
  const inDeck = deck
    ? Object.keys(deck.cards)
        .map((id) => byId.get(id))
        .filter((card): card is Stored => !!card)
        .sort((a, b) => compareCards(a, b, factionOrder))
    : [];
  const unknown = deck ? Object.keys(deck.cards).filter((id) => !byId.has(id)) : [];
  const tallest = Math.max(1, ...(stats?.curve ?? [1]));

  return (
    <main className="studio-sets studio-decks">
      <div className="set-tabs" role="tablist" aria-label="Factions">
        {factions.map((entry) => (
          <button
            key={entry.file}
            role="tab"
            aria-selected={entry.file === file}
            className={entry.file === file ? "on" : ""}
            onClick={() => {
              setFile(entry.file);
              onStatus("");
            }}
          >
            {label(entry.data.id)}
            <small>{entry.data.starter ? deckSize(entry.data.starter.cards) : "–"}</small>
          </button>
        ))}
      </div>

      <header className="set-head">
        <h2>
          <FactionDots members={[faction.data.id]} />
          {deck ? deck.name || "Starter deck" : `${label(faction.data.id)} starter deck`}
        </h2>
        <p>
          {deck
            ? `${deckSize(deck.cards)} of ${deckRules.minimumCards} cards. At most ${deckRules.copiesPerCard} copies of a card and ${deckRules.copiesPerLegendary} of a legendary. The pool is this faction's cards plus neutral ones.`
            : "This faction has no starter deck yet."}
        </p>
        {deck ? (
          <div className="set-actions">
            <button onClick={() => set({ cards: generateDeck(pool) })}>
              {Object.keys(deck.cards).length ? "Regenerate" : "Generate a draft"}
            </button>
            <button onClick={() => set({ cards: {} })} disabled={!Object.keys(deck.cards).length}>
              Clear
            </button>
            <button
              onClick={() => setDeck(saved ? structuredClone(saved) : null)}
              disabled={!dirty}
            >
              Revert
            </button>
            <button className="primary" onClick={save} disabled={blocked || !dirty}>
              Save deck
            </button>
          </div>
        ) : (
          <div className="set-actions">
            <button
              className="primary"
              onClick={() => {
                create();
              }}
            >
              Create starter deck
            </button>
          </div>
        )}
      </header>

      {deck && (
        <>
          <div className="deck-meta">
            <label>
              Name
              <input value={deck.name} onChange={(event) => set({ name: event.target.value })} />
            </label>
            <label>
              ID
              <input
                value={deck.id}
                disabled={!!saved}
                onChange={(event) => set({ id: event.target.value })}
                title={saved ? "Saved decks keep their ID; players refer to it." : ""}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!deck.default}
                onChange={(event) => set({ default: event.target.checked })}
              />
              Deck new players begin with
            </label>
            {saved && (
              <button className="danger" onClick={remove}>
                Remove starter deck
              </button>
            )}
          </div>
          {idProblem && (
            <p role="alert" className="studio-problem">
              {idProblem}
            </p>
          )}
          {status && !dirty && (
            <p role="status" className="studio-status">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="studio-problem">
              {error}
            </p>
          )}

          {stats && (
            <div className="set-figures">
              <div>
                <strong>{stats.total}</strong>
                <span>cards</span>
              </div>
              {(["creature", "spell", "holding"] as const).map((type) => (
                <div key={type}>
                  <strong>{stats.type[type] ?? 0}</strong>
                  <span>{type}s</span>
                </div>
              ))}
              <div>
                <strong>{stats.average.toFixed(1)}</strong>
                <span>average cost</span>
              </div>
              <div title="Creatures and holdings that produce energy">
                <strong>{stats.producers}</strong>
                <span>energy sources</span>
              </div>
              <div>
                <strong>{stats.legendary}</strong>
                <span>legendary</span>
              </div>
            </div>
          )}
          {stats && (
            <div className="curve deck-curve" role="img" aria-label="Cost curve of the deck">
              {stats.curve.map((n, cost) => (
                <div key={cost} className="col">
                  <span className="n">{n || ""}</span>
                  <div className="stack" style={{ height: `${(n / tallest) * 100}%` }}>
                    <span className="t-common" style={{ flexGrow: 1 }} />
                  </div>
                  <span className="x">{cost === stats.curve.length - 1 ? `${cost}+` : cost}</span>
                </div>
              ))}
            </div>
          )}
          {(problems.length > 0 || unknown.length > 0) && (
            <ul className="studio-issues">
              {problems.map((message) => (
                <li key={message} className="error">
                  {message}
                </li>
              ))}
            </ul>
          )}

          <div className="deck-columns">
            <section aria-label="In the deck">
              <h3>In the deck</h3>
              {inDeck.map((card) => (
                <div key={card.folder} className="deck-row">
                  <span className="name">{card.data.name}</span>
                  <small>{glance(card.data)}</small>
                  <button
                    aria-label={`Remove one ${card.data.name}`}
                    onClick={() => bump(card.data.id, -1)}
                  >
                    −
                  </button>
                  <strong>{copies(card.data.id)}</strong>
                  <button
                    aria-label={`Add one ${card.data.name}`}
                    disabled={
                      copies(card.data.id) >= limitOf(card.data) ||
                      keyUsed(card.data) >= limitOf(card.data)
                    }
                    onClick={() => bump(card.data.id, 1)}
                  >
                    +
                  </button>
                </div>
              ))}
              {unknown.map((id) => (
                <div key={id} className="deck-row">
                  <span className="name">{id}</span>
                  <small>missing card</small>
                  <button onClick={() => bump(id, -deck!.cards[id])}>Drop</button>
                </div>
              ))}
              {!inDeck.length && !unknown.length && (
                <p className="studio-hint">Empty. Add cards from the pool or generate a draft.</p>
              )}
            </section>
            <section aria-label="Card pool">
              <h3>Card pool</h3>
              <input
                placeholder="Search the pool…"
                aria-label="Search the pool"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {shown.map((card) => (
                <div key={card.folder} className="deck-row">
                  <FactionDots members={named(card.data)} />
                  <span className="name">{card.data.name}</span>
                  <small>{glance(card.data)}</small>
                  <strong>{copies(card.data.id) || ""}</strong>
                  <button
                    aria-label={`Add one ${card.data.name}`}
                    disabled={
                      copies(card.data.id) >= limitOf(card.data) ||
                      keyUsed(card.data) >= limitOf(card.data)
                    }
                    onClick={() => bump(card.data.id, 1)}
                  >
                    +
                  </button>
                </div>
              ))}
              {!shown.length && <p className="studio-hint">No card in the pool matches.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
