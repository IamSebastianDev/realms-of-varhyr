import { ArrowLeft, ArrowRight, BookOpen, Check, Gift, Layers, Minus, Plus, Search, Swords, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { factionInfo, registry } from '../../../packages/content/src';
import { drawBooster } from '../../../packages/content/src/boosters';
import type { CardDefinition } from '../../../packages/contracts/src';
import { deckRules } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { BoosterOpening, type OpenBooster } from './BoosterOpening';
import { emptyRewards, grantBooster, parseRewards, rewardsKey } from './boosterRewards';
import { ArtCard, cardAbilityDescriptions, CardListName, CardLore, Cost, EnergyOutput, LegendaryMark } from './CardPresentation';
import { CardDetail } from './CardDetail';
import { addDeckCard, copyCount, draftKey, parseDeck, removeDeckCard, starterOptions, type CustomDeck } from './decks';
import { opponentDeck } from './session';

export type Screen='menu'|'cards'|'builder'|'match';
type Mode='practice'|'hotseat';
type Props={
  reduced:boolean; screen:Exclude<Screen,'match'>; navigate:(screen:Screen)=>void; canResume:boolean; resumeLabel:string;
  decks:CustomDeck[]; options:{id:string;name:string;cards:string[]}[]; saveDeck:(deck:CustomDeck)=>string|null;
  mode:Mode; setMode:(mode:Mode)=>void; selected:string; setSelected:(id:string)=>void;
  seed:string; setSeed:(seed:string)=>void; start:(skirmish:boolean)=>void;
};
function emptyDeck():CustomDeck{return {id:`custom-${crypto.randomUUID()}`,name:'New deck',cards:[]};}
function readDraft():CustomDeck {
  try{return parseDeck(JSON.parse(localStorage.getItem(draftKey)??'null'),true)??emptyDeck();}catch{return emptyDeck();}
}
export function Lobby(props:Props){
  const {screen,navigate,canResume}=props;
  const [query,setQuery]=useState(''),[faction,setFaction]=useState('all'),[kind,setKind]=useState('all');
  const [draft,setDraft]=useState<CustomDeck>(readDraft),[message,setMessage]=useState('');
  const [inspected,setInspected]=useState<CardDefinition|null>(null);
  const [rewards,setRewards]=useState(()=>{try{return parseRewards(localStorage.getItem(rewardsKey));}catch{return emptyRewards();}});
  const [rewardsSaved,setRewardsSaved]=useState(true);
  const [booster,setBooster]=useState<OpenBooster|null>(null);
  const boosterOrigin=useRef<HTMLElement|null>(null);
  const rewardTotal=Object.values(rewards.counts).reduce((sum,count)=>sum+count,0);
  useEffect(()=>{
    const refresh=(event:StorageEvent)=>{if(event.key===rewardsKey||event.key===null)setRewards(parseRewards(event.newValue));};
    window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);
  },[]);
  useEffect(()=>{if(!booster)return;const origin=boosterOrigin.current;return()=>origin?.focus();},[!!booster]);
  function openBooster(){
    if(!booster)boosterOrigin.current=document.activeElement as HTMLElement;
    let previous=rewards;
    if(rewardsSaved)try{previous=parseRewards(localStorage.getItem(rewardsKey));}catch{/* Retain this session's collection if storage is unavailable. */}
    const reward=grantBooster(previous,drawBooster(Object.values(registry.cards)));
    let saved=true;
    try{localStorage.setItem(rewardsKey,JSON.stringify(reward.collection));}catch{saved=false;}
    setRewards(reward.collection);
    setRewardsSaved(saved);
    setBooster({id:crypto.randomUUID(),cards:reward.cards,saved});
  }
  const detailRef=useRef<HTMLElement>(null),focusOrigin=useRef<HTMLElement|null>(null);
  function inspect(card:CardDefinition){focusOrigin.current=document.activeElement as HTMLElement;setInspected(card);}
  useEffect(()=>{if(!inspected)return;const origin=focusOrigin.current;return()=>origin?.focus();},[inspected]);
  function trapDetailFocus(event:React.KeyboardEvent){if(event.key!=='Tab')return;const buttons=Array.from(detailRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')??[]);const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{/* Explicit saves report storage failures. */}},[draft]);
  useEffect(()=>{setInspected(null);setQuery('');setFaction('all');setKind('all');},[screen]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(inspected)setInspected(null);else if(booster)setBooster(null);else if(screen!=='menu')navigate('menu');}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[inspected,booster,screen,navigate]);
  const cards=useMemo(()=>Object.values(registry.cards).filter(card=>{
    const text=`${card.name} ${card.lore ?? ''} ${cardAbilityDescriptions(card).map(ability=>`${ability.name} ${ability.description}`).join(' ')} ${card.subtypes.join(' ')} ${card.legendary?'legendary':''}`.toLowerCase();
    return text.includes(query.toLowerCase().trim())&&(kind==='all'||card.type===kind)&&(faction==='all'||faction==='neutral'&&!card.factions.length||card.factions.includes(faction as never));
  }).sort((a,b)=>a.name.localeCompare(b.name)),[query,kind,faction]);
  const counts=new Map<string,number>();for(const id of draft.cards)counts.set(id,(counts.get(id)??0)+1);
  const deckCards=[...counts.keys()].map(id=>registry.cards[id]).sort((a,b)=>a.name.localeCompare(b.name));
  const errors=validateDeck(draft.cards,registry),chosen=props.options.find(d=>d.id===props.selected);
  const playable=!!chosen&&!validateDeck(chosen.cards,registry).length;
  const opponent=opponentDeck(props.selected,props.decks.find(deck=>deck.id===props.selected));
  const change=(next:CustomDeck)=>{setDraft(next);setMessage('');};
  const add=(id:string)=>change({...draft,cards:addDeckCard(draft.cards,id)});
  const remove=(id:string)=>change({...draft,cards:removeDeckCard(draft.cards,id)});
  function load(id:string){
    const saved=props.decks.find(d=>d.id===id),starter=starterOptions.find(d=>d.id===id);
    if(saved)change({...saved,cards:[...saved.cards]});
    else if(starter)change({...emptyDeck(),name:`${starter.name} (copy)`,cards:[...starter.cards]});
  }
  function save(){const next={...draft,name:draft.name.trim()};const error=props.saveDeck(next);setMessage(error??'Saved locally. Your deck is available in Play.');if(!error)setDraft(next);return !error;}
  return <div className={`lobby ${screen==='menu'?'menu-screen':''}`}>
    <div className="world-bg"/><div className="world-vignette"/>
    <header className="lobby-header">
      <button className="brand" onClick={()=>navigate('menu')} aria-label="Main menu"><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button>
      <nav aria-label="Main navigation">
        <button className={screen==='menu'?'active':''} onClick={()=>navigate('menu')}>Menu</button>
        <button className={screen==='cards'?'active':''} onClick={()=>navigate('cards')}><BookOpen size={15}/>Cards</button>
        <button className={screen==='builder'?'active':''} onClick={()=>navigate('builder')}><Layers size={15}/>Deck builder</button>
      </nav>
      {canResume&&<button className="lobby-resume" onClick={()=>navigate('match')}><ArrowLeft size={15}/>Return to match</button>}
    </header>
    {screen==='menu'?<main className="main-menu">
      <div className="menu-intro"><span className="eyebrow">TEN LIFE · FIVE SLOTS · YOUR NEXT MOVE</span><h1>The realm awaits.</h1><p>Your army powers your spells.<br/>Your fallen defenders power your comeback.</p></div>
      <div className="menu-layout">
        <section className="menu-play"><div className="menu-section-heading"><Swords size={20}/><h2>Play</h2></div>
          {canResume&&<button className="continue-match" onClick={()=>navigate('match')}><span><b>Continue match</b><small>{props.resumeLabel}</small></span><ArrowRight size={19}/></button>}
          <div className="menu-fields"><label>Your deck<select value={props.selected} onChange={e=>props.setSelected(e.target.value)}>{props.options.map(d=><option key={d.id} value={d.id}>{d.name}{validateDeck(d.cards,registry).length?' · unfinished':''}</option>)}</select></label>
          <label>Play mode<select value={props.mode} onChange={e=>props.setMode(e.target.value as Mode)}><option value="practice">Practice against the court</option><option value="hotseat">Two players · one device</option></select></label></div>
          <div className="play-deck-note"><span>{chosen?.cards.length??0} cards</span>{opponent&&<span>{opponent.name} opponent</span>}</div>
          {!playable&&<p className="deck-warning">This deck needs at least {deckRules.minimumCards} cards before you can play.</p>}
          <button className="gold-button menu-start" disabled={!playable} onClick={()=>props.start(false)}>Start game<ArrowRight size={17}/></button>
          <div className="menu-small-actions"><button disabled={!playable} onClick={()=>props.start(true)}>Jump into a skirmish</button><details><summary>Match seed</summary><label>Seed<input type="number" value={props.seed} onChange={e=>props.setSeed(e.target.value)}/></label></details></div>
        </section>
        <div className="menu-links">
          <button className="menu-destination" onClick={()=>navigate('cards')}><BookOpen size={24}/><div><h2>Cards</h2><p>Explore every creature, spell and bastion.</p><span>{Object.keys(registry.cards).length} cards to discover</span></div><ArrowRight size={19}/></button>
          <button className="menu-destination" onClick={()=>navigate('builder')}><Layers size={24}/><div><h2>Deck builder</h2><p>Start with an empty deck or make a starter your own.</p><span>{props.decks.length?`${props.decks.length} saved ${props.decks.length===1?'deck':'decks'}`:'All cards. Your deck. Nothing extra.'}</span></div><ArrowRight size={19}/></button>
        </div>
      </div><div className="booster-toolbar"><button className="gold-button" onClick={openBooster}><Gift size={17}/>Open booster</button><p>Five random cards · free to test<small>{rewards.boostersOpened} opened · {rewardTotal} cards earned</small></p></div><p className="menu-footnote">Your match, decks and booster rewards stay saved on this device.</p>
    </main>:<main className={`collection-page ${screen==='builder'?'builder-page':''}`}>
      <div className="collection-heading"><div><span className="eyebrow">{screen==='builder'?'MAKE IT YOUR OWN':'THE CARD COLLECTION'}</span><h1>{screen==='builder'?'Deck builder':'Cards'}</h1></div><p>{screen==='builder'?`${deckRules.minimumCards} cards minimum · ${deckRules.copiesPerCard} copies per card · ${deckRules.copiesPerLegendary} per legendary`:'Read the cards. Learn the energy. Find your next play.'}</p></div>
      {screen==='cards'&&<div className="booster-toolbar collection-booster-toolbar"><button className="outline-button" onClick={openBooster}><Gift size={17}/>Open booster</button><p>{rewardTotal} cards earned from {rewards.boostersOpened} boosters<small>Free to test · five cards per pack</small></p></div>}
      {screen==='builder'&&<div className="builder-toolbar"><label>Load deck<select aria-label="Load deck" value={props.decks.some(d=>d.id===draft.id)?draft.id:'draft'} onChange={e=>load(e.target.value)}><option value="draft">Current draft</option><optgroup label="Starter decks">{starterOptions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>{props.decks.length>0&&<optgroup label="Your decks">{props.decks.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}</select></label><button className="outline-button" onClick={()=>change(emptyDeck())}><Plus size={15}/>New deck</button></div>}
      <div className="collection-columns">
        <section className="all-cards-panel" aria-label="All cards"><div className="collection-panel-heading"><h2>All cards</h2><span>{cards.length} / {Object.keys(registry.cards).length}</span></div>
          <div className="collection-filters"><label className="collection-search"><Search size={16}/><input aria-label="Search cards" placeholder="Search cards or abilities…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <select aria-label="Filter by faction" value={faction} onChange={e=>setFaction(e.target.value)}><option value="all">All factions</option>{Object.entries(factionInfo).map(([id,f])=><option key={id} value={id}>{f.symbol} {f.name}</option>)}</select>
          <select aria-label="Filter by card type" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All types</option><option value="creature">Creatures</option><option value="spell">Spells</option><option value="bastion">Bastions</option></select></div>
          {!cards.length&&<p className="collection-empty">No cards match. Try another search or faction.</p>}
          {screen==='cards'?<div className="collection-card-grid">{cards.map(card=><article key={card.id}><ArtCard card={card} reduced={props.reduced} onClick={()=>inspect(card)}/><div className="collection-card-meta"><span className={`collection-rarity rarity-${card.rarity}`}>{card.rarity}</span>{rewards.counts[card.id]>0&&<span className="collection-reward-count">{rewards.counts[card.id]} earned</span>}</div></article>)}</div>:<div className="builder-card-list">{cards.map(card=>{
            const n=copyCount(draft.cards,card.id),limit=card.legendary?deckRules.copiesPerLegendary:deckRules.copiesPerCard;
            return <article key={card.id} className={`builder-card-row ${card.legendary?'legendary-row':''}`}><button className="card-list-info" onClick={()=>inspect(card)} aria-label={`Inspect ${card.name}`}><img src={card.art} alt=""/><span><CardListName name={card.name}/>{card.legendary&&<LegendaryMark/>}<span className="list-card-stats"><Cost card={card}/>{card.stats?<><span>{card.stats.attack} / {card.stats.defense}</span>{card.type==='creature'?<EnergyOutput outputs={card.stats.energyOutputs}/>:<span>Bastion</span>}</>:<span>Spell</span>}</span><CardLore card={card} className="list-lore"/></span></button><button className="add-card" aria-label={`Add ${card.name}`} title={n>=limit?'Copy limit reached':'Add to deck'} disabled={n>=limit} onClick={()=>add(card.id)}><Plus size={17}/><span>{n}/{limit}</span></button></article>;
          })}</div>}
        </section>
        {screen==='builder'&&<section className="deck-cards-panel" aria-label="Cards in deck"><div className="collection-panel-heading"><h2>Cards in deck</h2><span>{draft.cards.length}</span></div>
          <label className="deck-name-label">Deck name<input maxLength={60} value={draft.name} onChange={e=>change({...draft,name:e.target.value})}/></label>
          <div className={`deck-validity ${errors.length?'incomplete':'valid'}`} role="status">{errors.length?<><span>{draft.cards.length} / {deckRules.minimumCards} cards</span><small>Add {Math.max(0,deckRules.minimumCards-draft.cards.length)} more to play.</small></>:<><Check size={14}/><span>{draft.cards.length} cards · ready to play</span></>}</div>
          <div className="deck-card-list">{!deckCards.length?<div className="collection-empty"><Layers size={28}/><p>Your deck starts here.</p><small>Add cards from the left, or load a starter above.</small></div>:deckCards.map(card=><div key={card.id} className={`deck-card-row ${card.legendary?'legendary-row':''}`}><button className="deck-card-info" onClick={()=>inspect(card)} aria-label={`Inspect ${card.name} in deck`}><span className="deck-quantity">{counts.get(card.id)}×</span><span><CardListName name={card.name}/>{card.legendary&&<LegendaryMark/>}<small><Cost card={card}/></small></span></button><button className="deck-remove" aria-label={`Remove ${card.name}`} onClick={()=>remove(card.id)}><Minus size={15}/></button></div>)}</div>
          <div className="deck-save-area"><button className="gold-button full" disabled={!draft.name.trim()} onClick={save}>Save deck<Check size={16}/></button><p role="status">{message||'Draft kept on this device. Save to use it in Play.'}</p></div>
        </section>}
      </div>
    </main>}
    {booster&&<BoosterOpening key={booster.id} pack={booster} reduced={props.reduced} suspended={!!inspected}
      close={()=>setBooster(null)} openAnother={openBooster} inspect={inspect}
      browse={()=>{setBooster(null);navigate('cards');}}/>}
    {inspected&&<div className="modal-backdrop collection-modal" onClick={()=>setInspected(null)}><section ref={detailRef} onKeyDown={trapDetailFocus} className="collection-card-detail" role="dialog" aria-modal="true" aria-label={`${inspected.name} details`} onClick={e=>e.stopPropagation()}><button className="collection-close" aria-label="Close card details" onClick={()=>setInspected(null)} autoFocus><X size={20}/></button><CardDetail card={inspected} animated reduced={props.reduced}>{screen==='builder'&&<button className="gold-button" disabled={copyCount(draft.cards,inspected.id)>=(inspected.legendary?deckRules.copiesPerLegendary:deckRules.copiesPerCard)} onClick={()=>add(inspected.id)}>Add to deck<Plus size={16}/></button>}</CardDetail></section></div>}
  </div>;
}
