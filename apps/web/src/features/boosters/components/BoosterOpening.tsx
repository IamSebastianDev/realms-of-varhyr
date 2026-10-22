import { useAudio } from "../../../app/providers/AudioProvider";
import { FactionIcon } from "@realms/renderer/FactionIcon";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Crown, X } from "lucide-react";
import { registry } from "@realms/content";
import type { BoosterPack } from "@realms/content/boosters";
import type { CardDefinition } from "@realms/contracts";
import type { BoosterCardReward } from "../lib/boosterRewards";
import { ArtCard } from "@realms/ui/CardPresentation";
import { CrownAmount } from "../../../components/Crowns";
import { carouselPack, hasWebGL, SceneBoundary } from "./packScene";

const BoosterBurst3D = lazy(() => import("./BoosterBurst3D"));

export type OpenBooster = {
  id: string;
  cards: (BoosterCardReward & { crowns?: number })[];
  saved: boolean;
  pack: BoosterPack;
};

export const packColor = (pack: BoosterPack) => ({ "--pack-color": pack.color });
export const packSymbol = (pack: BoosterPack) => <FactionIcon faction={pack.icon} />;
/** Breaks a pack name into short lines for the pack face. */
export function packLines(name: string) {
  const lines: string[] = [];
  for (const word of name.toUpperCase().split(" ")) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= 12) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines.map((line, index) => (
    <span key={index} className="pack-line">
      {line}
    </span>
  ));
}
export function BoosterOpening({
  pack,
  reduced,
  suspended,
  close,
  openAnother,
  canOpenAnother = true,
  inspect,
  browse,
}: {
  pack: OpenBooster;
  reduced: boolean;
  suspended: boolean;
  close: () => void;
  openAnother: () => void;
  canOpenAnother?: boolean;
  inspect: (card: CardDefinition) => void;
  browse: () => void;
}) {
  useLanguage();
  const [opened, setOpened] = useState(reduced);
  const [revealed, setRevealed] = useState(reduced ? pack.cards.length : 0);
  const [skip, setSkip] = useState(false),
    [broken, setBroken] = useState(false),
    [armed] = useState(true);
  const scene3d = hasWebGL && !reduced && !broken;
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const complete = revealed === pack.cards.length;
  const crowns = pack.cards.reduce((sum, card) => sum + (card.crowns ?? 0), 0);
  const kept = pack.cards.filter((card) => !card.crowns).length;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const { playEffect } = useAudio();
  // The pack is heard as it is seen: a tearing build-up from the click, then the burst when the shards fly (BURST in BoosterBurst3D is 1.5 s).
  useEffect(() => {
    if (!armed) return;
    if (reduced) {
      playEffect("pack.burst");
      return;
    }
    playEffect("pack.open");
    const timer = window.setTimeout(() => playEffect("pack.burst"), scene3d ? 1500 : 850);
    return () => window.clearTimeout(timer);
  }, [armed, reduced, scene3d, playEffect]);
  useEffect(() => {
    const shown = pack.cards[revealed - 1];
    if (!shown || revealed > pack.cards.length) return;
    playEffect(registry.cards[shown.id].rarity === "common" ? "card.flip" : "pack.rare");
  }, [revealed, pack, playEffect]);
  useEffect(() => {
    if (complete && !suspended && document.activeElement === document.body)
      closeRef.current?.focus();
  }, [complete, suspended]);
  // Without 3D the flat pack breaks on a timer; with it the scene reports when its burst is over.
  useEffect(() => {
    if (skip || reduced) {
      setOpened(true);
      setRevealed(pack.cards.length);
      return;
    }
    if (scene3d) return;
    if (!armed) return;
    const timer = window.setTimeout(() => setOpened(true), 850);
    return () => window.clearTimeout(timer);
  }, [pack.cards, reduced, skip, scene3d, armed]);
  useEffect(() => {
    if (!opened || skip || reduced) return;
    const timers = pack.cards.map((_, index) =>
      window.setTimeout(() => setRevealed(index + 1), 400 + index * 320),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [opened, pack.cards, reduced, skip]);

  function trapFocus(event: KeyboardEvent) {
    if (event.key !== msg("Tab") || suspended) return;
    const buttons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const first = buttons[0],
      last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className={`modal-backdrop booster-backdrop ${reduced ? "reduced-motion" : ""}`}
      aria-hidden={suspended || undefined}
      inert={suspended}
      style={packColor(pack.pack) as React.CSSProperties}
    >
      <section
        ref={dialogRef}
        className="booster-dialog"
        role="dialog"
        aria-modal={!suspended || undefined}
        aria-label={msg("Booster rewards")}
        onKeyDown={trapFocus}
      >
        <button
          ref={closeRef}
          className="booster-close"
          aria-label={msg("Close booster")}
          onClick={close}
        >
          <X size={22} />
        </button>
        <header className="booster-heading">
          <h2>{msg(pack.pack.name)}</h2>
          <p role="status" aria-live="polite">
            {complete
              ? msg("{v0} {v1} added{v2}", {
                  v0: kept,
                  v1: kept === 1 ? "card" : "cards",
                  v2: crowns ? ` · ${crowns} crowns from extra copies` : "",
                })
              : opened
                ? msg("Revealing cards · {v0} / 5", { v0: revealed })
                : armed
                  ? msg("Breaking the seal…")
                  : msg("Ready to open")}
          </p>
        </header>
        {!opened ? (
          scene3d ? (
            <div className="booster-burst-stage">
              <div className="booster-burst-canvas" aria-hidden="true">
                <SceneBoundary onError={() => setBroken(true)} fallback={null}>
                  <Suspense fallback={null}>
                    <BoosterBurst3D
                      pack={carouselPack(pack.pack)}
                      tagline={msg("FIVE CARDS")}
                      go={armed}
                      done={() => setOpened(true)}
                    />
                  </Suspense>
                </SceneBoundary>
              </div>
            </div>
          ) : (
            <div className={`booster-pack-stage ${armed ? "" : "waiting"}`}>
              <div className="booster-pack-glow" />
              <div className="booster-pack">
                <span>REALMS OF VARHYR</span>
                {packSymbol(pack.pack) ? (
                  <b className="pack-symbol">{packSymbol(pack.pack)}</b>
                ) : (
                  <Crown size={55} />
                )}
                <strong>{packLines(msg(pack.pack.name))}</strong>
                <small>{msg("FIVE CARDS")}</small>
              </div>
              <div className="booster-sparks">
                {Array.from({ length: 12 }, (_, index) => (
                  <i
                    key={index}
                    style={{ "--spark-angle": `${index * 30}deg` } as React.CSSProperties}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="booster-grid">
            {pack.cards.map((reward, index) => {
              const card = registry.cards[reward.id],
                visible = index < revealed;
              return (
                <div
                  className={`booster-slot ${visible ? "revealed" : ""} ${reward.crowns ? "is-reclaimed" : ""} rarity-${card.rarity}`}
                  key={index}
                >
                  <div className="booster-flip">
                    <div className="booster-card-back" aria-hidden="true">
                      <Crown size={32} />
                      <span>V</span>
                    </div>
                    <div className="booster-card-front" aria-hidden={!visible} inert={!visible}>
                      <ArtCard
                        card={card}
                        reduced={reduced}
                        onClick={() => inspect(card)}
                        className="booster-card"
                      />
                    </div>
                  </div>
                  <div
                    className={`booster-card-caption ${visible ? "" : "unrevealed"}`}
                    aria-hidden={!visible}
                  >
                    <span>{card.rarity}</span>
                    {reward.crowns ? (
                      <div className="booster-crown-reward">
                        <CrownAmount amount={reward.crowns} />
                        <small>{msg("Extra copy sold")}</small>
                      </div>
                    ) : (
                      <small>
                        {reward.isNew
                          ? msg("New to your collection")
                          : msg("+1 copy · {v0} owned", { v0: reward.copies })}
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!pack.saved && (
          <p className="booster-storage-error" role="alert">
            {msg(
              "These rewards are available for this session, but browser storage could not save them.",
            )}
          </p>
        )}
        <div
          className={`booster-crown-total ${complete && crowns > 0 ? "" : "idle"}`}
          aria-hidden={!(complete && crowns > 0)}
        >
          {msg("Earned")}
          <CrownAmount amount={crowns} />
        </div>
        <footer className="booster-actions">
          {!complete ? (
            <button
              className="outline-button"
              onClick={() => {
                setSkip(true);
                closeRef.current?.focus();
              }}
            >
              {msg("Reveal all")}
            </button>
          ) : (
            <>
              <button className="outline-button" onClick={browse}>
                {msg("View cards")}
              </button>
              <button className="gold-button" disabled={!canOpenAnother} onClick={openAnother}>
                {msg("Open another")}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <small>
            {canOpenAnother
              ? msg("More of these boosters are waiting in your inventory.")
              : msg("No more of this booster. Crowns can buy another in the store.")}
          </small>
        </footer>
      </section>
    </div>
  );
}
