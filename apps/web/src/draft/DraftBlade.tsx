import { ArrowRight } from "lucide-react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { draftPresets, factionsOf, playedOf, type DraftRun } from "@realms/draft";
import "../game-setup.css";
import "./draft.css";
import { useDraftRun } from "./draftStore";
import { factionName } from "./factionTools";

/** Where a saved run stands, in a line. */
export function runStatus(run: DraftRun, total: number): string {
  return run.stage === "draft"
    ? run.draft.awaiting
      ? msg("Choose your second faction")
      : msg("Drafting · pick {v0} of {v1}", { v0: run.draft.picks[0]!.length + 1, v1: total })
    : run.stage === "build"
      ? msg("Build your deck")
      : msg("Run in progress · {v0} of {v1} matches", {
          v0: playedOf(run),
          v1: run.matches.length,
        });
}

/** The Faction draft blade: choose the faction you start with, then go on to the overview. A run in progress is continued instead. */
export function DraftBlade({ open }: { open: (preset: string) => void }) {
  useLanguage();
  const preset = draftPresets[0]!,
    run = useDraftRun(preset.id);
  const resuming = !!run && run.stage !== "finished";
  const total = preset.rounds * preset.packSize;
  return (
    <div className="draft-blade">
      <h3 className="setup-label">{msg(preset.name)}</h3>
      <p className="quest-goal">
        {msg(
          "Draft a faction with two others, then choose a second one. Build a deck from your 48 picks and play each of them twice. Your wins decide the payout, and you keep every card.",
        )}
      </p>
      {resuming && (
        <p className="draft-run-line">
          <b>
            {factionsOf(run!.draft)
              .map((faction) => msg(factionName(faction)))
              .join(" · ")}
          </b>{" "}
          <span className="draft-stripe-status">{runStatus(run!, total)}</span>
        </p>
      )}
      <button className="gold-button start-play setup-start" onClick={() => open(preset.id)}>
        <span>{resuming ? msg("Continue run") : msg("View draft")}</span>
        <ArrowRight size={22} />
      </button>
    </div>
  );
}
