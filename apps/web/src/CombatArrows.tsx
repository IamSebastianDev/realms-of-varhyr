import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import type { CSSProperties } from 'react';
import type { PlayerView, Registry } from '../../../packages/contracts/src';
import { effectiveStats } from '../../../packages/core/src';
import type { SlotLayout } from '../../../packages/renderer/src/Board';

type Tone = 'blocked' | 'open';
const tones: Record<Tone, { line: string; glow: string }> = {
  blocked: { line: '#8fefff', glow: '#4bd9ec' },
  open: { line: '#ffd98a', glow: '#e9b04f' },
};

/** A readout laid over a card: the damage it is about to take. A skull means it will not survive. */
function Pill({ x, y, text, kind, lethal, delay }: { x: number; y: number; text: string; kind: 'foe' | 'self' | 'face'; lethal?: boolean; delay: number }) {
  useLanguage();
  const width = 18 + text.length * 8.6 + (lethal ? 18 : 0);
  return <g className={`arrow-pill ${kind} ${lethal ? 'lethal' : ''}`} transform={`translate(${x} ${y})`}>
    <g className="arrow-pill-pop" style={{ animationDelay: `${delay}ms` }}>
      <rect x={-width / 2} y={-12} width={width} height={24} rx={12}/>
      <text textAnchor="middle" dominantBaseline="central" y={.5}>{text}{lethal ? ' ☠' : ''}</text>
    </g>
  </g>;
}

/** One arrow per attacker, drawn to the lane it targets. Cyan arrows meet a blocker; gold ones reach an open lane and the player behind it. */
export function CombatArrows({ view, slots, lanes, blocks, registry }: {
  view: PlayerView;
  slots: SlotLayout[];
  lanes: Record<string, number>;
  blocks: { attacker: string; blocker: string }[];
  registry: Registry;
}) {
  useLanguage();
  return <svg className="combat-arrows" aria-hidden="true">
    {Object.entries(lanes).map(([attackerId, lane], index) => {
      const attacker = view.cards[attackerId];
      if (attacker?.zone !== 'board') return null;
      const defender = attacker.controller === 'p1' ? 'p2' : 'p1';
      const from = slots.find(s => s.player === attacker.controller && s.slot === attacker.slot);
      // A Guard may step in from a neighbouring lane; the arrow then ends on the card that actually blocks.
      const blockerId = blocks.find(b => b.attacker === attackerId)?.blocker;
      const blockerSlot = view.cards[blockerId ?? '']?.slot ?? lane;
      const to = slots.find(s => s.player === defender && s.slot === blockerSlot);
      if (!from || !to) return null;
      const blocked = !!blockerId, tone: Tone = blocked ? 'blocked' : 'open', color = tones[tone];
      const upward = from.y > to.y, dir = upward ? -1 : 1;
      const x1 = from.x + from.width / 2, x2 = to.x + to.width / 2;
      const y1 = upward ? from.y - 3 : from.y + from.height + 3;
      const y2 = upward ? to.y + to.height + 4 : to.y - 4;
      const bend = Math.min(60, from.width * .65) * Math.sign(x2 - x1 || 1);
      const path = `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2} ${y2 - dir * 28} ${x2} ${y2 - dir * 13}`;
      const head = `M ${x2 - 10} ${y2 - dir * 16} L ${x2} ${y2} L ${x2 + 10} ${y2 - dir * 16} L ${x2} ${y2 - dir * 11} Z`;
      // What the clash will cost each side, read from the same stats the cards show.
      const hit = effectiveStats(view, attackerId, registry).attack;
      const target = blockerId ? view.cards[blockerId] : null, targetStats = blockerId ? effectiveStats(view, blockerId, registry) : null;
      const back = targetStats?.attack ?? 0;
      const attackerLeft = effectiveStats(view, attackerId, registry).defense - attacker.damage;
      const delay = index * 90;
      const style = { '--arrow-line': color.line, '--arrow-glow': color.glow } as CSSProperties;
      return <g key={attackerId} className={`combat-arrow-group ${tone}`} data-combat-arrow={`${attackerId}:${lane}`} data-blocked={blocked} style={style}>
        <path d={path} className="combat-arrow-shadow"/>
        <path d={path} className="combat-arrow" pathLength={1} style={{ animationDelay: `${delay}ms` }}/>
        <path d={path} className="combat-arrow-flow" style={{ animationDelay: `${delay + 300}ms` }}/>
        <path d={head} className="combat-arrowhead" style={{ animationDelay: `${delay + 260}ms` }}/>
        <circle cx={x1} cy={y1} r="4.5" className="combat-arrow-origin"/>
        <circle cx={x2} cy={y2} r="9" className="combat-arrow-ring" style={{ animationDelay: `${delay + 300}ms` }}/>
        {hit > 0 && <Pill x={x2} y={to.y + to.height * .46} text={blocked ? `−${hit}` : msg("−{v0} ♥", {v0: hit})} kind={blocked ? 'foe' : 'face'} lethal={!!target && !!targetStats && hit >= targetStats.defense - target.damage} delay={delay + 320}/>}
        {blocked && back > 0 && <Pill x={x1} y={from.y + from.height * .46} text={`−${back}`} kind="self" lethal={back >= attackerLeft} delay={delay + 320}/>}
      </g>;
    })}
  </svg>;
}
