import { soundOrder, spellEffect } from '../audio/catalog';
import { factionBursts, type FactionEffect } from '../factionEffects';
import { useAudio } from '../AudioExperience';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { EnergyType, GameEvent, GameState, PlayerId } from '../../../../packages/contracts/src';
import { factionInfo, registry } from '../../../../packages/content/src';
import type { SlotLayout } from '../../../../packages/renderer/src/Board';
import type { EnergyFlight } from '../EnergyFlow';
import { spellTone, type SpellFx } from '../SpellCast';
import type { FxBatch } from '../ClashLayer';
import { buildAftermath, buildArrival, buildCharge, buildClash, type ClashStep } from '../combatReplay';
import { useCardMotion, type Poses } from '../cardMotion';

type Options = {
  sound: boolean; reduced: boolean; covered: boolean; slotLayout: SlotLayout[]; viewer: PlayerId; hotseat: boolean;
  initial: GameState; screen: string; historyIndex: number | null;
  boardRef: RefObject<HTMLDivElement | null>; poolRef: RefObject<HTMLDivElement | null>; enemyPoolRef: RefObject<HTMLDivElement | null>;
};
/** Presentation follows accepted transitions. It never applies commands or changes a session's state. */
export function useMatchPresentation({sound,reduced,covered,slotLayout,viewer,hotseat,initial,screen,historyIndex,boardRef,poolRef,enemyPoolRef}: Options) {
  const {playEffect}=useAudio(),spellStep=useRef(false);
  const [energyFlights,setEnergyFlights]=useState<EnergyFlight[]>([]),[spellCasts,setSpellCasts]=useState<SpellFx[]>([]);
  const [factionEffects,setFactionEffects]=useState<FactionEffect[]>([]);
  const [clash,setClash]=useState<{steps:ClashStep[];i:number}|null>(null),posesRef=useRef<Poses>({}),stepping=useRef(false);
  const clashBatches=useMemo<FxBatch[]>(()=>clash?clash.steps.slice(0,clash.i+1).map((step,j)=>({key:`s${j}`,poses:j===clash.i?step.poses:[],pops:step.pops,ms:step.ms,caption:j===clash.i?step.caption:undefined})):[],[clash]);
  useCardMotion(clash?clash.steps[clash.i]:null,slotLayout,viewer,posesRef);
  /** Everything that plays when the game moves on, for a local move or an opponent's: sound, energy and spell flights, and the fight replay. */
  const present=useCallback((before:GameState,after:GameState,events:GameEvent[],key:string)=>{
    if(sound){const tone=soundOrder.find(type=>events.some(e=>e.type===type));if(tone==='spell.cast'){const cast=events.find(e=>e.type==='spell.cast'),card=cast?.cardId?after.cards[cast.cardId]??before.cards[cast.cardId]:undefined;playEffect(card?spellEffect(registry.cards[card.definitionId]):'spell.cast');}else if(tone)playEffect(tone);}
    spellStep.current=events.some(e=>e.type==='spell.cast');
    if(reduced||covered)return;
    const bursts=factionBursts(before,after,events,registry,key);
    if(bursts.length)setFactionEffects(list=>[...list,...bursts].slice(-20));
    const board=boardRef.current?.getBoundingClientRect(),at=(slot:SlotLayout)=>board&&({x:board.left+slot.x+slot.width/2,y:board.top+slot.y+slot.height/2});
    if(board){
      for(const e of events.filter(e=>e.type==='energy.generated'&&e.cardId)){
        const card=before.cards[e.cardId!]??after.cards[e.cardId!];if(!card)continue;
        const slot=slotLayout.find(s=>s.player===card.controller&&s.slot===card.slot),pool=(card.controller===viewer?poolRef:enemyPoolRef).current?.getBoundingClientRect();
        const colors=Object.entries(after.players[card.controller].energy).flatMap(([color,amount])=>Array.from({length:Math.min(4,Math.max(0,amount!-(before.players[card.controller].energy[color as EnergyType]??0)))},()=>factionInfo[color as EnergyType].color));
        const from=slot&&at(slot);
        if(from&&pool&&colors.length)setEnergyFlights(f=>[...f.slice(-3),{id:`${key}-${e.seq}`,player:card.controller,from,to:{x:pool.left+pool.width/2,y:pool.top+pool.height/2},colors}]);
      }
      // Spells leave the board at once, so reveal each one and trace it to its target.
      const casts=events.filter(e=>e.type==='spell.cast'&&e.cardId&&after.cards[e.cardId]).map((e):SpellFx=>{
        const instance=after.cards[e.cardId!],card=registry.cards[instance.definitionId];let to:SpellFx['to']=null;
        if(e.target==='p1'||e.target==='p2'){const pool=(e.target===viewer?poolRef:enemyPoolRef).current?.getBoundingClientRect();if(pool)to={x:pool.left+pool.width/2,y:pool.top+pool.height/2};}
        else if(e.target){const target=before.cards[e.target],slot=slotLayout.find(l=>l.player===target?.controller&&l.slot===target?.slot);if(slot)to=at(slot)??null;}
        return {id:`${key}-${e.seq}`,card,caster:instance.owner===viewer?'mine':'theirs',tone:spellTone(card),from:{x:board.left+board.width/2,y:board.top+board.height/2},to};
      });
      if(casts.length)setSpellCasts(list=>[...list.slice(-1),...casts]);
    }
    // A fight is replayed one exchange at a time; anything else gets numbers over what was hurt and a dissolve for the fallen.
    if(hotseat)return;
    const played=events.find(e=>e.type==='card.played'&&e.cardId),playedDef=played?registry.cards[after.cards[played.cardId!]?.definitionId??'']:undefined;
    let steps:ClashStep[]=[];
    if(before.combat?.stage==='review'&&events.some(e=>e.type==='damage.dealt'))steps=buildClash(before,events,registry);
    else if(played&&playedDef?.type==='creature'&&playedDef.abilities.some(a=>a.id==='charge'))steps=buildCharge(after,events,registry,played.cardId!);
    if(!steps.length)steps=buildAftermath(after,events,registry,events.some(e=>e.type==='spell.cast')?950:0);
    if(!steps.length&&played&&playedDef?.type==='creature')steps=buildArrival(after,played.cardId!);
    setClash(steps.length?{steps,i:0}:null);
  },[playEffect,sound,reduced,covered,slotLayout,viewer,hotseat,boardRef,poolRef,enemyPoolRef]);
  // Each exchange of a fight is heard as it is shown: the lunge, the blow and the fall. A spell's own damage already has its sound.
  useEffect(()=>{
    const step=clash?.steps[clash.i];if(!step||!sound)return;
    if(step.poses.some(p=>p.mode==='lunge'))playEffect('combat.attack');
    if(!spellStep.current&&step.pops.some(p=>p.tone==='damage'||p.tone==='lethal'))playEffect('combat.hit');
    if(step.poses.some(p=>p.mode==='die'))playEffect('creature.die');
  },[clash,sound,playEffect]);
  useEffect(()=>{if(!clash)return;const timer=setTimeout(()=>setClash(c=>c&&(c.i+1<c.steps.length?{...c,i:c.i+1}:null)),clash.steps[clash.i].ms);return()=>clearTimeout(timer);},[clash]);
  useEffect(()=>{setClash(null);},[viewer,initial,reduced,covered,screen]);
  // Stepping through a replay plays each step's fight; jumping around clears whatever was playing.
  useEffect(()=>{if(stepping.current){stepping.current=false;return;}setClash(null);setSpellCasts([]);setEnergyFlights([]);setFactionEffects([]);},[historyIndex]);
  useEffect(()=>{if(!clash)return;const skip=(event:KeyboardEvent)=>{if(event.key===' '||event.key==='Enter'||event.key==='Escape'){event.preventDefault();setClash(null);}};window.addEventListener('keydown',skip);return()=>window.removeEventListener('keydown',skip);},[clash]);
  useEffect(()=>{if(!spellCasts.length)return;const timer=setTimeout(()=>setSpellCasts([]),2100);return()=>clearTimeout(timer);},[spellCasts]);
  useEffect(()=>{setSpellCasts([]);},[viewer,initial,reduced,covered]);
  useEffect(()=>{if(!energyFlights.length)return;const timer=setTimeout(()=>setEnergyFlights([]),1600);return()=>clearTimeout(timer);},[energyFlights]);
  useEffect(()=>{setEnergyFlights([]);},[viewer,initial,reduced,covered]);
  useEffect(()=>{if(!factionEffects.length)return;const timer=setTimeout(()=>setFactionEffects([]),2300);return()=>clearTimeout(timer);},[factionEffects]);
  useEffect(()=>{setFactionEffects([]);},[viewer,initial,reduced,covered,screen]);
  return {factionEffects,setFactionEffects,clash,setClash,posesRef,energyFlights,setEnergyFlights,spellCasts,setSpellCasts,clashBatches,present,stepping};
}
