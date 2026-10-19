import { useLayoutEffect, useRef } from 'react';
import { BookOpen, Hand } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import type { CardDefinition } from '../../../../packages/contracts/src';
import { CardBackFace } from '../CardBackFace';

/** Small presentational pieces of the match screen: player names, pile counters and the deck icon. */
/** A player name that always stays on one line: the type shrinks until it fits its box. */
export function FitName({name}:{name:string}) {
  const ref=useRef<HTMLHeadingElement>(null);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const fit=()=>{el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&size>13){size-=1;el.style.fontSize=`${size}px`;}};
    fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();
  },[name]);
  return <h2 ref={ref}>{name}</h2>;
}
export function LibraryCount({count,back}:{count:number;back?:string}) {
  useLanguage();
  return <div className={`library-count ${count<=6?'library-low':''} ${back?'has-back':''}`} title={msg("{v0} cards in library. Drawing the last card loses the game.", {v0: count})} aria-label={msg("{v0} cards in library", {v0: count})}>{back?<CardBackFace id={back}/>:<BookOpen size={15}/>}<strong>{count}</strong><small>{msg("LIBRARY")}</small></div>;
}
export function HandCount({count}:{count:number}) {
  useLanguage();
  return <div className="library-count hand-count" title={msg("{v0} {v1} in hand", {v0: count, v1: count===1?'card':'cards'})} aria-label={msg("{v0} {v1} in hand", {v0: count, v1: count===1?'card':'cards'})}><Hand size={15}/><strong>{count}</strong><small>{msg("HAND")}</small></div>;
}
export function DiscardCount({count,top,onOpen}:{count:number;top?:CardDefinition;onOpen:()=>void}) {
  useLanguage();
  return <button className="discard-count" onClick={onOpen} title={msg("{v0} {v1} in the discard pile. Click to view.", {v0: count, v1: count===1?'card':'cards'})} aria-label={msg("Open discard pile, {v0} cards", {v0: count})}>
    <span className={`discard-top ${top?'':'empty'}`}>{top&&<img src={top.art} alt="" draggable={false}/>}</span><strong>{count}</strong><small>{msg("DISCARD")}</small>
  </button>;
}
export function LayersIcon(){
  useLanguage();return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 5l6-3 6 3-6 3Zm0 3l6 3 6-3M2 11l6 3 6-3"/></svg>;}
