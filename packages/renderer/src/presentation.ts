import { useEffect,useRef,useState } from 'react';
import type { GameEvent } from '../../contracts/src';
export type VisualEffect = { seq:number; cardId?:string; target?:string; kind:'play'|'damage'|'energy'|'attack'|'spell' };
const mapping: Record<string,VisualEffect['kind']> = {'card.played':'play','damage.dealt':'damage','energy.generated':'energy','creature.attacked':'attack','spell.cast':'spell'};
// This cancellable queue only decorates committed projections. Commands never wait for it.
export function usePresentation(events:GameEvent[],reduced:boolean) {
  const sequence=useRef(events.at(-1)?.seq??0),[queue,setQueue]=useState<VisualEffect[]>([]);
  useEffect(()=>{
    const latest=events.at(-1)?.seq??0;
    if(latest<sequence.current){sequence.current=latest;setQueue([]);return;}
    const effects=events.filter(e=>e.seq>sequence.current&&mapping[e.type]).map(e=>({seq:e.seq,cardId:e.cardId,target:e.target,kind:mapping[e.type]}));
    sequence.current=events.at(-1)?.seq??0;
    if(reduced){setQueue([]);return;}
    if(effects.length)setQueue(q=>[...q,...effects].slice(-12));
  },[events,reduced]);
  useEffect(()=>{if(!queue.length)return;const timer=setTimeout(()=>setQueue(q=>q.slice(1)),220);return()=>clearTimeout(timer);},[queue]);
  return reduced?undefined:queue[0];
}
