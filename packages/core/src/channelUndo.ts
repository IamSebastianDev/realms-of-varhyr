import type { CommandEnvelope, GameState, PlayerId, Registry } from '../../contracts/src';
import { apply } from './index';

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
