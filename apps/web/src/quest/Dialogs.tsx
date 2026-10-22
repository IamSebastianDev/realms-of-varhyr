import { useEffect, useState } from "react";
import { Check, Heart, Layers, Skull, Sparkles, X } from "lucide-react";
import type { CardDefinition } from "@realms/contracts";
import { DraftPane } from "../draft/DraftPane";
import { Inspector } from "../draft/Inspector";
import { Rail, Workshop } from "../layout/Workshop";
import "../draft/draft.css";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { ArtCard, CardHoverButton } from "@realms/ui/CardPresentation";
import { cardCost } from "../deckTools";
import { SilverIcon } from "../Crowns";
import { SiteIcon } from "@realms/ui/siteIcons";
import { factionInfo } from "@realms/content";
import {
  actionsFor,
  bossName,
  questRules,
  smithValue,
  templateOf,
  type Action,
  type MapNode,
  type Offer,
  type Role,
  type RunState,
} from "@realms/quest";
import { questContent } from "./questStore";
import type { ActionResult } from "./results";

export const roleInfo: Record<
  Role,
  { name: string; text: string; icon: Parameters<typeof SiteIcon>[0]["site"] }
> = {
  city: {
    name: "City",
    icon: "city",
    text: "Smoke, noise and open stalls. Someone here is always selling, and someone always knows something.",
  },
  village: {
    name: "Village",
    icon: "village",
    text: "Smoke from a few chimneys, and neighbours who talk. Someone here always knows who needs a hand.",
  },
  shrine: {
    name: "Shrine",
    icon: "shrine",
    text: "A shrine that accepts offerings. What you leave behind, it answers in kind.",
  },
  ruin: {
    name: "Ruin",
    icon: "ruin",
    text: "Broken columns and older stones. Others have searched here, but not everywhere.",
  },
  waymark: {
    name: "Waymark",
    icon: "waymark",
    text: "A signpost carved by travellers who walked this road before you.",
  },
  arena: {
    name: "Arena",
    icon: "arena",
    text: "A walled ring where champions settle disputes for coin. The stakes are real, and so is the prize.",
  },
  capital: {
    name: "Capital",
    icon: "capital",
    text: "The seat of a faction. The best of what it makes is for sale here, at a price.",
  },
  landmark: { name: "Landmark", icon: "landmark", text: "A place the old songs still name." },
  encounter: {
    name: "The wilds",
    icon: "arena",
    text: "Something has made its camp here, and it has seen you coming.",
  },
  camp: {
    name: "Roadside camp",
    icon: "village",
    text: "A camp by the road with a fire still warm. The people here will tend your wounds for a fee.",
  },
  cache: {
    name: "A hidden cache",
    icon: "ruin",
    text: "Someone buried a stash here and never came back for it. It may be empty.",
  },
  merchant: {
    name: "Traveling merchant",
    icon: "village",
    text: "A cart pulled off the road, and a trader who has not asked your name.",
  },
  boss: {
    name: "The stronghold",
    icon: "arena",
    text: "A stronghold that nobody has taken. Whoever holds it will not give it up.",
  },
  unknown: { name: "A place on the road", icon: "ruin", text: "You cannot tell yet what is here." },
};
const actionLabels: Record<Action["type"], string> = {
  fight: "Fight",
  heal: "Pay for healing",
  shop: "Browse the wares",
  buy: "Buy",
  rumors: "Ask for rumors",
  accept: "Accept",
  search: "Search the place",
  read: "Read the waymark",
  exchange: "Make an offering",
  smith: "Visit the smith",
};

/** A painting above a pick screen (cards found, an offering made). It is simply left out when the file is missing. */
function OfferArt({ name }: { name: string }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [name]);
  return missing ? null : (
    <img
      className="quest-offer-art"
      src={`/quest/art/${name}.webp`}
      alt=""
      onError={() => setMissing(true)}
    />
  );
}
/** Location art: faction-specific if there is any, then the generic piece, then a painted placeholder. */
function LocationArt({
  role,
  affiliation,
  art,
}: {
  role: Role;
  affiliation: string;
  art?: string;
}) {
  const sources = [
    ...(art ? [`/quest/art/${art}.webp`] : []),
    `/quest/art/${role}-${affiliation}.webp`,
    `/quest/art/${role}.webp`,
  ];
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [role, affiliation, art]);
  const color = factionInfo[affiliation]?.color ?? "#a9c0ad";
  return (
    <div className="quest-art" style={{ ["--tint" as string]: color }}>
      {index < sources.length ? (
        <img src={sources[index]} alt="" onError={() => setIndex(index + 1)} />
      ) : (
        <SiteIcon site={roleInfo[role].icon} size={72} />
      )}
    </div>
  );
}

