import type { GameState, Registry } from '../../../packages/contracts/src';
import { apply, decisionPlayer, other } from '../../../packages/core/src';
export type AttackDraft = { attackers: string[]; lanes: Record<string, number> };
// Run the actual resolution on a disposable state. Expose only public combat
// consequences, never drawn card identities or future private choices. While
// attackers are still being chosen, `draft` is declared on the copy first.
export function combatForecast(state:GameState, draft:AttackDraft|null, registry:Registry) {
  if(!state.combat || !['declare','review'].includes(state.combat.stage) || state.pending || state.outcome)return null;
  let next=state;
  if(state.combat.stage==='declare'){
    if(!draft?.attackers.length)return null;
    const declared=apply(next,{actor:decisionPlayer(next),expectedRevision:next.revision,command:{type:'attack',attackers:draft.attackers,lanes:draft.lanes}},registry);
    if(declared.error)return null;next=declared.state;
  }
  const result=apply(next,{actor:decisionPlayer(next),expectedRevision:next.revision,command:{type:'confirm-combat'}},registry);
  if(result.error)return null;
  const defender=other(state.active);
  return {defender,blocked:new Set(next.combat!.blocks.map(b=>b.attacker)).size,lifeDamage:state.players[defender].life-result.state.players[defender].life,
    attackersFallen:state.players[state.active].board.filter((id):id is string=>!!id&&result.state.cards[id].zone!=='board').length,
    fallen:state.players[defender].board.filter((id):id is string=>!!id&&result.state.cards[id].zone!=='board').length};
}
