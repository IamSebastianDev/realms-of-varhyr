import type { PlayerView } from '../../../packages/contracts/src';
import type { SlotLayout } from '../../../packages/renderer/src/Board';

/** One arrow per attacker, drawn to the lane it targets; blocked lanes are cyan, open lanes are gold. */
export function CombatArrows({ view, slots, lanes, blocks }: {
  view: PlayerView;
  slots: SlotLayout[];
  lanes: Record<string, number>;
  blocks: { attacker: string; blocker: string }[];
}) {
  return <svg className="combat-arrows" aria-hidden="true">
    <defs>
      <marker id="combat-arrowhead" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 11 6 L 1 11 L 4 6 Z" fill="#a6f8ff"/></marker>
      <marker id="combat-arrowhead-open" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 11 6 L 1 11 L 4 6 Z" fill="#ffd98a"/></marker>
    </defs>
    {Object.entries(lanes).map(([attackerId, lane]) => {
      const attacker = view.cards[attackerId];
      if (attacker?.zone !== 'board') return null;
      const defender = attacker.controller === 'p1' ? 'p2' : 'p1';
      const from = slots.find(s => s.player === attacker.controller && s.slot === attacker.slot);
      // A Guard may step in from a neighbouring lane; the arrow then ends on the card that actually blocks.
      const blockerSlot = view.cards[blocks.find(b => b.attacker === attackerId)?.blocker ?? '']?.slot ?? lane;
      const to = slots.find(s => s.player === defender && s.slot === blockerSlot);
      if (!from || !to) return null;
      const blocked = blocks.some(b => b.attacker === attackerId);
      const upward = from.y > to.y;
      const x1 = from.x + from.width / 2, x2 = to.x + to.width / 2;
      const y1 = upward ? from.y - 3 : from.y + from.height + 3;
      const y2 = upward ? to.y + to.height + 3 : to.y - 3;
      const bend = Math.min(60, from.width * .65) * Math.sign(x2 - x1 || 1);
      const path = `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2} ${y2 + (upward ? 24 : -24)} ${x2} ${y2}`;
      return <g key={attackerId} data-combat-arrow={`${attackerId}:${lane}`} data-blocked={blocked}>
        <path d={path} className="combat-arrow-shadow"/>
        <path d={path} className={`combat-arrow ${blocked ? '' : 'open-lane'}`} markerEnd={`url(#combat-arrowhead${blocked ? '' : '-open'})`}/>
        <circle cx={x1} cy={y1} r="3" fill="#ffe0a0"/>
      </g>;
    })}
  </svg>;
}
