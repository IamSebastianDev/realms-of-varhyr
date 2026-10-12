import { t as msg, useLanguage } from './i18n';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Download, Heart, Layers, Skull, Sparkles, Swords, Zap, Flame, Gift } from 'lucide-react';
import type { GameState, PlayerId, Registry } from '../../../packages/contracts/src';
import { other } from '../../../packages/core/src';
import { CrownAmount } from './Crowns';
import { PeekBackdrop } from './Peek';
import { matchStats, type SideStats } from './matchStats';

type Reward = { crowns: number; boosters: number; saved: boolean } | null;
type Props = {
  state: GameState; viewer: PlayerId; registry: Registry; reduced: boolean; symbol: string; reward: Reward;
  onMenu: () => void; onAgain?: () => void; onExport?: () => void; onReview?: () => void; reviewLabel?: string;
};

/** A number that climbs to its value, so a total reads as something that was earned. */
function Count({ to, delay = 0, reduced }: { to: number; delay?: number; reduced: boolean }) {
  useLanguage();
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced || to === 0) { setValue(to); return; }
    let frame = 0, start = 0;
    const timer = setTimeout(() => {
      const tick = (now: number) => {
        start ||= now;
        const t = Math.min(1, (now - start) / 750);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [to, delay, reduced]);
  return <>{value}</>;
}

type Row = { key: string; label: string; icon: ReactNode; pick: (s: SideStats) => number };
const rows: Row[] = [
  { key: 'damage', label: 'Damage dealt', icon: <Swords size={14}/>, pick: s => s.damageDealt },
  { key: 'kills', label: 'Creatures destroyed', icon: <Skull size={14}/>, pick: s => s.creaturesDestroyed },
  { key: 'played', label: 'Cards played', icon: <Layers size={14}/>, pick: s => s.cardsPlayed },
  { key: 'attacks', label: 'Attacks launched', icon: <Flame size={14}/>, pick: s => s.attacks },
  { key: 'energy', label: 'Energy channelled', icon: <Zap size={14}/>, pick: s => s.energy },
  { key: 'healed', label: 'Life restored', icon: <Heart size={14}/>, pick: s => s.healed },
];

export function MatchSummary({ state, viewer, registry, reduced, symbol, reward, onMenu, onAgain, onExport, onReview, reviewLabel = msg("Review this match") }: Props) {
  useLanguage();
  const stats = matchStats(state, registry), foe = other(viewer), outcome = state.outcome;
  const won = outcome === viewer, drew = outcome === 'draw', tone = drew ? 'draw' : won ? 'won' : 'lost';
  const winnerName = outcome && outcome !== 'draw' ? state.players[outcome].name : '';
  const verdict = drew ? msg("Draw") : won ? msg("Victory") : msg("Defeat");
  const sub = drew ? msg("Both sides fell in the same resolution.")
    : state.outcomeReason === 'empty-library' ? msg("{v0} exhausted their library. {v1} wins.", {v0: state.players[other(outcome as PlayerId)].name, v1: winnerName})
    : msg("{v0} claims the battlefield.", {v0: winnerName});
  const me = stats[viewer], them = stats[foe];
  const shown = rows.filter(row => row.pick(me) + row.pick(them) > 0);
  const step = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);
  const biggest = Math.max(me.biggestHit, them.biggestHit);
  const chips: { label: string; value: string; note?: string }[] = [
    { label: msg("Turns fought"), value: String(state.turn) },
    ...(biggest ? [{ label: msg("Biggest blow"), value: `−${biggest}`, note: me.biggestHit >= them.biggestHit ? state.players[viewer].name : state.players[foe].name }] : []),
    ...[me.topAttacker && { label: msg("Most aggressive"), value: me.topAttacker.name, note: msg("{v0} {v1}", {v0: me.topAttacker.attacks, v1: me.topAttacker.attacks === 1 ? 'attack' : 'attacks'}) }].filter(Boolean) as { label: string; value: string; note?: string }[],
  ];
  const Plate = ({ id, side }: { id: PlayerId; side: 'you' | 'foe' }) => <div className={`ms-plate ${side} ${outcome === id ? 'winner' : ''}`}>
    <span className="ms-plate-name">{id === viewer ? msg("You") : state.players[id].name}</span>
    <span className="ms-plate-life"><Heart size={14}/><b><Count to={Math.max(0, state.players[id].life)} delay={350} reduced={reduced}/></b><small>{msg("life left")}</small></span>
    {outcome === id && <span className="ms-plate-crown" aria-label={msg("Winner")}>♛</span>}
  </div>;
  const fallen = (s: SideStats) => s.fallen.length ? <p>{s.fallen.slice(0, 6).map(name=>msg(name)).join(' · ')}{s.fallen.length > 6 ? msg(" · +{v0} more", {v0: s.fallen.length - 6}) : ''}</p> : <p className="none">{msg("None fell")}</p>;
  return <PeekBackdrop className="ms-backdrop" back={msg("Back to the summary")}>
    <div className={`ms ${tone}`} role="dialog" aria-label={msg("Match summary")}>
      <div className="ms-embers" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${6 + (i % 5)}s`, '--l': `${-(i * 1.3)}s` } as CSSProperties}/>)}</div>
      <header className="ms-head">
        <span className="ms-mark">{drew ? '✦' : symbol}</span>
        <h2>{verdict}</h2>
        <p>{sub}</p>
      </header>
      <div className="ms-plates"><Plate id={viewer} side="you"/><span className="ms-vs">vs</span><Plate id={foe} side="foe"/></div>
      <div className="ms-tape">
        {shown.map((row, i) => {
          const a = row.pick(me), b = row.pick(them), top = Math.max(a, b, 1);
          return <div className={`ms-row ${a > b ? 'lead-you' : b > a ? 'lead-foe' : ''}`} style={step(i)} key={row.key}>
            <span className="ms-val you"><Count to={a} delay={250 + i * 90} reduced={reduced}/></span>
            <span className="ms-bar you"><i style={{ '--w': `${(a / top) * 100}%` } as CSSProperties}/></span>
            <span className="ms-label">{row.icon}{msg(row.label)}</span>
            <span className="ms-bar foe"><i style={{ '--w': `${(b / top) * 100}%` } as CSSProperties}/></span>
            <span className="ms-val foe"><Count to={b} delay={250 + i * 90} reduced={reduced}/></span>
          </div>;
        })}
      </div>
      <div className="ms-chips">{chips.map(chip => <div key={msg(chip.label)} className="ms-chip"><small>{msg(chip.label)}</small><b>{msg(chip.value)}</b>{chip.note && <em>{chip.note}</em>}</div>)}</div>
      <div className="ms-fallen">
        <div><small>{msg("Your fallen")}</small>{fallen(me)}</div>
        <div><small>{msg("Their fallen")}</small>{fallen(them)}</div>
      </div>
      {reward && <div className="ms-reward" role="status">
        <span className="ms-reward-title"><Sparkles size={13}/>{msg("Spoils of victory")}</span>
        <div><CrownAmount amount={reward.crowns}/><span className="ms-booster"><Gift size={17}/>+{reward.boosters} {msg("Realm’s Bounty booster")}</span></div>
        <small>{reward.saved ? msg("Added to your collection.") : msg("Available this session; browser storage could not save the reward.")}</small>
      </div>}
      <div className="ms-actions">
        <button className="outline-button" onClick={onMenu}>{msg("Main menu")}</button>
        {onAgain && <button className="gold-button" onClick={onAgain}>{msg("Play again")}<ArrowRight size={16}/></button>}
        {onExport && <button className="outline-button" onClick={onExport}>{msg("Save replay")}<Download size={15}/></button>}
        {onReview && <button className="text-button" onClick={onReview}>{reviewLabel}</button>}
      </div>
    </div>
  </PeekBackdrop>;
}
