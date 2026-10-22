import { t as msg, useLanguage } from "@realms/ui/i18n";
import { Check } from "lucide-react";
import {
  achievements,
  achievementStatus,
  achievementText,
  tierNames,
  tierRewards,
  type Reward,
} from "./goals";
import { claimAchievementTier, externalOf, useGoals } from "./goalsStore";
import { useCollection } from "./collectionStore";

const rewardText = (reward: Reward) =>
  [
    reward.crowns ? msg("{v0} crowns", { v0: reward.crowns }) : "",
    reward.boosters ? msg("{v0} booster", { v0: reward.boosters }) : "",
  ]
    .filter(Boolean)
    .join(" + ");

/** Every achievement with its three tiers: what is done, what is next, and what can be collected now. */
export function AchievementsPanel() {
  useLanguage();
  const goals = useGoals(),
    { collection } = useCollection(),
    external = externalOf(collection);
  const list = achievements.map((def) => achievementStatus(goals, def, external));
  const finished = list.reduce((sum, status) => sum + status.tier, 0),
    total = achievements.length * 3;
  return (
    <section className="profile-achievements" aria-label={msg("Achievements")}>
      <h2>
        {msg("Achievements")}
        <span>
          {finished} / {total}
        </span>
      </h2>
      <ul>
        {list.map((status) => (
          <li
            key={status.def.id}
            className={status.done ? "done" : status.claimable ? "ready" : ""}
          >
            <div className="ach-head">
              <b>{msg(status.def.title)}</b>
              <span className="ach-tiers" aria-label={msg("{v0} of 3 tiers", { v0: status.tier })}>
                {tierNames.map((name, index) => (
                  <i
                    key={name}
                    className={`t${index} ${index < status.tier ? "on" : ""}`}
                    title={msg(name)}
                  >
                    {index < status.tier && <Check size={9} />}
                  </i>
                ))}
              </span>
            </div>
            <small>
              {msg(
                ...achievementText(
                  status.def,
                  status.done ? status.def.tiers[2] : status.threshold!,
                ),
              )}
            </small>
            {status.done ? (
              <p className="ach-note">{msg("Completed")}</p>
            ) : (
              <>
                <div
                  className="ach-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={status.threshold!}
                  aria-valuenow={Math.min(status.value, status.threshold!)}
                >
                  <i style={{ width: `${status.fraction * 100}%` }} />
                </div>
                <div className="ach-foot">
                  <span>
                    {Math.min(status.value, status.threshold!)} / {status.threshold} ·{" "}
                    {rewardText(tierRewards[status.tier])}
                  </span>
                  {status.claimable && (
                    <button
                      className="goal-claim"
                      onClick={() => claimAchievementTier(status.def.id, collection)}
                    >
                      {msg("Claim")}
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
