import { t as msg, useLanguage } from "@realms/ui/i18n";
import { Check, Lock } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { CardBackFace, unlockText } from "../../card-backs/components/CardBackFace";
import { cardBacks, isBackUnlocked } from "../../card-backs/lib/cardBacks";
import { buyCardBack, useBoughtBacks } from "../../card-backs/stores/cardBackStore";
import { useGoals } from "../../goals/stores/goalsStore";
import { CrownAmount } from "../../../components/Crowns";
import { ShelfFrame } from "./ShelfFrame";

/** The Store's card back shelf: a row of sleeves that slides to the one in focus, with the same Buy button as the boosters. Backs are picked per deck in the deck builder. */
export function CardBacksShop({ crowns }: { crowns: number }) {
  useLanguage();
  const goals = useGoals(),
    bought = useBoughtBacks(),
    [index, setIndex] = useState(0);
  const back = cardBacks[index],
    have = isBackUnlocked(back, goals, bought);
  const canBuy = back.source === "shop" && !have && crowns >= back.price!;
  return (
    <>
      <ShelfFrame
        label={msg("Card backs")}
        count={cardBacks.length}
        index={index}
        setIndex={setIndex}
        onActivate={() => {
          if (canBuy) buyCardBack(back.id);
        }}
      >
        <div className="backs-row" aria-hidden="true">
          {cardBacks.map((item, position) => {
            const rel = position - index;
            return (
              <button
                key={item.id}
                tabIndex={-1}
                className={`backs-item ${rel === 0 ? "focus" : ""} ${isBackUnlocked(item, goals, bought) ? "" : "locked"}`}
                style={{ "--rel": rel } as CSSProperties}
                onClick={() => setIndex(position)}
              >
                <CardBackFace id={item.id} />
              </button>
            );
          })}
        </div>
      </ShelfFrame>
      <div className="store-bay-info" aria-live="polite">
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
        <div className="store-owned" aria-hidden="true" />
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
    </>
  );
}
