import type { CSSProperties } from 'react';
import type { CardDefinition } from '../../../packages/contracts/src';
import { ArtCard } from './CardPresentation';

export type SpellTone = 'damage' | 'heal' | 'arcane';
export type SpellFx = {
  id: string;
  card: CardDefinition;
  caster: 'mine' | 'theirs';
  tone: SpellTone;
  from: { x: number; y: number };
  to: { x: number; y: number } | null;
};

const toneColor: Record<SpellTone, string> = { damage: '#ff9a6b', heal: '#9fe0a0', arcane: '#7fd0dc' };
export const spellTone = (card: CardDefinition): SpellTone =>
  card.cast?.some(a => a.id === 'damage') ? 'damage' : card.cast?.some(a => a.id === 'heal') ? 'heal' : 'arcane';

/** Screen-space presentation only: the engine has already resolved the spell, which would otherwise vanish into the discard pile. */
export function SpellCast({ casts }: { casts: SpellFx[] }) {
  return <div className="spell-casts" aria-hidden="true">{casts.map(fx => {
    const color = toneColor[fx.tone], { from, to } = fx;
    const path = to ? `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2 + (to.x >= from.x ? 40 : -40)} ${Math.min(from.y, to.y) - 70} ${to.x} ${to.y}` : '';
    return <div key={fx.id} className={`spell-cast ${fx.caster}`} style={{ '--spell-color': color } as CSSProperties}>
      <div className="spell-reveal" style={{ left: from.x, top: from.y }}>
        <ArtCard detail={false} card={fx.card} reduced/>
        <span className="spell-caption">{fx.caster === 'mine' ? 'You cast' : 'Opponent casts'}<b>{fx.card.name}</b></span>
      </div>
      {to && <>
        <svg><path d={path} pathLength={1} className="spell-bolt"/></svg>
        <b className="spell-orb" style={{ offsetPath: `path("${path}")` } as CSSProperties}/>
        <i className="spell-impact" style={{ left: to.x, top: to.y }}/>
      </>}
    </div>;
  })}</div>;
}
