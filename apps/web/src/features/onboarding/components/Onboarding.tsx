import { stageWidth } from "@realms/ui/stage";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { avatarDefinitions, factionInfo, registry } from "@realms/content";
import { Avatar } from "../../../components/Avatar";
import { ArtCard } from "@realms/ui/CardPresentation";
import { createCollection } from "../../collection/lib/collection";
import { updateCollection } from "../../collection/stores/collectionStore";
import { decksKey, type CustomDeck } from "../../decks/lib/decks";
import { markAccount, starterOffers, type StarterOffer } from "../lib/onboardingState";
import { maxNameLength, updateProfile } from "../../profile/stores/profile";
import { usePreferences } from "@realms/ui/preferences";

type Step = "starter" | "name" | "reveal";
const colorOf = (offer: StarterOffer) =>
  ({ "--ob-color": factionInfo[offer.faction]?.color ?? "#d7b66b" }) as CSSProperties;
/** Fixed values, so the embers are the same on every render and never need randomness during rendering. */
const unit = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const embers = Array.from(
  { length: 34 },
  (_, i) =>
    ({
      "--x": `${Math.round(unit(i) * 100)}%`,
      "--s": `${(3 + unit(i + 50) * 4).toFixed(1)}px`,
      "--dur": `${(10 + unit(i + 90) * 10).toFixed(1)}s`,
      "--delay": `-${(unit(i + 130) * 20).toFixed(1)}s`,
      "--drift": `${Math.round((unit(i + 170) - 0.5) * 160)}px`,
      "--o": (0.6 + unit(i + 210) * 0.4).toFixed(2),
    }) as CSSProperties,
);
const heroOf = (offer: StarterOffer) => avatarDefinitions.find((a) => a.id === offer.avatar)!;
const showcase = (offer: StarterOffer) => [...offer.cards].reverse().slice(0, 3);

