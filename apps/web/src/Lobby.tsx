import { ArrowLeft, ArrowRight, BookOpen, Crown, GraduationCap, Gift, Layers, Plus, Search, Settings, Swords, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { factionInfo, registry } from '../../../packages/content/src';
import { boosterPacks, type BoosterPack } from '../../../packages/content/src/boosters';
import type { CardDefinition } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { BoosterOpening, packColor, packLines, type OpenBooster } from './BoosterOpening';
import { ArtCard, cardAbilityDescriptions } from './CardPresentation';
import { CardDetail } from './CardDetail';
import { addDeckCard, deckCardAvailability, draftKey, parseDeck, removeDeckCard, starterOptions, type CustomDeck } from './decks';
import { buyCollectionBooster, collectionRules, gainDebugCrowns, missingDeckCopies, openCollectionBooster, ownershipLimit, packCount, totalPacks } from './collection';
import { updateCollection, useCollection } from './collectionStore';
import { CrownAmount, CrownIcon } from './Crowns';
import { DeckBuilder } from './DeckBuilder';
import { GameSetup, type SetupMode } from './GameSetup';
import type { RtcRoom } from './multiplayer/RtcRoom';
import { Avatar } from './Avatar';
import { ProfilePage } from './ProfilePage';
import { SettingsPage } from './SettingsPage';
import { useProfile } from './profile';
import { tutorialKey } from './tutorial';

export type Screen='menu'|'cards'|'builder'|'store'|'profile'|'settings'|'multiplayer'|'match';
type Mode='practice'|'hotseat';
type Props={
  reduced:boolean; screen:Exclude<Screen,'match'>; navigate:(screen:Screen)=>void; canResume:boolean; resumeLabel:string;
  decks:CustomDeck[]; options:{id:string;name:string;cards:string[]}[]; saveDeck:(deck:CustomDeck)=>string|null;
  mode:Mode; setMode:(mode:Mode)=>void; selected:string; setSelected:(id:string)=>void;
  opponentId:string; setOpponentId:(id:string)=>void;
  seed:string; setSeed:(seed:string)=>void; start:(skirmish:boolean)=>void;
  startOnline:(room:RtcRoom)=>void;
  /** Starts the guided first match. */
  learn:()=>void;
};
function emptyDeck():CustomDeck{return {id:`custom-${crypto.randomUUID()}`,name:'New deck',cards:[]};}
function readDraft():CustomDeck {
  try{return parseDeck(JSON.parse(localStorage.getItem(draftKey)??'null'),true)??emptyDeck();}catch{return emptyDeck();}
}
export function Lobby(props:Props){
  const {screen,navigate,canResume}=props;
  // New players are offered the tutorial once. Any answer, or having a match under way, settles it.
  const profile=useProfile();
  const [offer,setOffer]=useState(()=>{try{return screen==='menu'&&!canResume&&!localStorage.getItem(tutorialKey);}catch{return false;}});
  function settleOffer(value:string){try{localStorage.setItem(tutorialKey,value);}catch{/* Optional. */}setOffer(false);}
  const [setup,setSetup]=useState<SetupMode|null>(screen==='multiplayer'?'online':null);
  const setupOrigin=useRef<HTMLElement|null>(null);
  const isHome=screen==='menu'||screen==='multiplayer';
  function openSetup(mode:SetupMode){setupOrigin.current=document.activeElement as HTMLElement;if(!isHome)navigate('menu');setSetup(mode);}
  useEffect(()=>{if(!setup){setupOrigin.current?.focus();setupOrigin.current=null;}},[setup]);
  function setSetupMode(mode:SetupMode){setSetup(mode);if(mode!=='online')props.setMode(mode);}
  useEffect(()=>{if(screen==='multiplayer')setSetup('online');else if(screen!=='menu')setSetup(null);},[screen]);
  const [query,setQuery]=useState(''),[faction,setFaction]=useState('all'),[kind,setKind]=useState('all');
  const [draft,setDraft]=useState<CustomDeck>(readDraft),[message,setMessage]=useState('');
  const [past,setPast]=useState<CustomDeck[]>([]);
  const editingName=useRef(false);
  const [inspected,setInspected]=useState<CardDefinition|null>(null);
  const {collection,saved:collectionSaved}=useCollection();
  const [collectionMessage,setCollectionMessage]=useState('');
  const [booster,setBooster]=useState<OpenBooster|null>(null);
  const boosterOrigin=useRef<HTMLElement|null>(null);
  const ownedCopies=collection.counts;
  const ownedTotal=Object.values(ownedCopies).reduce((sum,count)=>sum+count,0);
  const boostersAvailable=totalPacks(collection);
  useEffect(()=>{if(!booster)return;const origin=boosterOrigin.current;return()=>origin?.focus();},[!!booster]);
  function openBooster(pack:BoosterPack=boosterPacks[0]){
    try{
      if(!booster)boosterOrigin.current=document.activeElement as HTMLElement;
      let reward:ReturnType<typeof openCollectionBooster>|undefined;
      const next=updateCollection(current=>{reward=openCollectionBooster(current,pack,registry);return reward.collection;});
      if(reward)setBooster({id:crypto.randomUUID(),cards:reward.cards,saved:next.saved,pack});
      setCollectionMessage('');
    }catch(cause){setCollectionMessage(cause instanceof Error?cause.message:'Could not open this booster.');}
  }
  function buyBooster(pack:BoosterPack){
    try{updateCollection(current=>buyCollectionBooster(current,pack));setCollectionMessage(`${pack.name} added to your boosters.`);}
    catch(cause){setCollectionMessage(cause instanceof Error?cause.message:'Could not buy this booster.');}
  }
  const detailRef=useRef<HTMLElement>(null),focusOrigin=useRef<HTMLElement|null>(null);
  function inspect(card:CardDefinition){focusOrigin.current=document.activeElement as HTMLElement;setInspected(card);}
  useEffect(()=>{if(!inspected)return;const origin=focusOrigin.current;return()=>origin?.focus();},[inspected]);
  function trapDetailFocus(event:React.KeyboardEvent){if(event.key!=='Tab')return;const buttons=Array.from(detailRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')??[]);const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{/* Explicit saves report storage failures. */}},[draft]);
  useEffect(()=>{setInspected(null);setQuery('');setFaction('all');setKind('all');},[screen]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(inspected)setInspected(null);else if(booster)setBooster(null);else if(setup)setSetup(null);else if(screen!=='menu')navigate('menu');}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[inspected,booster,setup,screen,navigate]);
  const cards=useMemo(()=>Object.values(registry.cards).filter(card=>{
    const text=`${card.name} ${card.lore ?? ''} ${cardAbilityDescriptions(card).map(ability=>`${ability.name} ${ability.description}`).join(' ')} ${card.subtypes.join(' ')} ${card.legendary?'legendary':''}`.toLowerCase();
    return text.includes(query.toLowerCase().trim())&&(kind==='all'||card.type===kind)&&(faction==='all'||faction==='neutral'&&!card.factions.length||card.factions.includes(faction as never));
  }).sort((a,b)=>a.name.localeCompare(b.name)),[query,kind,faction]);
  const change=(next:CustomDeck)=>{if(JSON.stringify(next)===JSON.stringify(draft))return;const nameOnly=next.id===draft.id&&next.cards===draft.cards;if(!nameOnly||!editingName.current)setPast(list=>[...list.slice(-49),structuredClone(draft)]);editingName.current=nameOnly;setDraft(next);setMessage('');};
  const undo=()=>{const previous=past[past.length-1];if(!previous)return;editingName.current=false;setDraft(previous);setPast(list=>list.slice(0,-1));setMessage('Edit undone.');};
  const add=(id:string)=>change({...draft,cards:addDeckCard(draft.cards,id,registry,ownedCopies)});
  const remove=(id:string)=>change({...draft,cards:removeDeckCard(draft.cards,id)});
  function load(id:string){
    const saved=props.decks.find(d=>d.id===id),starter=starterOptions.find(d=>d.id===id);
    if(saved)change({...saved,cards:[...saved.cards]});
    else if(starter)change({...emptyDeck(),name:`${starter.name} (copy)`,cards:[...starter.cards]});
  }
  function save(){const next={...draft,name:draft.name.trim()};const error=props.saveDeck(next);setMessage(error??'Saved locally. Your deck is available in Play.');if(!error){editingName.current=false;setDraft(next);}return !error;}
  return <div className={`lobby ${isHome?'menu-screen':''}`}>
    <div className="world-bg"/><div className="world-vignette"/>
    <header className="lobby-header" inert={setup!==null}>
      <button className="brand" onClick={()=>navigate('menu')} aria-label="Main menu"><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button>
      <nav aria-label="Main navigation">
        <button className={isHome?'active':''} onClick={()=>navigate('menu')}>Menu</button>
        <button className={screen==='cards'||screen==='builder'?'active':''} onClick={()=>navigate('cards')}><BookOpen size={15}/>Collection</button>
        <button className={screen==='store'?'active':''} onClick={()=>navigate('store')}><Gift size={15}/>Store</button>
        <button className={screen==='profile'?'active':''} onClick={()=>navigate('profile')}><User size={15}/>Profile</button>
      </nav>
      <button className="collection-wallet-pill" aria-label={`Open store, ${collection.crowns} crowns, ${boostersAvailable} boosters`} onClick={()=>navigate('store')}><CrownAmount amount={collection.crowns}/><span className="wallet-pack-count"><Gift size={14}/>{boostersAvailable}</span></button>
      <button className={`lobby-settings ${screen==='settings'?'active':''}`} aria-label="Settings" title="Settings" onClick={()=>navigate('settings')}><Settings size={17}/></button>
      {canResume&&<button className="lobby-resume" onClick={()=>navigate('match')}><ArrowLeft size={15}/>Return to match</button>}
    </header>
    {(screen==='cards'||screen==='builder')&&<div className="collection-tabs" role="tablist" aria-label="Collection">
      <button role="tab" aria-selected={screen==='cards'} className={screen==='cards'?'active':''} onClick={()=>navigate('cards')}><BookOpen size={15}/>Cards<small>{Object.keys(registry.cards).length}</small></button>
      <button role="tab" aria-selected={screen==='builder'} className={screen==='builder'?'active':''} onClick={()=>navigate('builder')}><Layers size={15}/>Decks<small>{props.decks.length}</small></button>
    </div>}
    {isHome?<main className="start-menu" inert={setup!==null}>
      <section className="start-welcome"><h1>The realm awaits.</h1>
        <button className="gold-button start-play" aria-haspopup="dialog" onClick={()=>openSetup(props.mode)}><Swords size={23}/><span>Play</span><ArrowRight size={21}/></button>
        {canResume&&<button className="start-resume" onClick={()=>navigate('match')}><span><b>Continue match</b><small>{props.resumeLabel}</small></span><ArrowRight size={18}/></button>}
      </section>
      <div className="start-destinations">
        <button className="menu-destination" onClick={()=>navigate('cards')}><BookOpen size={24}/><div><h2>Collection</h2><span>{Object.keys(registry.cards).length} cards{props.decks.length>0?` · ${props.decks.length} saved ${props.decks.length===1?'deck':'decks'}`:''}</span></div><ArrowRight size={19}/></button>
        <button className="menu-destination" onClick={()=>navigate('store')}><Gift size={24}/><div><h2>Store</h2><span>{boostersAvailable} boosters waiting · {ownedTotal} cards owned</span></div><ArrowRight size={19}/></button>
        <button className="menu-destination menu-profile" onClick={()=>navigate('profile')}><Avatar id={profile.avatar} size={44}/><div><h2>Profile</h2><span>{profile.name}</span></div><ArrowRight size={19}/></button>
      </div>
      
    </main>:screen==='profile'?<ProfilePage/>:screen==='settings'?<SettingsPage learn={props.learn} watch={props.startOnline}/>:screen==='store'?<main className="store-page">
      <div className="collection-heading"><div><h1>Store</h1></div></div>
      <section className="crown-vault" aria-label="Crowns and boosters">
        <div className="crown-vessel" aria-hidden="true"><div className="crown-vessel-aura"/><CrownIcon/><i/><i/><i/></div>
        <div className="crown-vault-balance"><CrownAmount amount={collection.crowns}/></div>
        <div className="crown-vault-packs"><Gift size={24}/><strong>{boostersAvailable}</strong><span>{boostersAvailable===1?'booster waiting':'boosters waiting'}</span></div>
        <button className="crown-debug-button" onClick={()=>{updateCollection(gainDebugCrowns);setCollectionMessage('Debug grant: +1,000 crowns.');}}><Plus size={14}/>Gain 1,000 crowns<small>DEBUG</small></button>
      </section>
      <div className="collection-economy-note"><span>Duplicate crowns: common {collectionRules.duplicateCrowns.common} · rare {collectionRules.duplicateCrowns.rare} · legendary {collectionRules.duplicateCrowns.legendary}</span><span role="status">{collectionMessage}</span></div>
      {!collectionSaved&&<p className="collection-save-error" role="alert">Your collection is available for this session. Browser storage could not save it.</p>}
      <section className="store-shelf" aria-label="Boosters">
        {boosterPacks.map(pack=>{return <article className="store-item" key={pack.id} style={packColor(pack) as React.CSSProperties}>
          <div className="store-pack-stage" aria-hidden="true"><div className="store-pack-glow"/><div className="booster-pack store-pack"><span>REALMS OF VARHYR</span>{pack.faction?<b className="pack-symbol">{factionInfo[pack.faction]?.symbol}</b>:<Crown size={55}/>}<strong>{packLines(pack.name)}</strong><small>FIVE CARDS</small></div></div>
          <div className="store-item-body"><h2>{pack.name}</h2><p>{pack.blurb}</p>
            <div className="store-pack-inventory">{packCount(collection,pack.id)} owned</div>
            <div className="store-buy"><button className="gold-button" aria-label={`Open ${pack.name} booster`} disabled={!packCount(collection,pack.id)} onClick={()=>openBooster(pack)}><Gift size={17}/>Open booster</button><button className="outline-button store-crown-buy" aria-label={`Buy ${pack.name} booster for ${collectionRules.packCost} crowns`} disabled={collection.crowns<collectionRules.packCost} onClick={()=>buyBooster(pack)}>Buy<CrownAmount amount={collectionRules.packCost}/></button></div></div>
        </article>;})}
      </section>
    </main>:screen==='builder'?<DeckBuilder draft={draft} decks={props.decks} ownedCopies={ownedCopies} message={message} canUndo={!!past.length} reduced={props.reduced} change={change} add={add} remove={remove} load={load} save={save} undo={undo} inspect={inspect}/>:<main className="collection-page">
      <div className="collection-heading"><div><h1>Cards</h1></div></div>
      <div className="collection-columns"><section className="all-cards-panel" aria-label="All cards">{cards.length!==Object.keys(registry.cards).length&&<div className="collection-panel-heading"><span>{cards.length} / {Object.keys(registry.cards).length}</span></div>}
        <div className="collection-filters"><label className="collection-search"><Search size={16}/><input aria-label="Search cards" placeholder="Search cards or abilities…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <select aria-label="Filter by faction" value={faction} onChange={e=>setFaction(e.target.value)}><option value="all">All factions</option>{Object.entries(factionInfo).map(([id,f])=><option key={id} value={id}>{f.symbol} {f.name}</option>)}</select>
          <select aria-label="Filter by card type" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All types</option><option value="creature">Creatures</option><option value="spell">Spells</option><option value="bastion">Bastions</option></select></div>
        {!cards.length&&<p className="collection-empty">No cards match. Try another search or faction.</p>}
        <div className="collection-card-grid">{cards.map(card=><article key={card.id}><ArtCard card={card} reduced={props.reduced} onClick={()=>inspect(card)}/><div className="collection-card-meta"><span className={`collection-rarity rarity-${card.rarity}`}>{card.rarity}</span><span className="collection-reward-count">{ownedCopies[card.id]??0}/{ownershipLimit(card)} owned</span></div></article>)}</div>
      </section></div>
    </main>}
    {offer&&<div className="modal-backdrop" onClick={()=>settleOffer('skipped')}><section className="choice-dialog tutorial-offer" role="dialog" aria-modal="true" aria-label="Learn to play" onClick={e=>e.stopPropagation()}><h2>New to Varhyr?</h2><div className="tutorial-offer-actions"><button className="gold-button" autoFocus onClick={()=>{settleOffer('started');props.learn();}}><GraduationCap size={17}/>Start the tutorial</button><button className="outline-button" onClick={()=>settleOffer('skipped')}>I’ll figure it out</button></div></section></div>}
    {setup&&<GameSetup mode={setup} setMode={setSetupMode} close={()=>{setSetup(null);if(screen==='multiplayer')navigate('menu');}}
      options={props.options} selected={props.selected} setSelected={props.setSelected} ownedCopies={ownedCopies}
      opponentId={props.opponentId} setOpponentId={props.setOpponentId} seed={props.seed} setSeed={props.setSeed}
      start={props.start} startOnline={props.startOnline}/>}
    {booster&&<BoosterOpening key={booster.id} pack={booster} reduced={props.reduced} suspended={!!inspected}
      close={()=>setBooster(null)} openAnother={()=>openBooster(booster.pack)} canOpenAnother={packCount(collection,booster.pack.id)>0} inspect={inspect}
      browse={()=>{setBooster(null);navigate('cards');}}/>}
    {inspected&&<div className="modal-backdrop collection-modal" onClick={()=>setInspected(null)}><section ref={detailRef} onKeyDown={trapDetailFocus} className="collection-card-detail" role="dialog" aria-modal="true" aria-label={`${inspected.name} details`} onClick={e=>e.stopPropagation()}><button className="collection-close" aria-label="Close card details" onClick={()=>setInspected(null)} autoFocus><X size={20}/></button><CardDetail card={inspected} animated reduced={props.reduced}>{screen==='builder'&&<button className="gold-button" disabled={!deckCardAvailability(draft.cards,inspected.id,registry,ownedCopies).remaining} onClick={()=>add(inspected.id)}>Add to deck<Plus size={16}/></button>}</CardDetail></section></div>}
  </div>;
}
