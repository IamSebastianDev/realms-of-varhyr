import { useState } from "react";
import { Layers, Swords } from "lucide-react";
import { factionInfo } from "@realms/content";
import {
  available,
  enemyOf,
  eventOf,
  priceOf,
  text,
  type AdventureDef,
  type Choice,
  type RunState,
  type View,
} from "@realms/adventure";
import { ArtCard } from "@realms/ui/CardPresentation";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { SilverIcon } from "../../../components/Crowns";
import { adventureContent } from "../stores/adventureStore";
import { factionArenas, fallbackArena } from "../../match/lib/arenas";

const artUrl = (def: AdventureDef, name?: string) =>
  name ? `/adventures/${def.id}/${name}.webp` : undefined;

/** An authored scene: a framed painting, text over it, and either Continue or the choices. Reading is never timed. */
export function EventScene({
  def,
  run,
  view,
  next,
  choose,
}: {
  def: AdventureDef;
  run: RunState;
  view: Extract<View, { kind: "event" }>;
  next: () => void;
  choose: (choice: Choice) => void;
}) {
  const language = useLanguage();
  const event = eventOf(def, view.event);
  if (!event) return null;
  const last = view.beat >= event.beats.length - 1,
    chosen = event.choices?.find((choice) => choice.id === view.chosen);
  const art = artUrl(def, event.beats[view.beat]?.art ?? event.art),
    tint = factionInfo[def.faction]?.color;
  const body = chosen ? text(chosen.result, language) : text(event.beats[view.beat], language);
  return (
    <section
      className="adv-scene"
      role="dialog"
      aria-modal="true"
      aria-label={text(event.title, language) || msg("Story")}
      style={{ ["--tint" as string]: tint }}
    >
      <div
        className="adv-scene-art"
        style={art ? { backgroundImage: `url("${art}")` } : undefined}
      />
      <div className="adv-scene-text">
        <div className="adv-scene-heading">
          {event.title && <h2>{text(event.title, language)}</h2>}
          <span className="adv-scene-progress" aria-hidden="true">
            {event.beats.map((_, index) => (
              <i key={index} className={index === view.beat ? "is-current" : ""} />
            ))}
          </span>
        </div>
        <p key={`${view.beat}-${view.chosen ?? ""}`} aria-live="polite">
          {body}
        </p>
        <div className="adv-scene-actions">
          {chosen || !last || !event.choices?.length ? (
            <button className="bronze-button" onClick={next} autoFocus>
              {msg("Continue")}
            </button>
          ) : (
            event.choices.map((choice) => {
              const open = available(run, choice.when);
              return (
                <button
                  key={choice.id}
                  className="bronze-button"
                  disabled={!open}
                  onClick={() => choose(choice)}
                >
                  {text(choice.label, language)}
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

/** The opponent waiting at a battle location. */
export function BattleIntro({
  def,
  view,
  fight,
}: {
  def: AdventureDef;
  view: Extract<View, { kind: "battle" }>;
  fight: () => void;
}) {
  const language = useLanguage();
  const enemy = enemyOf(def, view.enemy);
  if (!enemy) return null;
  return (
    <div className="adv-dialog-backdrop">
      <section
        className="adv-battle-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={text(enemy.name, language)}
        style={{ ["--tint" as string]: factionInfo[enemy.faction]?.color }}
      >
        <div
          className="adv-battle-art"
          style={{
            backgroundImage: `url("${artUrl(def, enemy.art) ?? factionArenas[enemy.faction]?.art ?? fallbackArena.art}")`,
          }}
        />
        <div className="adv-battle-copy">
          <small>{view.elite ? msg("Elite battle") : msg("Battle")}</small>
          <h2>{text(enemy.name, language)}</h2>
          <p>
            {text(enemy.intro, language) || msg(factionInfo[enemy.faction]?.name ?? enemy.faction)}
          </p>
          <div className="adv-scene-actions">
            <button className="bronze-button" onClick={fight} autoFocus>
              <Swords size={15} />
              {msg("Fight")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** A legendary encounter is recorded immediately and is awarded to the account when the run ends. */
export function RecruitView({
  view,
  reduced,
  next,
}: {
  view: Extract<View, { kind: "recruit" }>;
  reduced: boolean;
  next: () => void;
}) {
  const card = adventureContent.cards[view.card];
  if (!card) return null;
  return (
    <div className="adv-dialog-backdrop">
      <section
        className="adv-recruit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={msg("Legendary discovered")}
      >
        <div className="adv-recruit-card">
          <ArtCard card={card} reduced={reduced} />
        </div>
        <div className="adv-recruit-copy">
          <small>{msg("Legendary discovered")}</small>
          <h2>{msg(card.name)}</h2>
          <p>
            {view.added
              ? msg("This card has joined your adventure deck.")
              : msg("You encountered this legendary during your adventure.")}
          </p>
          <p>{msg("It will be added to your collection when the adventure ends.")}</p>
          <button className="bronze-button" onClick={next} autoFocus>
            {msg("Continue")}
          </button>
        </div>
      </section>
    </div>
  );
}

const Cards = ({
  run,
  showDeck,
  children,
}: {
  run: RunState;
  showDeck: () => void;
  children?: React.ReactNode;
}) => (
  <footer>
    <span>{msg("{v0} cards in your deck", { v0: run.deck.length })}</span>
    <button className="outline-button" onClick={showDeck}>
      <Layers size={15} />
      {msg("Your deck")}
    </button>
    {children}
  </footer>
);

/** Choose from a pick pack: after a battle, or from a scene. */
export function PickView({
  run,
  view,
  reduced,
  take,
  skip,
  showDeck,
}: {
  run: RunState;
  view: Extract<View, { kind: "pick" }>;
  reduced: boolean;
  take: (card: string) => void;
  skip: () => void;
  showDeck: () => void;
}) {
  const left = view.pick - view.taken;
  return (
    <div className="adv-offer" role="dialog" aria-modal="true" aria-label={msg("Choose a card")}>
      <header>
        <h2>{view.source === "battle" ? msg("Spoils") : msg("Choose a card")}</h2>
        <span>{msg("Pick {v0} of {v1}", { v0: left, v1: view.cards.length + view.taken })}</span>
      </header>
      <div className="adv-offer-cards">
        {view.cards.map((id) => {
          const card = adventureContent.cards[id]!,
            copies = run.deck.filter((other) => other === id).length;
          return (
            <button
              key={id}
              className="adv-offer-card pick"
              onClick={() => take(id)}
              aria-label={msg("Take {v0}", { v0: card.name })}
            >
              <ArtCard card={card} reduced={reduced} />
              {copies > 0 && <small>{msg("{v0} in deck", { v0: copies })}</small>}
            </button>
          );
        })}
      </div>
      <Cards run={run} showDeck={showDeck}>
        <button className="outline-button" onClick={skip}>
          {view.taken ? msg("Done") : msg("Take nothing")}
        </button>
      </Cards>
    </div>
  );
}

export function ShopView({
  def,
  run,
  view,
  reduced,
  buy,
  leave,
  showDeck,
}: {
  def: AdventureDef;
  run: RunState;
  view: Extract<View, { kind: "shop" }>;
  reduced: boolean;
  buy: (card: string) => void;
  leave: () => void;
  showDeck: () => void;
}) {
  return (
    <div className="adv-offer adv-shop" role="dialog" aria-modal="true" aria-label={msg("Shop")}>
      <header>
        <h2>{msg("Wares")}</h2>
        <span className="adv-purse" title={msg("Silver carried on this adventure")}>
          <SilverIcon />
          <b>{run.silver}</b>
        </span>
      </header>
      <div className="adv-offer-cards">
        {view.stock.map((id) => {
          const card = adventureContent.cards[id]!,
            sold = view.bought.includes(id),
            price = priceOf(def, adventureContent, id);
          return (
            <div key={id} className={`adv-offer-card ${sold ? "sold" : ""}`}>
              <ArtCard card={card} reduced={reduced} />
              <button
                className="gold-button"
                disabled={sold || run.silver < price}
                onClick={() => buy(id)}
              >
                {sold ? msg("Sold") : msg("Buy for {v0} silver", { v0: price })}
              </button>
            </div>
          );
        })}
      </div>
      <Cards run={run} showDeck={showDeck}>
        <button className="outline-button" onClick={leave}>
          {msg("Done")}
        </button>
      </Cards>
    </div>
  );
}

/** A camp: take one of the offered cards, swap a card of your deck for one, or drop a card. One choice, then on. */
export function ImproveView({
  run,
  view,
  reduced,
  take,
  exchange,
  remove,
  skip,
  showDeck,
  minimum,
}: {
  run: RunState;
  view: Extract<View, { kind: "improve" }>;
  reduced: boolean;
  take: (card: string) => void;
  exchange: (out: string, card: string) => void;
  remove: (card: string) => void;
  skip: () => void;
  showDeck: () => void;
  minimum: number;
}) {
  const [step, setStep] = useState<{ kind: "swap"; card: string } | { kind: "remove" } | null>(
    null,
  );
  const seen = new Set<string>();
  if (step)
    return (
      <div className="adv-offer" role="dialog" aria-modal="true" aria-label={msg("Choose a card")}>
        <header>
          <h2>
            {step.kind === "swap" ? msg("Choose a card to give up") : msg("Choose a card to drop")}
          </h2>
        </header>
        {step.kind === "remove" && run.deck.length <= minimum && (
          <p className="adv-notice">
            {msg("Your deck is down to {v0} cards. Add a card before dropping another.", {
              v0: minimum,
            })}
          </p>
        )}
        <ul className="adv-deck-pick">
          {run.deck.map((id) => {
            if (seen.has(id)) return null;
            seen.add(id);
            const card = adventureContent.cards[id]!,
              count = run.deck.filter((other) => other === id).length;
            return (
              <li key={id}>
                <button
                  className="outline-button"
                  disabled={step.kind === "remove" && run.deck.length <= minimum}
                  onClick={() => (step.kind === "swap" ? exchange(id, step.card) : remove(id))}
                >
                  {msg(card.name)}
                  {count > 1 && ` ×${count}`} <small>{msg(card.rarity)}</small>
                </button>
              </li>
            );
          })}
        </ul>
        <footer>
          <button className="outline-button" onClick={() => setStep(null)}>
            {msg("Never mind")}
          </button>
        </footer>
      </div>
    );
  return (
    <div className="adv-offer" role="dialog" aria-modal="true" aria-label={msg("Camp")}>
      <header>
        <h2>{msg("Camp")}</h2>
        <span>{msg("Add one card, swap one, or drop one")}</span>
      </header>
      <div className="adv-offer-cards">
        {view.cards.map((id) => {
          const card = adventureContent.cards[id]!;
          return (
            <div key={id} className="adv-offer-card">
              <ArtCard card={card} reduced={reduced} />
              <div className="adv-offer-actions">
                <button className="gold-button" onClick={() => take(id)}>
                  {msg("Add")}
                </button>
                <button
                  className="outline-button"
                  onClick={() => setStep({ kind: "swap", card: id })}
                >
                  {msg("Swap")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Cards run={run} showDeck={showDeck}>
        <button className="outline-button" onClick={() => setStep({ kind: "remove" })}>
          {msg("Drop a card")}
        </button>
        <button className="outline-button" onClick={skip}>
          {msg("Move on")}
        </button>
      </Cards>
    </div>
  );
}
