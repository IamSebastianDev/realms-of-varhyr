import { factionInfo } from "@realms/content";
import { startRun, text, type AdventureDef } from "@realms/adventure";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { rarest } from "../../decks/components/DeckShelf";
import { randomSeed } from "../../match/lib/session";
import "../../lobby/styles/game-setup.css";
import { cardArtUrl } from "../../../lib/cardArtUrl";
import {
  adventureContent,
  adventures,
  adventureOf,
  runIsCurrent,
  saveRun,
  useAdventureRun,
} from "../stores/adventureStore";

/** Boosters the scenes of an adventure can pay in one run, as the selection screen advertises them. */
export function advertisedBoosters(def: AdventureDef): number {
  const counts = new Map<string, number>();
  for (const event of def.events)
    for (const effect of [
      ...(event.effects ?? []),
      ...(event.choices ?? []).flatMap((c) => c.effects),
    ])
      if (effect.type === "booster")
        counts.set(effect.id, Math.max(counts.get(effect.id) ?? 0, effect.count));
  return [...counts.values()].reduce((sum, count) => sum + count, 0);
}

/** Choose an adventure and set out. Entry is free, a run can be left and continued, and a finished or lost one can be started again. */
export function AdventurePicker({ onStarted }: { onStarted: () => void }) {
  const language = useLanguage();
  const run = useAdventureRun();
  const waiting = run && run.stage !== "over" && runIsCurrent(run) ? run : null;
  if (waiting) {
    const def = adventureOf(waiting.adventure);
    return (
      <div className="adv-picker">
        <p className="adv-goal">{msg("Your adventure is saved.")}</p>
        {def && <p className="adv-sub">{text(def.name, language)}</p>}
        <button className="gold-button" onClick={onStarted}>
          {msg("Continue your adventure")}
        </button>
      </div>
    );
  }
  if (!adventures.length)
    return <p className="adv-notice">{msg("No adventures have been published yet.")}</p>;
  function start(def: AdventureDef) {
    saveRun(startRun({ def, content: adventureContent, seed: randomSeed(), now: Date.now() }));
    onStarted();
  }
  return (
    <div className="adv-picker">
      <p className="adv-goal">
        {msg("Choose a route, make your choices and reach the final battle. Nothing to pay.")}
      </p>
      <div className="adv-stripes" role="group" aria-label={msg("Choose an adventure")}>
        {adventures.map((def) => {
          const art = rarest(
            Object.values(adventureContent.cards)
              .filter((card) => card.factions?.includes(def.faction))
              .map((card) => card.id),
          )[0];
          const boosters = advertisedBoosters(def);
          return (
            <button
              key={def.id}
              className="setup-deck adv-stripe"
              style={{ ["--tint" as string]: factionInfo[def.faction]?.color }}
              onClick={() => start(def)}
            >
              <span
                className="setup-deck-art"
                style={
                  def.art
                    ? { backgroundImage: `url(/adventures/${def.id}/${def.art}.webp)` }
                    : art
                      ? { backgroundImage: `url(${cardArtUrl(art.id)})` }
                      : undefined
                }
              />
              <span className="setup-deck-text">
                <b>{text(def.name, language)}</b>
                <small>{text(def.premise, language)}</small>
                <small>
                  {msg(factionInfo[def.faction]?.name ?? def.faction)}
                  {boosters > 0 && ` · ${msg("Up to {v0} boosters", { v0: boosters })}`}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
