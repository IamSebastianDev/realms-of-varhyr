import { t as msg, useLanguage } from "@realms/ui/i18n";
import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { CardBackFace, unlockText } from "./CardBackFace";
import { cardBacks, isBackUnlocked } from "./cardBacks";
import { buyCardBack, useBoughtBacks } from "./cardBackStore";
import { useGoals } from "./goalsStore";
import { CrownAmount } from "./Crowns";

/** The Store's card back shelf: one sleeve in focus, with the same Buy button as the boosters. Backs are picked per deck in the deck builder. */
export function CardBacksShop({ crowns }: { crowns: number }) {
  useLanguage();
  const goals = useGoals(),
    bought = useBoughtBacks(),
    [index, setIndex] = useState(0);
  const count = cardBacks.length,
    back = cardBacks[index],
    have = isBackUnlocked(back, goals, bought);
  const step = (by: number) => setIndex((value) => (value + by + count) % count);
  const canBuy = back.source === "shop" && !have && crowns >= back.price!;
  return (
    <div
      className="backs-shop"
      role="group"
      aria-roledescription="carousel"
      aria-label={msg("Card backs")}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-1);
        else if (event.key === "ArrowRight") step(1);
      }}
    >
      <div
        className="backs-stage"
        onDoubleClick={() => {
          if (canBuy) buyCardBack(back.id);
        }}
        title={back.source === "shop" && !have ? msg("Double-click to buy") : undefined}
      >
        <button
          className="store-arrow left"
          aria-label={msg("Previous card back")}
          onClick={() => step(-1)}
        >
          <ChevronLeft size={26} />
        </button>
        <CardBackFace id={back.id} className={have ? "have" : ""} />
        <button
          className="store-arrow right"
          aria-label={msg("Next card back")}
          onClick={() => step(1)}
        >
          <ChevronRight size={26} />
        </button>
      </div>
      <div className="backs-info" aria-live="polite">
        <h2>{msg(back.name)}</h2>
        <p>
          {back.source === "free"
            ? msg("Included")
            : have
              ? msg("Unlocked")
              : back.source === "shop"
                ? ""
                : unlockText(back)}
        </p>
        <div className="store-buy">
          {back.source === "shop" && !have ? (
            <button
              className="outline-button store-crown-buy"
              aria-label={msg("Buy {v0} card back for {v1} crowns", {
                v0: msg(back.name),
                v1: back.price!,
              })}
              disabled={crowns < back.price!}
              onClick={() => buyCardBack(back.id)}
            >
              {msg("Buy")}
              <CrownAmount amount={back.price!} />
            </button>
          ) : (
            <span className={`backs-state ${have ? "" : "off"}`}>
              {have ? (
                <>
                  <Check size={16} />
                  {msg("Yours")}
                </>
              ) : (
                <>
                  <Lock size={15} />
                  {msg("Locked")}
                </>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="backs-strip" role="listbox" aria-label={msg("Card backs")}>
        {cardBacks.map((item, position) => (
          <button
            key={item.id}
            role="option"
            aria-selected={position === index}
            aria-label={msg(item.name)}
            className={`${position === index ? "on" : ""} ${isBackUnlocked(item, goals, bought) ? "" : "locked"}`}
            onClick={() => setIndex(position)}
          >
            <CardBackFace id={item.id} />
          </button>
        ))}
      </div>
    </div>
  );
}
