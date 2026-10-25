import { t as msg, useLanguage } from "@realms/ui/i18n";
import { ArrowRight, Check, Layers, Play, RefreshCw, Scroll, Swords } from "lucide-react";
import type { Collection } from "../../collection/lib/collection";
import {
  achievementText,
  closestAchievement,
  dailyDef,
  tierRewards,
  type Reward,
} from "../../goals/lib/goals";
import {
  claimAchievementTier,
  externalOf,
  rerollGoal,
  useGoals,
} from "../../goals/stores/goalsStore";
import { useQuestRun } from "../../quest/stores/questStore";
import { useDraftInProgress } from "../../draft/stores/draftStore";
import "../styles/start-hall.css";
import { cardArtUrl } from "../../../lib/cardArtUrl";

type Props = {
  inert: boolean;
  collection: Collection;
  canResume: boolean;
  resumeLabel: string;
  play: () => void;
  draft: () => void;
  resume: () => void;
  newQuest: () => void;
};

const art = (id: string) => ({ backgroundImage: `url(${cardArtUrl(id)})` });

/** A gilt medallion showing the reward; the arc around it fills as the goal progresses. */
function Medal({
  progress,
  goal,
  reward,
  onSwap,
}: {
  progress: number;
  goal: number;
  reward: Reward;
  onSwap?: () => void;
}) {
  const done = progress >= goal;
  const amount = reward.crowns ?? reward.boosters ?? 0;
  const unit = reward.crowns ? msg("crowns") : msg("booster");
  const medal = (
    <span
      className={`goal-medal ${done ? "done" : ""}`}
      style={{ "--p": Math.min(1, progress / goal) } as React.CSSProperties}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={progress}
    >
      {done ? (
        <Check size={26} />
      ) : (
        <>
          <b>{amount}</b>
          <small>{unit}</small>
        </>
      )}
      {reward.crowns && reward.boosters ? <i>+{reward.boosters}</i> : null}
      {onSwap && <RefreshCw className="medal-swap" size={20} strokeWidth={1.5} />}
    </span>
  );
  return onSwap ? (
    <button
      className="ring-button"
      aria-label={msg("Swap this goal")}
      title={msg("Swap this goal (once a day)")}
      onClick={onSwap}
    >
      {medal}
    </button>
  ) : (
    medal
  );
}

/** Home: three big art cards to start playing, with daily goals and quest progress along the bottom. */
export function StartPage({
  inert,
  collection,
  canResume,
  resumeLabel,
  play,
  draft,
  resume,
  newQuest,
}: Props) {
  useLanguage();
  const goals = useGoals();
  const run = useQuestRun();
  const drafting = useDraftInProgress();
  const closest = closestAchievement(goals, externalOf(collection));
  return (
    <main className="start-hall" inert={inert} aria-label={msg("Menu")}>
      <section className="home-stage">
        <div className="home-modes">
          <button
            className="home-mode"
            style={art("tower-of-the-first-morning")}
            aria-haspopup="dialog"
            onClick={play}
          >
            <Swords size={26} />
            <b>{msg("Play a match")}</b>
            <small>{msg("Against the computer, a friend or on one device")}</small>
            <ArrowRight className="go" size={22} />
          </button>
          <button
            className="home-mode"
            style={art("merchant-of-tris-vale")}
            aria-haspopup="dialog"
            onClick={draft}
          >
            <Layers size={26} />
            <b>{msg("Faction draft")}</b>
            <small>
              {drafting
                ? msg("A run is waiting for you")
                : msg("Draft a deck, play two bots, win packs")}
            </small>
            <ArrowRight className="go" size={22} />
          </button>
          <button
            className="home-mode quest"
            style={art("the-lonely-wanderer")}
            onClick={canResume ? resume : newQuest}
          >
            {canResume ? <Play size={26} /> : <Scroll size={26} />}
            <b>
              {canResume
                ? msg("Continue match")
                : run && run.stage !== "over"
                  ? msg("Continue expedition")
                  : msg("Quest")}
            </b>
            <small>
              {canResume
                ? msg(resumeLabel)
                : run && run.stage !== "over"
                  ? msg("{v0} life · {v1} silver", { v0: run.life, v1: run.silver })
                  : msg("Explore the map, fight and trade")}
            </small>
            <ArrowRight className="go" size={22} />
          </button>
        </div>
        <div className="home-progress">
          <section className="home-goals" aria-label={msg("Daily goals")}>
            <h2>{msg("Daily goals")}</h2>
            <ul>
              {goals.daily.map((slot, index) => {
                const def = dailyDef(slot.id)!,
                  complete = slot.progress >= def.goal;
                const swappable = !complete && !goals.rerolled;
                return (
                  <li key={`${slot.id}${index}`} className={complete ? "done" : ""}>
                    <Medal
                      progress={slot.progress}
                      goal={def.goal}
                      reward={def.reward}
                      onSwap={swappable ? () => rerollGoal(index) : undefined}
                    />
                    <span className="goal-text">
                      <b>{msg(def.title)}</b>
                      <small>
                        {slot.progress} / {def.goal}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="home-achievement" aria-label={msg("Closest achievement")}>
            <h2>{msg("Closest achievement")}</h2>
            {closest ? (
              <div>
                <Medal
                  progress={Math.min(closest.value, closest.threshold!)}
                  goal={closest.threshold!}
                  reward={tierRewards[closest.tier]}
                />
                <span className="goal-text">
                  <b>{msg(closest.def.title)}</b>
                  <small>{msg(...achievementText(closest.def, closest.threshold!))}</small>
                </span>
                {closest.claimable && (
                  <button
                    className="goal-claim"
                    onClick={() => claimAchievementTier(closest.def.id, collection)}
                  >
                    {msg("Claim")}
                  </button>
                )}
              </div>
            ) : (
              <p>{msg("Every achievement is done.")}</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