/** First-run flow: pick a starter deck, name yourself, then watch the deck's cards turn over. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  useLanguage();
  const { reduced } = usePreferences();
  const offers = useMemo(starterOffers, []);
  const [step, setStep] = useState<Step>("starter");
  const [choice, setChoice] = useState(offers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState(1);
  const swipe = useRef<number | null>(null);
  const index = Math.max(
      0,
      offers.findIndex((o) => o.id === choice),
    ),
    offer = offers[index];
  // The gallery has no ends: after the last deck comes the first.
  const go = (step: number) => {
    setDirection(step);
    setChoice(offers[(index + step + offers.length) % offers.length].id);
  };
  useEffect(() => {
    if (!offer || step !== "starter") return;
    const keys = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });
  if (!offer) return null;
  const hero = heroOf(offer);
  const trimmed = name.trim();

  function begin() {
    updateProfile({ name: trimmed, avatar: offer.avatar });
    const cards = offer.cards.flatMap((card) => Array<string>(card.copies).fill(card.id));
    updateCollection(() => createCollection(registry, cards, undefined, offer.faction));
    // The starter also becomes the player's first saved deck, so the deck builder is not empty.
    const starter: CustomDeck = {
      id: `custom-${crypto.randomUUID()}`,
      name: msg(offer.name),
      cards,
    };
    try {
      localStorage.setItem(decksKey, JSON.stringify([starter]));
    } catch {
      /* the deck builder will simply start empty */
    }
    markAccount();
    setStep("reveal");
  }

  return (
    <div className={`onboarding ${reduced ? "reduced-motion" : ""}`} style={colorOf(offer)}>
      <div className="ob-backdrop" aria-hidden="true">
        <span className="ob-embers">
          {embers.map((style, i) => (
            <i key={i} style={style} />
          ))}
        </span>
        {/* The leader of the highlighted realm looms behind the cards and changes with them. */}
        {step === "starter" && (
          <img key={hero.art} className="ob-backdrop-hero" src={hero.art} alt="" />
        )}
      </div>
      {step === "starter" && (
        <main className="ob-stage ob-starters" aria-labelledby="ob-title">
          <header>
            <small>{msg("Realms of Varhyr")}</small>
            <h1 id="ob-title">{msg("Choose your banner")}</h1>
            <p>
              {msg(
                "Your starter deck decides which realm you first fight for. You can build with any card you collect later.",
              )}
            </p>
          </header>
          <div
            className="ob-carousel"
            role="group"
            aria-roledescription="carousel"
            aria-label={msg("Starter deck")}
            onPointerDown={(event) => {
              swipe.current = event.clientX;
            }}
            onPointerUp={(event) => {
              if (swipe.current !== null && Math.abs(event.clientX - swipe.current) > 60)
                go(event.clientX < swipe.current ? 1 : -1);
              swipe.current = null;
            }}
          >
            <div
              className={`ob-track ${direction > 0 ? "from-right" : "from-left"}`}
              key={offer.id}
            >
              {[-1, 0, 1].map((side) => {
                const o = offers[(index + side + offers.length) % offers.length],
                  centre = side === 0;
                if (!centre && offers.length < 2)
                  return <span className="ob-offer ob-gap" key={side} aria-hidden="true" />;
                return (
                  <article
                    key={side}
                    className={`ob-offer ${centre ? "on" : "ob-side"}`}
                    style={colorOf(o)}
                    aria-hidden={!centre}
                    aria-live={centre ? "polite" : undefined}
                    aria-label={centre ? `${index + 1} / ${offers.length}` : undefined}
                    onClick={centre ? undefined : () => go(side)}
                  >
                    <span className="ob-offer-portrait">
                      <Avatar id={o.avatar} />
                    </span>
                    <span className="ob-offer-body">
                      <strong>{msg(factionInfo[o.faction]?.name ?? o.faction)}</strong>
                      <em>{msg(o.name)}</em>
                      <span className="ob-offer-hero">{msg(o.leader)}</span>
                      <span className="ob-offer-lore">{msg(heroOf(o).lore)}</span>
                      <span className="ob-offer-fan" aria-hidden="true">
                        {showcase(o).map((card) => (
                          <span key={card.id}>
                            <ArtCard
                              card={registry.cards[card.id]}
                              detail={false}
                              reduced
                              className="ob-fan-card"
                            />
                          </span>
                        ))}
                      </span>
                      <small>
                        {msg("{v0} cards · {v1} different", { v0: o.total, v1: o.cards.length })}
                      </small>
                    </span>
                  </article>
                );
              })}
            </div>
          </div>
          {offers.length > 1 && (
            <div className="ob-controls">
              <button
                className="ob-arrow"
                aria-label={msg("Previous starter deck")}
                onClick={() => go(-1)}
              >
                <ChevronLeft size={24} />
              </button>
              <div className="ob-pages" aria-hidden="true">
                {offers.map((o) => (
                  <i key={o.id} className={o.id === offer.id ? "on" : ""} />
                ))}
              </div>
              <button
                className="ob-arrow"
                aria-label={msg("Next starter deck")}
                onClick={() => go(1)}
              >
                <ChevronRight size={24} />
              </button>
            </div>
          )}
          <footer>
            <button className="gold-button" onClick={() => setStep("name")}>
              {msg("Continue")}
              <ArrowRight size={16} />
            </button>
          </footer>
        </main>
      )}
      {step === "name" && (
        <main className="ob-stage ob-name" aria-labelledby="ob-title">
          <div className="ob-hero">
            <span className="ob-hero-portrait">
              <Avatar id={offer.avatar} />
            </span>
          </div>
          <header>
            <small>{msg(hero.title)}</small>
            <h1 id="ob-title">{msg("What are you called?")}</h1>
            <p>
              {msg(
                "Your name is shown to opponents and on your side of the battlefield. {v0} will be your portrait for now.",
                { v0: msg(hero.name) },
              )}
            </p>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmed) begin();
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={maxNameLength}
              placeholder={msg("Player name")}
              aria-label={msg("Player name")}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
            <div className="ob-actions">
              <button type="button" className="outline-button" onClick={() => setStep("starter")}>
                <ArrowLeft size={16} />
                {msg("Back")}
              </button>
              <button type="submit" className="gold-button" disabled={!trimmed}>
                {msg("Claim your deck")}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </main>
      )}
      {step === "reveal" && <Reveal offer={offer} name={trimmed} reduced={reduced} done={onDone} />}
    </div>
  );
}

