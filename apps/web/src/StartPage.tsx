import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { ArrowRight, Check, Layers, Play, RefreshCw, Scroll, Swords } from 'lucide-react';
import type { Collection } from './collection';
import { achievementText, closestAchievement, dailyDef, type Reward } from './goals';
import { claimAchievementTier, externalOf, rerollGoal, useGoals } from './goalsStore';
import { useQuestRun } from './quest/questStore';
import { useDraftInProgress } from './draft/draftStore';
import './start-hall.css';

type Props = {
  inert: boolean; collection: Collection;
  canResume: boolean; resumeLabel: string; play: () => void; draft: () => void; resume: () => void; newQuest: () => void;
};

const rewardText = (reward: Reward) => [reward.crowns ? msg('{v0} crowns', { v0: reward.crowns }) : '', reward.boosters ? msg('{v0} booster', { v0: reward.boosters }) : ''].filter(Boolean).join(' + ');

const art = (id: string) => ({ backgroundImage: `url(/cards/${id}/data.png)` });

/** A small progress ring: the number inside is how far along the goal is. */
function Ring({ progress, goal, onSwap }: { progress: number; goal: number; onSwap?: () => void }) {
  const r = 17, c = 2 * Math.PI * r, done = progress >= goal;
  const ring = <span className={`goal-ring ${done ? 'done' : ''} ${onSwap ? 'swappable' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={progress}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r={r}/><circle className="fill" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, progress / goal))}/></svg>
    {done ? <Check size={15}/> : <b>{progress}</b>}
    {onSwap && <RefreshCw className="ring-swap" size={16}/>}
  </span>;
  return onSwap ? <button className="ring-button" aria-label={msg("Swap this goal")} title={msg("Swap this goal (once a day)")} onClick={onSwap}>{ring}</button> : ring;
}

/** Home: three big art cards to start playing, with daily goals and quest progress along the bottom. */
export function StartPage({ inert, collection, canResume, resumeLabel, play, draft, resume, newQuest }: Props) {
  useLanguage();
  const goals = useGoals();
  const run = useQuestRun();
  const drafting = useDraftInProgress();
  const closest = closestAchievement(goals, externalOf(collection));
  return <main className="start-hall" inert={inert} aria-label={msg("Menu")}>
    <section className="home-stage">
      <div className="home-modes">
        <button className="home-mode" style={art('tower-of-the-first-morning')} aria-haspopup="dialog" onClick={play}>
          <Swords size={26}/><b>{msg("Play a match")}</b><small>{msg("Against the computer, a friend or on one device")}</small><ArrowRight className="go" size={22}/>
        </button>
        <button className="home-mode" style={art('merchant-of-tris-vale')} aria-haspopup="dialog" onClick={draft}>
          <Layers size={26}/><b>{msg("Faction draft")}</b><small>{drafting ? msg("A run is waiting for you") : msg("Draft a deck, play two bots, win packs")}</small><ArrowRight className="go" size={22}/>
        </button>
        <button className="home-mode quest" style={art('the-lonely-wanderer')} onClick={canResume ? resume : newQuest}>
          {canResume ? <Play size={26}/> : <Scroll size={26}/>}<b>{canResume ? msg("Continue match") : run && run.stage !== 'over' ? msg("Continue expedition") : msg("Quest")}</b>
          <small>{canResume ? msg(resumeLabel) : run && run.stage !== 'over' ? msg("{v0} life · {v1} silver", { v0: run.life, v1: run.silver }) : msg("Explore the map, fight and trade")}</small>
          <ArrowRight className="go" size={22}/>
        </button>
      </div>
      <div className="home-progress">
        <section className="home-goals" aria-label={msg("Daily goals")}>
          <h2>{msg("Daily goals")}</h2>
          <ul>{goals.daily.map((slot, index) => {
            const def = dailyDef(slot.id)!, complete = slot.progress >= def.goal;
            const swappable = !complete && !goals.rerolled;
            return <li key={`${slot.id}${index}`} className={complete ? 'done' : ''}>
              <Ring progress={slot.progress} goal={def.goal} onSwap={swappable ? () => rerollGoal(index) : undefined}/>
              <span className="goal-text"><b>{msg(def.title)}</b><small>{slot.progress} / {def.goal} · {rewardText(def.reward)}</small></span>
            </li>;
          })}</ul>
        </section>
        <section className="home-achievement" aria-label={msg("Closest achievement")}>
          <h2>{msg("Closest achievement")}</h2>
          {closest ? <div><Ring progress={Math.min(closest.value, closest.threshold!)} goal={closest.threshold!}/>
            <span className="goal-text"><b>{msg(closest.def.title)}</b><small>{msg(...achievementText(closest.def, closest.threshold!))}</small></span>
            {closest.claimable && <button className="goal-claim" onClick={() => claimAchievementTier(closest.def.id, collection)}>{msg("Claim")}</button>}
          </div> : <p>{msg("Every achievement is done.")}</p>}
        </section>
      </div>
    </section>
  </main>;
}
