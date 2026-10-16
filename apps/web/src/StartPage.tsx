import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { ArrowRight, Check, Play, Scroll, Swords, Users } from 'lucide-react';
import { registry } from '../../../packages/content/src';
import { validateDeck } from '../../../packages/core/src';
import { missingDeckCopies, type Collection } from './collection';
import './start-hall.css';

type Option = { id: string; name: string; cards: string[] };
type Props = {
  inert: boolean; options: Option[]; selected: string; collection: Collection;
  canResume: boolean; resumeLabel: string; play: (ready: boolean) => void; friend: () => void; resume: () => void; newQuest: () => void;
};

/** Placeholder progress until goals and quests are tracked: shown so the layout can be judged. */
const dailyGoals = [
  { title: 'Win a match', progress: 0, goal: 1, reward: '25 crowns' },
  { title: 'Play 3 matches', progress: 1, goal: 3, reward: '1 booster' },
  { title: 'Cast 5 spells', progress: 2, goal: 5, reward: '15 crowns' },
];
const questSteps = { title: 'The Road to Tris Vale', done: 2, total: 7 };
const achievement = { title: 'Veteran of the Marches', detail: 'Win 10 matches', progress: 7, goal: 10 };

const art = (id: string) => ({ backgroundImage: `url(/cards/${id}/data.png)` });

/** A small progress ring: the number inside is how far along the goal is. */
function Ring({ progress, goal }: { progress: number; goal: number }) {
  const r = 17, c = 2 * Math.PI * r, done = progress >= goal;
  return <span className={`goal-ring ${done ? 'done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={progress}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r={r}/><circle className="fill" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, progress / goal))}/></svg>
    {done ? <Check size={15}/> : <b>{progress}</b>}
  </span>;
}

/** Home: three big art cards to start playing, with daily goals and quest progress along the bottom. */
export function StartPage({ inert, options, selected, collection, canResume, resumeLabel, play, friend, resume, newQuest }: Props) {
  useLanguage();
  const deck = options.find(option => option.id === selected);
  const missing = deck ? missingDeckCopies(deck.cards, collection.counts).length : 0;
  const ready = !!deck && !validateDeck(deck.cards, registry).length && !missing;
  return <main className="start-hall" inert={inert} aria-label={msg("Menu")}>
    <section className="home-stage">
      <div className="home-modes">
        <button className="home-mode" style={art('tower-of-the-first-morning')} aria-haspopup={ready ? undefined : 'dialog'} onClick={() => play(ready)}>
          <Swords size={26}/><b>{msg("Quick match")}</b><small>{msg("Jump into a game against the computer")}</small><ArrowRight className="go" size={22}/>
        </button>
        <button className="home-mode" style={art('merchant-of-tris-vale')} aria-haspopup="dialog" onClick={friend}>
          <Users size={26}/><b>{msg("Play a friend")}</b><small>{msg("Online or on one device")}</small><ArrowRight className="go" size={22}/>
        </button>
        <button className="home-mode quest" style={art('the-lonely-wanderer')} onClick={canResume ? resume : newQuest}>
          {canResume ? <Play size={26}/> : <Scroll size={26}/>}<b>{canResume ? msg("Continue match") : msg("Continue quest")}</b>
          <small>{canResume ? msg(resumeLabel) : msg(questSteps.title)}</small>
          <span className="quest-track" role="progressbar" aria-label={msg("Quest progress")} aria-valuemin={0} aria-valuemax={questSteps.total} aria-valuenow={questSteps.done}>{Array.from({ length: questSteps.total }, (_, index) => <i key={index} className={index < questSteps.done ? 'on' : ''}/>)}</span>
          <ArrowRight className="go" size={22}/>
        </button>
      </div>
      <div className="home-progress">
        <section className="home-goals" aria-label={msg("Daily goals")}>
          <h2>{msg("Daily goals")}<em>{msg("Preview")}</em></h2>
          <ul>{dailyGoals.map(goal => <li key={goal.title} className={goal.progress >= goal.goal ? 'done' : ''}>
            <Ring progress={goal.progress} goal={goal.goal}/>
            <span><b>{msg(goal.title)}</b><small>{goal.progress} / {goal.goal} · {msg(goal.reward)}</small></span>
          </li>)}</ul>
        </section>
        <section className="home-achievement" aria-label={msg("Closest achievement")}>
          <h2>{msg("Closest achievement")}<em>{msg("Preview")}</em></h2>
          <div><Ring progress={achievement.progress} goal={achievement.goal}/><span><b>{msg(achievement.title)}</b><small>{achievement.progress} / {achievement.goal} · {msg(achievement.detail)}</small></span></div>
        </section>
      </div>
    </section>
  </main>;
}