/** Cards are revealed one row at a time so the screen never scrolls: a row turns over, then "Reveal more" brings the next. */
function Reveal({
  offer,
  name,
  reduced,
  done,
}: {
  offer: StarterOffer;
  name: string;
  reduced: boolean;
  done: () => void;
}) {
  const total = offer.cards.length;
  const [size, setSize] = useState(6);
  const [pageStart, setPageStart] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [skip, setSkip] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  // How many cards fit on one line (slot width and gap match onboarding.css).
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const measure = () => {
      const slot = stageWidth() <= 700 ? 104 : 168;
      setSize(Math.max(2, Math.floor((node.clientWidth + 16) / (slot + 16))));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  // A new line width starts the current line again from its first card.
  const pageStartRef = useRef(0);
  pageStartRef.current = pageStart;
  useEffect(() => {
    const next = Math.floor(pageStartRef.current / size) * size;
    setPageStart(next);
    setRevealed(next);
  }, [size]);
  const pageEnd = Math.min(total, pageStart + size);
  const pageDone = revealed >= pageEnd,
    last = pageEnd >= total,
    complete = last && pageDone;
  useEffect(() => {
    if (skip || reduced) {
      setRevealed(pageEnd);
      return;
    }
    const timers: number[] = [];
    let at = pageStart === 0 ? 900 : 350;
    offer.cards.slice(pageStart, pageEnd).forEach((card, index) => {
      timers.push(window.setTimeout(() => setRevealed(pageStart + index + 1), at));
      // Rare and legendary cards earn a longer beat before the next card.
      at +=
        registry.cards[card.id].rarity === "legendary"
          ? 1100
          : registry.cards[card.id].rarity === "rare"
            ? 480
            : 260;
    });
    return () => timers.forEach(window.clearTimeout);
  }, [offer, reduced, skip, pageStart, pageEnd]);
  useEffect(() => {
    if (pageDone) actionRef.current?.focus();
  }, [pageDone, pageStart]);
  const more = () => {
    setSkip(false);
    setPageStart(pageEnd);
  };
  const legendaryLanded = offer.cards.some(
    (card, index) => index < revealed && registry.cards[card.id].rarity === "legendary",
  );
  const pages = Math.ceil(total / size),
    page = Math.floor(pageStart / size);

  return (
    <main
      className={`ob-stage ob-reveal ${legendaryLanded ? "legend-landed" : ""}`}
      aria-labelledby="ob-title"
    >
      <header>
        <small>{msg(offer.name)}</small>
        <h1 id="ob-title">
          {complete ? msg("Your deck is ready, {v0}", { v0: name }) : msg("Unsealing your deck…")}
        </h1>
        <p role="status" aria-live="polite">
          {complete
            ? msg(
                "{v0} cards joined your collection. Five boosters are waiting in your inventory.",
                { v0: offer.total },
              )
            : msg("{v0} / {v1} different cards", { v0: revealed, v1: total })}
        </p>
      </header>
      <div className="ob-gridwrap" ref={wrap}>
        <div className="booster-grid ob-grid" key={pageStart}>
          {offer.cards.slice(pageStart, pageEnd).map((entry, offset) => {
            const card = registry.cards[entry.id],
              visible = pageStart + offset < revealed;
            return (
              <div
                className={`booster-slot ob-slot ${visible ? "revealed" : ""} rarity-${card.rarity}`}
                key={entry.id}
              >
                <div className="booster-flip">
                  <div className="booster-card-back" aria-hidden="true">
                    <Crown size={28} />
                    <span>V</span>
                  </div>
                  <div className="booster-card-front" aria-hidden={!visible} inert={!visible}>
                    <ArtCard card={card} reduced={reduced} className="booster-card" />
                    <b
                      className="ob-copies"
                      aria-label={msg("× {v0} in your deck", { v0: entry.copies })}
                    >
                      ×{entry.copies}
                    </b>
                  </div>
                </div>
                <div
                  className={`booster-card-caption ${visible ? "" : "unrevealed"}`}
                  aria-hidden={!visible}
                >
                  <span>{card.rarity}</span>
                </div>
              </div>
            );
          })}
        </div>
        {pages > 1 && (
          <div className="ob-pages" aria-hidden="true">
            {Array.from({ length: pages }, (_, index) => (
              <i key={index} className={index === page ? "on" : index < page ? "seen" : ""} />
            ))}
          </div>
        )}
      </div>
      <footer>
        {complete ? (
          <button ref={actionRef} className="gold-button" onClick={done}>
            {msg("Enter the realm")}
            <ArrowRight size={16} />
          </button>
        ) : pageDone ? (
          <button ref={actionRef} className="gold-button" onClick={more}>
            {msg("Reveal more")}
            <ArrowRight size={16} />
          </button>
        ) : (
          <button className="outline-button" onClick={() => setSkip(true)}>
            {msg("Reveal now")}
          </button>
        )}
      </footer>
    </main>
  );
}