export function Hearts({ life }: { life: number }) {
  useLanguage();
  return (
    <span
      className="quest-hearts"
      role="img"
      aria-label={msg("{v0} of {v1} life", { v0: life, v1: questRules.maxLife })}
    >
      {Array.from({ length: questRules.maxLife }, (_, index) => (
        <Heart key={index} size={15} className={index < life ? "full" : ""} />
      ))}
    </span>
  );
}

export type Sublist = "exchange" | "smith" | null;
type DialogProps = {
  run: RunState;
  node: MapNode;
  notice: string;
  error: string;
  result?: ActionResult | null;
  dismiss?: () => void;
  act: (action: Action) => void;
  leave: () => void;
  openOffer: (offer: Offer) => void;
  offering: Sublist;
  setOffering: (value: Sublist) => void;
};
/** The one dialog every place opens: its picture, a line about it, and what you can do there. */
export function LocationDialog({
  run,
  node,
  notice,
  error,
  act,
  leave,
  offering,
  setOffering,
  result,
  dismiss,
}: DialogProps) {
  useLanguage();
  const encounter = run.encounter!,
    role = encounter.role,
    info = roleInfo[role];
  const faction = factionInfo[node.affiliation]?.name ?? "";
  const used = (type: string) => encounter.used.includes(type);
  const visited = run.visited.includes(node.id);
  const rate =
    role === "camp" ? questRules.campHealSilverPerLife : questRules.cityHealSilverPerLife;
  const missing = questRules.maxLife - run.life,
    canHeal = missing > 0 && run.silver >= rate;
  const boss = role === "boss" ? bossName(node.affiliation, run.seed, node.id) : "";
  const title = node.name || (role === "boss" ? boss : info.name);
  const actions = actionsFor(role).filter((type) => !(type === "fight" && visited));
  const repeatable = ["shop", "rumors", "smith"],
    disabled = (type: Action["type"]) =>
      (used(type) && !repeatable.includes(type)) ||
      (visited && ["search", "read", "exchange"].includes(type)) ||
      (type === "heal" && !canHeal) ||
      (type === "smith" && run.deck.length <= questRules.minDeck);
  return (
    <div className="quest-dialog-backdrop" role="presentation">
      <section className="quest-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <LocationArt role={role} affiliation={node.affiliation} art={result?.art} />
        {result ? (
          <div className={`quest-dialog-body quest-result ${result.kind}`} role="status">
            <header>
              <h2>{msg(result.title)}</h2>
              <small>{msg(title)}</small>
            </header>
            <div className="quest-result-gains">
              {!!result.silver && (
                <span className={`quest-gain ${result.silver < 0 ? "cost" : ""}`}>
                  <SilverIcon />
                  <b>
                    {result.silver > 0 ? "+" : "−"}
                    {Math.abs(result.silver)}
                  </b>
                  <small>{msg("silver")}</small>
                </span>
              )}
              {!!result.life && (
                <span className="quest-gain life">
                  <Heart size={26} />
                  <b>
                    {result.life > 0 ? "+" : "−"}
                    {Math.abs(result.life)}
                  </b>
                  <small>{msg("life")}</small>
                </span>
              )}
              {result.kind === "nothing" && (
                <span className="quest-gain empty">
                  <X size={26} />
                  <b>{msg("Empty")}</b>
                </span>
              )}
              {result.kind === "info" && (
                <span className="quest-gain">
                  <Sparkles size={26} />
                </span>
              )}
            </div>
            {result.detail && <p>{msg(result.detail)}</p>}
            <div className="quest-actions">
              <button className="gold-button" autoFocus onClick={dismiss}>
                {msg("Continue")}
              </button>
              <button className="outline-button" onClick={leave}>
                {msg("Leave")}
              </button>
            </div>
          </div>
        ) : (
          <div className="quest-dialog-body">
            <header>
              <h2>{msg(title)}</h2>
              {faction && node.affiliation !== "neutral" && <small>{msg(faction)}</small>}
            </header>
            <p>
              {role === "boss"
                ? msg(
                    "{v0} waits here. Everything you have gathered on this road decides how this ends.",
                    { v0: boss },
                  )
                : msg(info.text)}
            </p>
            {notice && (
              <p className="quest-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="quest-error" role="alert">
                {error}
              </p>
            )}
            <div className="quest-actions">
              {actions.map((type) => (
                <button
                  key={type}
                  className={type === "fight" ? "gold-button" : "outline-button"}
                  disabled={disabled(type)}
                  onClick={() =>
                    type === "exchange" || type === "smith"
                      ? setOffering(type)
                      : act({ type } as Action)
                  }
                >
                  {type === "fight" && <Skull size={15} />}
                  {type === "heal" && <Heart size={15} />}
                  {type === "search" && <Sparkles size={15} />}
                  {type === "shop" && <SilverIcon />}
                  {role === "boss" && type === "fight"
                    ? msg("Face {v0}", { v0: boss })
                    : type === "heal"
                      ? msg("Pay for healing ({v0} silver per life)", { v0: rate })
                      : msg(actionLabels[type])}
                  {used(type) && !repeatable.includes(type) && <Check size={14} />}
                </button>
              ))}
              {visited &&
                role !== "city" &&
                role !== "capital" &&
                actionsFor(role).includes("fight") && (
                  <p className="quest-notice">{msg("This place has been cleared.")}</p>
                )}
              <button className="outline-button" onClick={leave}>
                {msg("Leave")}
              </button>
            </div>
            {offering === "exchange" && (
              <CardList
                run={run}
                mode="exchange"
                close={() => setOffering(null)}
                choose={(index) => {
                  setOffering(null);
                  act({ type: "exchange", index });
                }}
              />
            )}
            {offering === "smith" && (
              <CardList
                run={run}
                mode="smith"
                close={() => setOffering(null)}
                choose={(index) => act({ type: "smith", index })}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Pick a card from the run deck: to exchange at a shrine, or to destroy at a smith for silver. Duplicates are shown once with a count. */
function CardList({
  run,
  mode,
  choose,
  close,
}: {
  run: RunState;
  mode: "exchange" | "smith";
  choose: (index: number) => void;
  close: () => void;
}) {
  useLanguage();
  const seen = new Set<string>(),
    locked = mode === "smith" && run.deck.length <= questRules.minDeck;
  return (
    <div
      className="quest-sacrifice"
      role="group"
      aria-label={
        mode === "smith" ? msg("Choose a card to destroy") : msg("Choose a card to give up")
      }
    >
      <h3>
        {mode === "smith" ? msg("Choose a card to destroy") : msg("Choose a card to give up")}
      </h3>
      {mode === "smith" && (
        <p className="quest-notice">
          {locked
            ? msg("Your deck is down to {v0} cards. Add a card before destroying another.", {
                v0: questRules.minDeck,
              })
            : msg("The smith pays half of what a card is worth.")}
        </p>
      )}
      <ul>
        {run.deck.map((id, index) => {
          if (seen.has(id)) return null;
          seen.add(id);
          const card = questContent.cards[id]!,
            count = run.deck.filter((other) => other === id).length;
          return (
            <li key={id}>
              <button className="outline-button" disabled={locked} onClick={() => choose(index)}>
                {msg(card.name)}
                {count > 1 && ` ×${count}`}{" "}
                <small>
                  {mode === "smith"
                    ? msg("+{v0} silver", { v0: smithValue(questContent, id) })
                    : msg(card.rarity)}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="outline-button" onClick={close}>
        {msg("Never mind")}
      </button>
    </div>
  );
}

/** Pick packs (the draft, spoils, finds, exchanges) and the shop, shown over everything else. */
export function OfferView({
  run,
  reduced,
  take,
  skip,
  buy,
  accept,
  close,
  showDeck,
}: {
  run: RunState;
  reduced: boolean;
  showDeck?: () => void;
  take: (id: string) => void;
  skip: () => void;
  buy: (index: number) => void;
  accept: (rumor: string) => void;
  close: () => void;
}) {
  useLanguage();
  const offer = run.offer!;
  const deckSize = run.deck.length;
  if (offer.kind === "rumors") {
    const rumors = run.rumors[offer.origin] ?? [];
    return (
      <div
        className="quest-offer quest-rumors"
        role="dialog"
        aria-modal="true"
        aria-label={msg("Rumors")}
      >
        <header>
          <h2>{msg("Rumors")}</h2>
        </header>
        <ul className="quest-rumor-list">
          {rumors.map((rumor) => {
            const template = templateOf(rumor.template);
            const reward = [
              rumor.reward.packs ? msg("{v0} boosters", { v0: rumor.reward.packs }) : "",
              rumor.reward.silver ? msg("{v0} silver", { v0: rumor.reward.silver }) : "",
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={rumor.id}>
                <div>
                  <strong>{msg(template.title)}</strong>
                  <p>{msg(template.text)}</p>
                  <small>
                    {msg("Reward")}: {reward}
                  </small>
                </div>
                <button
                  className={rumor.accepted ? "outline-button" : "gold-button"}
                  disabled={rumor.accepted}
                  onClick={() => accept(rumor.id)}
                >
                  {rumor.accepted ? msg("Accepted") : msg("Accept")}
                </button>
              </li>
            );
          })}
        </ul>
        <footer>
          <button className="outline-button" onClick={close}>
            {msg("Done")}
          </button>
        </footer>
      </div>
    );
  }
  if (offer.kind === "shop") {
    return (
      <div className="quest-offer" role="dialog" aria-modal="true" aria-label={msg("Shop")}>
        <header>
          <h2>{offer.premium ? msg("The capital's best") : msg("Wares")}</h2>
          <span className="quest-purse" title={msg("Silver carried on this expedition")}>
            <SilverIcon />
            <b>{run.silver}</b>
          </span>
        </header>
        <div className="quest-offer-cards">
          {offer.items.map((item, index) => {
            const card = questContent.cards[item.card]!;
            return (
              <div
                key={`${item.card}${index}`}
                className={`quest-offer-card ${item.sold ? "sold" : ""}`}
              >
                <ArtCard card={card} reduced={reduced} />
                <button
                  className="gold-button"
                  disabled={item.sold || run.silver < item.price}
                  onClick={() => buy(index)}
                >
                  {item.sold ? msg("Sold") : msg("Buy for {v0} silver", { v0: item.price })}
                </button>
              </div>
            );
          })}
        </div>
        <footer>
          {showDeck && (
            <button className="outline-button" onClick={showDeck}>
              <Layers size={15} />
              {msg("Your deck")}
            </button>
          )}
          <button className="outline-button" onClick={close}>
            {msg("Done")}
          </button>
        </footer>
      </div>
    );
  }
  const draft = offer.source === "draft";
  const left = offer.pick - offer.taken.length;
  const painting =
    offer.source === "found" ? "found-cards" : offer.source === "exchange" ? "offering" : "";
  return (
    <div className="quest-offer" role="dialog" aria-modal="true" aria-label={msg(offer.title)}>
      {painting && <OfferArt name={painting} />}
      <header>
        <h2>{draft ? msg("Draft your deck") : msg(offer.title)}</h2>
        <span>
          {draft
            ? msg("Pick {v0} of {v1}. Card {v2} of {v3}.", {
                v0: 1,
                v1: offer.size,
                v2: run.drafted + 1,
                v3: questRules.draftPicks,
              })
            : msg("Pick {v0} of {v1}", { v0: left, v1: offer.size })}
        </span>
      </header>
      <div className="quest-offer-cards">
        {offer.cards.map((id) => {
          const card = questContent.cards[id]!,
            taken = offer.taken.includes(id),
            copies = run.deck.filter((other) => other === id).length;
          return (
            <button
              key={id}
              className={`quest-offer-card pick ${taken ? "sold" : ""}`}
              disabled={taken}
              onClick={() => take(id)}
              aria-label={msg("Take {v0}", { v0: card.name })}
            >
              <ArtCard card={card} reduced={reduced} disabled={taken} />
              {copies > 0 && <small>{msg("{v0} in deck", { v0: copies })}</small>}
            </button>
          );
        })}
      </div>
      <footer>
        <span>{msg("{v0} cards in your deck", { v0: deckSize })}</span>
        {showDeck && (
          <button className="outline-button" onClick={showDeck}>
            <Layers size={15} />
            {msg("Your deck")}
          </button>
        )}
        {!draft && (
          <button className="outline-button" onClick={skip}>
            {offer.taken.length ? msg("Done") : msg("Take nothing")}
          </button>
        )}
      </footer>
    </div>
  );
}

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
    .map(([id, count]) => ({ card: questContent.cards[id]!, count }))
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
      className="quest-offer quest-deckview"
      role="dialog"
      aria-modal="true"
      aria-label={msg("Your deck")}
    >
      <header>
        <h2>{msg("Your quest deck")}</h2>
        <span>{msg("{v0} cards", { v0: run.deck.length })}</span>
        <div className="quest-deckview-tabs" role="group" aria-label={msg("View")}>
          <button aria-pressed={!cards} onClick={() => setCards(false)}>
            {msg("List")}
          </button>
          <button aria-pressed={cards} onClick={() => setCards(true)}>
            {msg("Cards")}
          </button>
        </div>
        <button className="quest-x" aria-label={msg("Close")} onClick={close}>
          <X size={18} />
        </button>
      </header>
      {cards ? (
        <div className="quest-offer-cards deck">
          {entries.map(({ card, count }) => (
            <div key={card.id} className="quest-offer-card">
              <ArtCard card={card} reduced={reduced} />
              {count > 1 && <small className="count">×{count}</small>}
            </div>
          ))}
        </div>
      ) : (
        <aside className="builder-deck quest-deckview-list">
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
    .map(([id, count]) => ({ card: questContent.cards[id]!, count }))
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

/**
 * The draft of an expedition: the pack in an inset panel and the growing deck in the same pane the deckbuilder and the
 * faction draft use. Choose a card, or drag it over. The run deck is not editable here; it only grows.
 */
export function DraftPage({
  run,
  reduced,
  take,
  leave,
  giveUp,
}: {
  run: RunState;
  reduced: boolean;
  take: (id: string) => void;
  leave: () => void;
  giveUp: () => void;
}) {
  useLanguage();
  const [confirm, setConfirm] = useState(false),
    [chosen, setChosen] = useState<number | null>(null),
    [over, setOver] = useState(false);
  const [inspected, setInspected] = useState<CardDefinition | null>(null);
  const offer = run.offer;
  useEffect(() => {
    setChosen(null);
  }, [run.drafted]);
  if (!offer || offer.kind !== "pick") return null;
  const total = questRules.baseDeck + questRules.draftPicks;
  const grab = (index: number) => {
    setChosen(null);
    take(offer.cards[index]!);
  };
  return (
    <Workshop
      label={msg("Draft your deck")}
      className="draft-workshop quest-workshop"
      backdrop={
        <div className="draft-backdrop">
          <div className="world-bg" />
          <div className="world-vignette" />
        </div>
      }
      panelLabel={msg("Cards in this pack")}
      back={{ label: msg("Back to the menu. Your run is saved."), onClick: leave }}
      title={msg("Draft your deck")}
      subtitle={msg("Pick {v0} of {v1}. Card {v2} of {v3}.", {
        v0: 1,
        v1: offer.size,
        v2: run.drafted + 1,
        v3: questRules.draftPicks,
      })}
      actions={
        confirm ? (
          <div className="quest-draft-exit">
            <span>{msg("Give up this expedition?")}</span>
            <button className="outline-button danger" onClick={giveUp}>
              {msg("Give up")}
            </button>
            <button className="outline-button" onClick={() => setConfirm(false)}>
              {msg("Keep going")}
            </button>
          </div>
        ) : (
          <button className="outline-button" onClick={() => setConfirm(true)}>
            {msg("Give up")}
          </button>
        )
      }
      rail={
        <Rail className="draft-rail">
          <span>{msg("Take one card. The rest of the pack is gone.")}</span>
          <button
            className="gold-button builder-save"
            disabled={chosen === null}
            onClick={() => chosen !== null && grab(chosen)}
          >
            {chosen === null ? msg("Choose a card") : msg("Take card")}
            <Check size={14} />
          </button>
        </Rail>
      }
      pane={
        <DraftPane
          cards={run.deck}
          target={total}
          unit={msg("cards")}
          inspect={setInspected}
          footer={msg("Drag a card here to take it.")}
          drop={{
            over,
            onDragOver: (event) => {
              event.preventDefault();
              setOver(true);
            },
            onDragLeave: () => setOver(false),
            onDrop: (event) => {
              event.preventDefault();
              setOver(false);
              const index = Number(event.dataTransfer.getData("text/plain"));
              if (
                event.dataTransfer.getData("text/plain") !== "" &&
                Number.isInteger(index) &&
                offer.cards[index]
              )
                grab(index);
            },
          }}
        />
      }
      overlays={
        inspected && (
          <Inspector card={inspected} reduced={reduced} close={() => setInspected(null)} />
        )
      }
    >
      <div className="draft-gallery">
        <div className="draft-gallery-grid">
          {offer.cards.map((id, index) => {
            const card = questContent.cards[id]!;
            return (
              <article
                key={`${id}-${index}`}
                className={`builder-card-tile ${chosen === index ? "has-copies" : ""}`}
                draggable
                onDragStart={(event) => {
                  setChosen(index);
                  event.dataTransfer.setData("text/plain", String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setOver(false)}
                onDoubleClick={() => grab(index)}
              >
                <ArtCard
                  card={card}
                  reduced={reduced}
                  detail={false}
                  selected={chosen === index}
                  onClick={() => setChosen(chosen === index ? null : index)}
                  interaction={{
                    "aria-label": msg("Choose {v0}", { v0: card.name }),
                    title: msg(
                      "Click to choose · double-click or drag to take · right-click to inspect",
                    ),
                    onContextMenu: (event) => {
                      event.preventDefault();
                      setInspected(card);
                    },
                  }}
                />
              </article>
            );
          })}
        </div>
      </div>
    </Workshop>
  );
}
