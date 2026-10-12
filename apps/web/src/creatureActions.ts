import type { CommandEnvelope, GameState, PlayerId, PlayerView, Pool, Registry } from '../../../packages/contracts/src';
import { apply } from '../../../packages/core/src';

export type CreatureAction = { kind:'activate'; ability:number } | { kind:'channel'; option:number; output:Pool } | { kind:'undo-channel' } | { kind:'attack'; lane:number; current:boolean } | { kind:'withdraw' };

// Only the current uninterrupted channel sequence is reversible. A play, choice,
// phase change or another actor's action commits it, even if some energy remains.
export function undoableChannels(commands:CommandEnvelope[], actor:PlayerId):string[] {
  const ids:string[]=[];
  for(let i=commands.length-1;i>=0;i--) {
    const entry=commands[i];
    if(entry.actor!==actor||entry.command.type!=='energy')break;
    ids.push(entry.command.cardId);
  }
  return ids;
}

/** `lanes` holds the lane already chosen for each selected attacker; a lane can hold only one attacker. */
export function creatureActions(view:PlayerView, cardId:string, undoable:string[], attackers:string[], lanes:Record<string,number>={}):CreatureAction[] {
  const card=view.cards[cardId];
  if(!card||card.zone!=='board')return [];
  if(view.phase==='play'&&undoable.includes(cardId)&&card.exhausted)return [{kind:'undo-channel'}];
  const energy=view.legal.energy.find(a=>a.cardId===cardId);
  const playActions:CreatureAction[]=[
    ...(energy?.options.map((output,option)=>({kind:'channel' as const,option,output}))??[]),
    ...view.legal.activations.filter(a=>a.cardId===cardId).map(a=>({kind:'activate' as const,ability:a.ability})),
  ];
  if(playActions.length)return playActions;
  const reachable=view.legal.lanes[cardId];
  if(reachable){
    const claimed=new Set(attackers.filter(id=>id!==cardId).map(id=>lanes[id]));
    const selected=attackers.includes(cardId);
    return [
      ...reachable.filter(lane=>!claimed.has(lane)).map(lane=>({kind:'attack' as const,lane,current:selected&&lanes[cardId]===lane})),
      ...(selected?[{kind:'withdraw' as const}]:[]),
    ];
  }
  return [];
}

export function undoChannel(initial:GameState, commands:CommandEnvelope[], actor:PlayerId, cardId:string, registry:Registry):{state:GameState;commands:CommandEnvelope[]}|null {
  if(!undoableChannels(commands,actor).includes(cardId))return null;
  const index=commands.length-1-[...commands].reverse().findIndex(e=>e.actor===actor&&e.command.type==='energy'&&e.command.cardId===cardId);
  let state=initial;
  const rebuilt:CommandEnvelope[]=[];
  for(let i=0;i<commands.length;i++) {
    if(i===index)continue;
    const entry=commands[i];
    const envelope=i>index?{...entry,expectedRevision:state.revision,clientActionId:`replanned-${entry.clientActionId??i}-${state.revision}`}:entry;
    const result=apply(state,envelope,registry);
    if(result.error)return null;
    state=result.state;rebuilt.push(envelope);
  }
  // Replaying restores all effects of channeling, including trigger damage and
  // draws. Merely subtracting energy and readying a card would miss those effects.
  return {state,commands:rebuilt};
}
