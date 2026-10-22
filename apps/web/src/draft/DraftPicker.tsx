import { heldDrag, holdDrag, releaseDrag } from "./dragPayload";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAudio } from "../AudioExperience";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import type { CardDefinition } from "@realms/contracts";
import { ArtCard } from "@realms/ui/CardPresentation";
import {
  botNamesFor,
  draftRules,
  isFreeProducer,
  type DraftPreset,
  type DraftRun,
} from "@realms/draft";
import { DraftBackdrop } from "./DraftHubArt";
import { DraftPane } from "./DraftPane";
import { Rail, Workshop } from "../layout/Workshop";
import { factionColor, factionName } from "./factionTools";

/** The pick screen: the pack in front of you in an inset panel, your picks in the deckbuilder's pane. Choose a card, or drag it over. */
/** At a table with other people: who is still choosing, and when time runs out. */
export type TableStatus = {
  waiting: string[];
  mine: boolean;
  deadline: number | null;
  connected: boolean;
};
const useSecondsLeft = (deadline: number | null) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
};

export function DraftPicker({
  run,
  preset,
  reduced,
  pick,
  back,
  inspect,
  status,
}: {
  run: DraftRun;
  preset: DraftPreset;
  reduced: boolean;
  pick: (cardId: string) => void;
  back: () => void;
  inspect: (card: CardDefinition) => void;
  status?: TableStatus;
}) {
  useLanguage();
  const [chosen, setChosen] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const state = run.draft,
    pack = state.held[0]!,
    mine = state.picks[0]!;
  const [next, previous] = run.table
    ? [run.table.names[1], run.table.names[2]]
    : botNamesFor(run.seed);
  const seconds = useSecondsLeft(status?.deadline ?? null),
    chosenAlready = !!status && !status.mine;
  useEffect(() => {
    setChosen(null);
  }, [state.round, state.step]);
  const total = preset.rounds * preset.packSize;
  /** The first half is everybody's shared faction; in the second you opened boosters of the one you chose. */
  const second = state.round >= draftRules.phaseRounds,
    faction = second ? (state.factions[0] ?? state.pod) : state.pod;
  const { playEffect } = useAudio();
  const take = (index: number) => {
    if (chosenAlready || (!status?.connected && status)) return;
    setChosen(null);
    playEffect("draft.pick");
    pick(pack[index]!);
  };
  return (
    <Workshop
      label={msg("Draft picks")}
      className="draft-workshop"
      style={{ ["--pack-color" as string]: factionColor(faction) }}
      backdrop={<DraftBackdrop faction={faction} />}
      panelLabel={msg("Cards in your pack")}
      back={{ label: msg("Back to the draft overview"), onClick: back }}
      title={msg("Pick a card")}
      subtitle={msg("Round {v0} of {v1} · {v2} cards in this pack", {
        v0: state.round + 1,
        v1: preset.rounds,
        v2: pack.length,
      })}
      rail={
        <Rail className="draft-rail">
          <span>
            {second
              ? msg("Second half: you opened {v0} boosters.", { v0: msg(factionName(faction)) })
              : msg("First half: every booster is {v0}.", { v0: msg(factionName(faction)) })}{" "}
            {msg("You pass what is left to {v0} and receive a pack from {v1}.", {
              v0: next,
              v1: previous,
            })}
          </span>
          {status && (
            <span className="draft-table-status" role="status">
              {!status.connected
                ? msg("Reconnecting to the table…")
                : chosenAlready
                  ? msg("Waiting for {v0}…", { v0: status.waiting.join(", ") || "…" })
                  : seconds !== null
                    ? msg("{v0} s to choose. A bot picks for you after that.", { v0: seconds })
                    : ""}
            </span>
          )}
          <button
            className="gold-button builder-save"
            disabled={chosen === null || chosenAlready}
            onClick={() => chosen !== null && take(chosen)}
          >
            {chosenAlready
              ? msg("Card chosen")
              : chosen === null
                ? msg("Choose a card")
                : msg("Take card")}
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
              const raw = heldDrag("pick") ?? event.dataTransfer.getData("text/plain"),
                index = Number(raw);
              releaseDrag();
              if (raw !== "" && Number.isInteger(index) && pack[index]) take(index);
            },
          }}
        />
      }
    >
      <div className="draft-gallery">
        <div className="draft-gallery-grid">
          {pack.map((id, index) => {
            const card = registry.cards[id]!;
            return (
              <article
                key={`${id}-${index}`}
                className={`builder-card-tile ${chosen === index ? "has-copies" : ""} ${isFreeProducer(card, registry) ? "is-producer" : ""}`}
                draggable
                onDragStart={(event) => {
                  setChosen(index);
                  holdDrag(event, "pick", String(index));
                }}
                onDragEnd={() => {
                  releaseDrag();
                  setOver(false);
                }}
                onDoubleClick={() => take(index)}
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
                      inspect(card);
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
