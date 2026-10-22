import { useEffect, useState } from "react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { factionInfo } from "@realms/content";
import { isPlayable, pickStart, startRun } from "@realms/quest";
import { randomSeed } from "../session";
import { rarest } from "../DeckShelf";
import "../game-setup.css";
import { loadMap, questContent, saveRun, useQuestRun, type LoadedMap } from "./questStore";
import { cardArtUrl } from "../cardArtUrl";

/** The three quest alignments are the three booster packs, in this order. */
const alignments = [
  { pack: "hearth-and-crown", label: "Good" },
  { pack: "wanderers-road", label: "Neutral" },
  { pack: "gathering-dark", label: "Evil" },
] as const;

/** Choose an alignment with the tabs, then set out as one of its factions. An expedition is free and has no deadline. */
export function QuestPicker({ onStarted }: { onStarted: () => void }) {
  useLanguage();
  const run = useQuestRun();
  const [map, setMap] = useState<LoadedMap | null | undefined>(undefined);
  useEffect(() => {
    void loadMap().then(setMap);
  }, []);
  const [tab, setTab] = useState<string>(alignments[0].pack);
  if (run)
    return (
      <div className="quest-picker">
        <p className="quest-goal">
          {run.stage === "over"
            ? msg("Choose cards to keep from your last expedition before setting out again.")
            : msg("Your expedition is saved.")}
        </p>
        <button className="gold-button" onClick={onStarted}>
          {run.stage === "over" ? msg("Choose cards to keep") : msg("Continue your expedition")}
        </button>
      </div>
    );
  if (map === undefined) return <p className="quest-sub">{msg("Loading the map…")}</p>;
  if (!map)
    return (
      <p className="quest-notice">
        {msg(
          "The quest map has not been made yet. Place the nodes in the card studio's Map tab, save, and restart the dev server.",
        )}
      </p>
    );
  const pack = questContent.packs.find((entry) => entry.id === tab);
  function start(faction: string) {
    saveRun(
      startRun({
        map: map!,
        content: questContent,
        pack: tab,
        faction,
        now: Date.now(),
        seed: randomSeed(),
      }),
    );
    onStarted();
  }
  return (
    <div className="quest-picker">
      <div className="quest-tabs" role="tablist" aria-label={msg("Alignment")}>
        {alignments.map((entry) => (
          <button
            key={entry.pack}
            role="tab"
            aria-selected={tab === entry.pack}
            onClick={() => setTab(entry.pack)}
          >
            <b>{msg(questContent.packs.find((item) => item.id === entry.pack)?.name ?? "")}</b>
          </button>
        ))}
      </div>
      <p className="quest-goal">
        {msg("Walk the map, fight, trade and take on bosses. Nothing to pay, no time limit.")}
      </p>
      <div className="quest-stripes" role="group" aria-label={msg("Choose your faction")}>
        {(pack?.factions ?? []).map((faction) => {
          const ready = isPlayable(questContent, faction) && !!pickStart(map, faction, 0);
          const art = rarest(
            Object.values(questContent.cards)
              .filter((card) => card.factions?.includes(faction))
              .map((card) => card.id),
          )[0];
          return (
            <button
              key={faction}
              className="setup-deck quest-stripe"
              disabled={!ready}
              style={{ ["--tint" as string]: factionInfo[faction]?.color }}
              onClick={() => start(faction)}
            >
              <span
                className="setup-deck-art"
                style={art ? { backgroundImage: `url(${cardArtUrl(art.id)})` } : undefined}
              />
              <span className="setup-deck-text">
                <b>{msg(factionInfo[faction]?.name ?? faction)}</b>
                <small>{ready ? msg("Set out") : msg("Not playable yet")}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
