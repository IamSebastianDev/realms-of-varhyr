import { useState } from "react";
import { Check } from "lucide-react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import type { CardDefinition } from "@realms/contracts";
import { isHybrid, type DraftPreset, type DraftRun } from "@realms/draft";
import { cardArtUrl } from "../../../lib/cardArtUrl";
import { Rail, Workshop } from "../../../components/Workshop";
import { DraftBackdrop } from "./DraftHubArt";
import { DraftPane } from "./DraftPane";
import {
  factionArt,
  factionColor,
  factionName,
  hybridPartners,
  startingFactions,
} from "../lib/factionTools";
import type { TableStatus } from "./DraftPicker";

/**
 * Between the halves: choose the faction of your next four boosters. Everybody chooses at the same time and the choices are
 * revealed together, so nobody can react to anybody. Your own picks sit in the pane, hybrids included.
 */
export function FactionChoice({
  run,
  preset,
  choose,
  back,
  inspect,
  status,
}: {
  run: DraftRun;
  preset: DraftPreset;
  choose: (faction: string) => void;
  back: () => void;
  inspect: (card: CardDefinition) => void;
  status?: TableStatus;
}) {
  useLanguage();
  const [picked, setPicked] = useState<string | null>(null);
  const mine = run.draft.picks[0]!,
    factions = startingFactions();
  const chosenAlready = !!status && !status.mine;
  const hybridsWith = (faction: string) =>
    mine.filter((id) => {
      const card = registry.cards[id]!;
      return isHybrid(card) && card.factions.includes(faction);
    }).length;
  const total = preset.rounds * preset.packSize;
  return (
    <Workshop
      label={msg("Choose your second faction")}
      className="draft-workshop"
      style={{ ["--pack-color" as string]: factionColor(run.draft.pod) }}
      backdrop={<DraftBackdrop faction={run.draft.pod} />}
      panelLabel={msg("Factions")}
      back={{ label: msg("Back to the draft overview"), onClick: back }}
      title={msg("Choose your second faction")}
      subtitle={msg("You opened {v0} boosters of {v1}.", {
        v0: 4,
        v1: msg(factionName(run.draft.pod)),
      })}
      rail={
        <Rail className="draft-rail">
          <span>
            {msg(
              "Everybody chooses at the same time. The choices are revealed together, and you open four boosters of yours.",
            )}
          </span>
          {status && (
            <span className="draft-table-status" role="status">
              {!status.connected
                ? msg("Reconnecting to the table…")
                : chosenAlready
                  ? msg("Waiting for {v0}…", { v0: status.waiting.join(", ") || "…" })
                  : ""}
            </span>
          )}
          <button
            className="gold-button builder-save"
            disabled={picked === null || chosenAlready}
            onClick={() => picked && choose(picked)}
          >
            {chosenAlready
              ? msg("Faction chosen")
              : picked === null
                ? msg("Choose a faction")
                : msg("Take {v0}", { v0: msg(factionName(picked)) })}
            <Check size={14} />
          </button>
        </Rail>
      }
      pane={
        <DraftPane
          cards={mine}
          target={total}
          unit={msg("picked")}
          inspect={inspect}
          footer={msg("Hybrids in your picks need their other faction.")}
        />
      }
    >
      <div className="faction-choice" role="radiogroup" aria-label={msg("Factions")}>
        {factions.map((faction) => {
          const art = factionArt(faction),
            partners = hybridPartners(faction),
            owned = hybridsWith(faction);
          return (
            <button
              key={faction}
              role="radio"
              aria-checked={picked === faction}
              disabled={chosenAlready}
              className="setup-deck draft-stripe"
              style={{ ["--tint" as string]: factionColor(faction) }}
              onClick={() => setPicked(faction)}
            >
              <span
                className="setup-deck-art"
                style={art ? { backgroundImage: `url(${cardArtUrl(art.id)})` } : undefined}
              />
              <span className="setup-deck-text">
                <b>{msg(factionName(faction))}</b>
                <small>
                  {partners.length
                    ? msg("Hybrids with {v0}", {
                        v0: partners.map((entry) => msg(factionName(entry.faction))).join(" · "),
                      })
                    : msg("No hybrids yet")}
                </small>
                {owned > 0 && (
                  <small className="draft-stripe-status">
                    {owned === 1
                      ? msg("1 of your picks is a hybrid with it")
                      : msg("{v0} of your picks are hybrids with it", { v0: owned })}
                  </small>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Workshop>
  );
}
