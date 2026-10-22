import { t as msg, useLanguage } from "@realms/ui/i18n";
import { Check, Lock, Star } from "lucide-react";
import { useState } from "react";
import { CardBackFace, unlockText } from "./CardBackFace";
import { cardBacks, isBackUnlocked } from "../lib/cardBacks";
import { setFavoriteBack, useBoughtBacks, useStandardBack } from "../stores/cardBackStore";
import { useGoals } from "../../goals/stores/goalsStore";

/** The profile's sleeve collection: every sleeve, the locked ones too, and one marked as the standard for decks without a sleeve of their own. */
export function SleeveBrowser() {
  useLanguage();
  const goals = useGoals(),
    bought = useBoughtBacks(),
    standard = useStandardBack(),
    [picked, setPicked] = useState(standard);
  const back = cardBacks.find((item) => item.id === picked) ?? cardBacks[0],
    have = isBackUnlocked(back, goals, bought),
    isStandard = back.id === standard;
  const owned = cardBacks.filter((item) => isBackUnlocked(item, goals, bought)).length;
  return (
    <section className="profile-sleeves" aria-label={msg("Sleeves")}>
      <h2>
        {msg("Your sleeves")}
        <small>
          {owned} / {cardBacks.length}
        </small>
      </h2>
      <div className="sleeve-layout">
        <div className="sleeve-grid" role="listbox" aria-label={msg("Sleeves")}>
          {cardBacks.map((item) => {
            const unlocked = isBackUnlocked(item, goals, bought);
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={item.id === back.id}
                aria-label={msg(item.name)}
                title={msg(item.name)}
                className={`${item.id === back.id ? "on" : ""} ${unlocked ? "" : "locked"}`}
                onClick={() => setPicked(item.id)}
              >
                <CardBackFace id={item.id} />
                {item.id === standard ? (
                  <i title={msg("Standard sleeve")}>
                    <Star size={12} fill="currentColor" />
                  </i>
                ) : (
                  !unlocked && (
                    <i className="lock">
                      <Lock size={11} />
                    </i>
                  )
                )}
              </button>
            );
          })}
        </div>
        <article className="sleeve-detail">
          <CardBackFace id={back.id} className={have ? "" : "dim"} />
          <div>
            <h3>{msg(back.name)}</h3>
            <p className="sleeve-status">
              {have
                ? isStandard
                  ? msg("Your standard sleeve")
                  : msg("Unlocked")
                : unlockText(back)}
            </p>
            {have ? (
              <button
                className="outline-button"
                aria-pressed={isStandard}
                disabled={isStandard}
                onClick={() => setFavoriteBack(back.id)}
              >
                {isStandard ? (
                  <>
                    <Check size={15} />
                    {msg("Standard")}
                  </>
                ) : (
                  <>
                    <Star size={15} />
                    {msg("Make standard")}
                  </>
                )}
              </button>
            ) : (
              <span className="backs-state off">
                <Lock size={15} />
                {msg("Locked")}
              </span>
            )}
            <small>{msg("Decks without a sleeve of their own use your standard sleeve.")}</small>
          </div>
        </article>
      </div>
    </section>
  );
}
