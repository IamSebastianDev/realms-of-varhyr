import { Checkbox } from './Checkbox';
import { FactionSelect } from './FactionSelect';
import { subtypeLabel, t as msg, useLanguage } from './i18n';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Crown, GraduationCap, Gift, Layers, Plus, Search, Settings, Swords, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { factionInfo, registry, setDefinitions, setInfo } from '../../../packages/content/src';
import { boosterPacks, type BoosterPack } from '../../../packages/content/src/boosters';
import type { CardDefinition } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { BoosterOpening, packColor, packLines, packSymbol, type OpenBooster } from './BoosterOpening';
import { ArtCard, cardAbilityDescriptions } from './CardPresentation';
import { CardDetail } from './CardDetail';
import { OwnershipPips } from './OwnershipPips';
import { addDeckCard, deckCardAvailability, draftKey, parseDeck, removeDeckCard, starterOptions, type CustomDeck } from './decks';
import { buyCollectionBooster, buyCollectionCard, collectionRules, gainDebugCrowns, missingDeckCopies, openCollectionBooster, ownedCopyCount, packCount, totalPacks } from './collection';
import { updateCollection, useCollection } from './collectionStore';
import { CardPurchase } from './CardPurchase';
import { CollectionStats } from './CollectionStats';
import { CrownAmount, CrownIcon } from './Crowns';
import { DeckBuilder } from './DeckBuilder';
import { GameSetup, type SetupMode } from './GameSetup';
import type { ExternalMatchSession } from './match/MatchSession';
import { Avatar } from './Avatar';
import { ProfilePage } from './ProfilePage';
import { SettingsPage } from './SettingsPage';
import { useProfile } from './profile';
import { tutorialKey } from './tutorial';
import { compareCards } from './deckTools';

export type Screen='menu'|'cards'|'builder'|'stats'|'store'|'profile'|'settings'|'multiplayer'|'match';
type Mode='practice'|'hotseat';
type Props={
  reduced:boolean; screen:Exclude<Screen,'match'>; navigate:(screen:Screen)=>void; canResume:boolean; resumeLabel:string;
  decks:CustomDeck[]; options:{id:string;name:string;cards:string[]}[]; saveDeck:(deck:CustomDeck)=>string|null; deleteDeck:(id:string)=>string|null;
  mode:Mode; setMode:(mode:Mode)=>void; selected:string; setSelected:(id:string)=>void;
  opponentId:string; setOpponentId:(id:string)=>void;
  seed:string; setSeed:(seed:string)=>void; start:(skirmish:boolean)=>void;
  startSession:(session:ExternalMatchSession)=>void;
  /** Starts the guided first match. */
  learn:()=>void;
};
function emptyDeck():CustomDeck{return {id:`custom-${crypto.randomUUID()}`,name:msg("New deck"),cards:[]};}
function readDraft():CustomDeck {
  try{return parseDeck(JSON.parse(localStorage.getItem(draftKey)??'null'),true)??emptyDeck();}catch{return emptyDeck();}
}
export function Lobby(props:Props){
  useLanguage();
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
  const [query,setQuery]=useState(''),[faction,setFaction]=useState('all'),[kind,setKind]=useState('all'),[set,setSet]=useState('all');
  const [showUnowned,setShowUnowned]=useState(false);
  const [draft,setDraft]=useState<CustomDeck>(readDraft),[message,setMessage]=useState('');
  const [past,setPast]=useState<CustomDeck[]>([]);
  const editingName=useRef(false);
  const [inspected,setInspected]=useState<CardDefinition|null>(null);
  const {collection,saved:collectionSaved}=useCollection();
  const [collectionMessage,setCollectionMessage]=useState('');
  const [booster,setBooster]=useState<OpenBooster|null>(null);
  const boosterOrigin=useRef<HTMLElement|null>(null);
  const ownedCopies=collection.counts;
  const ownedUnique=Object.values(registry.cards).filter(card=>ownedCopyCount(ownedCopies,card.id)>0).length;
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
    }catch(cause){setCollectionMessage(cause instanceof Error?cause.message:msg("Could not open this booster."));}
  }
  function buyBooster(pack:BoosterPack){
    try{updateCollection(current=>buyCollectionBooster(current,pack));setCollectionMessage(msg("{v0} added to your boosters.", {v0: pack.name}));}
    catch(cause){setCollectionMessage(cause instanceof Error?cause.message:msg("Could not buy this booster."));}
  }
  const detailRef=useRef<HTMLElement>(null),focusOrigin=useRef<HTMLElement|null>(null);
  function inspect(card:CardDefinition){focusOrigin.current=document.activeElement as HTMLElement;setInspected(card);}
  useEffect(()=>{if(!inspected)return;const origin=focusOrigin.current;return()=>origin?.focus();},[inspected]);
  function trapDetailFocus(event:React.KeyboardEvent){if(event.key!==msg("Tab"))return;const buttons=Array.from(detailRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')??[]);const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{/* Explicit saves report storage failures. */}},[draft]);
  useEffect(()=>{setInspected(null);setQuery('');setFaction('all');setKind('all');setSet('all');setShowUnowned(false);},[screen]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key===msg("Escape")){if(inspected)setInspected(null);else if(booster)setBooster(null);else if(setup)setSetup(null);else if(screen!=='menu')navigate('menu');}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[inspected,booster,setup,screen,navigate]);
  const cards=useMemo(()=>Object.values(registry.cards).filter(card=>{
    const release=card.set ? setInfo[card.set] : undefined;
    const text=[card.name,card.lore,card.set,release?.name,release?.code,release?.translations?.de?.name,...Object.values(card.translations??{}).flatMap(text=>[text?.name,text?.lore]),...card.subtypes.map(subtype=>subtypeLabel(subtype,'de')),
      ...cardAbilityDescriptions(card).flatMap(ability=>[ability.name,ability.description]),
      ...[...card.abilities,...card.cast??[]].flatMap(binding=>[registry.abilities[binding.id].name,registry.abilities[binding.id].description]),
      ...card.subtypes,card.legendary?'legendary legendär':''].join(' ').toLowerCase();
    return (showUnowned||ownedCopyCount(ownedCopies,card.id)>0)&&text.includes(query.toLowerCase().trim())&&(set==='all'||card.set===set)&&(kind==='all'||card.type===kind)&&(faction==='all'||faction==='neutral'&&!card.factions.length||card.factions.includes(faction as never));
  }).sort(compareCards),[query,kind,faction,set,showUnowned,ownedCopies]);
  const change=(next:CustomDeck)=>{if(JSON.stringify(next)===JSON.stringify(draft))return;const nameOnly=next.id===draft.id&&next.cards===draft.cards;if(!nameOnly||!editingName.current)setPast(list=>[...list.slice(-49),structuredClone(draft)]);editingName.current=nameOnly;setDraft(next);setMessage('');};
  const undo=()=>{const previous=past[past.length-1];if(!previous)return;editingName.current=false;setDraft(previous);setPast(list=>list.slice(0,-1));setMessage(msg("Edit undone."));};
  const add=(id:string)=>change({...draft,cards:addDeckCard(draft.cards,id,registry,ownedCopies)});
  const remove=(id:string)=>change({...draft,cards:removeDeckCard(draft.cards,id)});
  function load(id:string){
    const saved=props.decks.find(d=>d.id===id),starter=starterOptions.find(d=>d.id===id);
    if(saved)change({...saved,cards:[...saved.cards]});
    else if(starter)change({...emptyDeck(),name:msg("{v0} (copy)", {v0: starter.name}),cards:[...starter.cards]});
  }
  function save(){const next={...draft,name:draft.name.trim()};const error=props.saveDeck(next);setMessage(error??msg("Saved locally. Your deck is available in Play."));if(!error){editingName.current=false;setDraft(next);}return !error;}
  function deleteDraft(){const error=props.deleteDeck(draft.id);if(error){setMessage(error);return;}editingName.current=false;setPast([]);setDraft(emptyDeck());setMessage(msg("Deck deleted."));}
  return <div className={`lobby ${isHome?'menu-screen':''}`}>
    <div className="world-bg"/><div className="world-vignette"/>
    <header className="lobby-header" inert={setup!==null}>
      <button className="brand" onClick={()=>navigate('menu')} aria-label={msg("Main menu")}><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button>
      <nav aria-label={msg("Main navigation")}>
        <button className={isHome?'active':''} onClick={()=>navigate('menu')}>{msg("Menu")}</button>
        <button className={screen==='cards'||screen==='builder'||screen==='stats'?'active':''} onClick={()=>navigate('cards')}><BookOpen size={15}/>{msg("Collection")}</button>
        <button className={screen==='store'?'active':''} onClick={()=>navigate('store')}><Gift size={15}/>{msg("Store")}</button>
        <button className={screen==='profile'?'active':''} onClick={()=>navigate('profile')}><User size={15}/>{msg("Profile")}</button>
      </nav>
      <button className="collection-wallet-pill" aria-label={msg("Open store, {v0} crowns, {v1} boosters", {v0: collection.crowns, v1: boostersAvailable})} onClick={()=>navigate('store')}><CrownAmount amount={collection.crowns}/><span className="wallet-pack-count"><Gift size={14}/>{boostersAvailable}</span></button>
      <button className={`lobby-settings ${screen==='settings'?'active':''}`} aria-label={msg("Settings")} title={msg("Settings")} onClick={()=>navigate('settings')}><Settings size={17}/></button>
      {canResume&&<button className="lobby-resume" aria-label={msg("Return to match")} onClick={()=>navigate('match')}><ArrowLeft size={15}/>{msg("Return to match")}</button>}
    </header>
    {(screen==='cards'||screen==='builder'||screen==='stats')&&<div className="collection-tabs" role="tablist" aria-label={msg("Collection")}>
      <button role="tab" aria-selected={screen==='cards'} className={screen==='cards'?'active':''} onClick={()=>navigate('cards')}><BookOpen size={15}/>{msg("Cards")}<small>{ownedUnique}</small></button>
      <button role="tab" aria-selected={screen==='builder'} className={screen==='builder'?'active':''} onClick={()=>navigate('builder')}><Layers size={15}/>{msg("Decks")}<small>{props.decks.length}</small></button>
      <button role="tab" aria-selected={screen==='stats'} className={screen==='stats'?'active':''} onClick={()=>navigate('stats')}><BarChart3 size={15}/>{msg("Statistics")}</button>
    </div>}
    {isHome?<main className="start-menu" inert={setup!==null}>
      <section className="start-welcome"><h1>{msg("The realm awaits.")}</h1>
        <button className="gold-button start-play" aria-haspopup="dialog" onClick={()=>openSetup(props.mode)}><Swords size={23}/><span>{msg("Play")}</span><ArrowRight size={21}/></button>
        {canResume&&<button className="start-resume" onClick={()=>navigate('match')}><span><b>{msg("Continue match")}</b><small>{msg(props.resumeLabel)}</small></span><ArrowRight size={18}/></button>}
      </section>
      <div className="start-destinations">
        <button className="menu-destination" onClick={()=>navigate('cards')}><BookOpen size={24}/><div><h2>{msg("Collection")}</h2><span>{ownedUnique} {msg("cards owned")}{props.decks.length>0?msg(" · {v0} saved {v1}", {v0: props.decks.length, v1: props.decks.length===1?'deck':'decks'}):''}</span></div><ArrowRight size={19}/></button>
        <button className="menu-destination" onClick={()=>navigate('store')}><Gift size={24}/><div><h2>{msg("Store")}</h2><span>{boostersAvailable} {msg("boosters waiting ·")}{' '}{ownedTotal} {msg("cards owned")}</span></div><ArrowRight size={19}/></button>
        <button className="menu-destination menu-profile" onClick={()=>navigate('profile')}><Avatar id={profile.avatar} size={44}/><div><h2>{msg("Profile")}</h2><span>{profile.name}</span></div><ArrowRight size={19}/></button>
      </div>
      
    </main>:screen==='profile'?<ProfilePage/>:screen==='settings'?<SettingsPage learn={props.learn} watch={props.startSession}/>:screen==='store'?<main className="store-page">
      <div className="collection-heading"><div><h1>{msg("Store")}</h1></div></div>
      <section className="crown-vault" aria-label={msg("Crowns and boosters")}>
        <div className="crown-vessel" aria-hidden="true"><div className="crown-vessel-aura"/><CrownIcon/><i/><i/><i/></div>
        <div className="crown-vault-balance"><CrownAmount amount={collection.crowns}/></div>
        <div className="crown-vault-packs"><Gift size={24}/><strong>{boostersAvailable}</strong><span>{boostersAvailable===1?msg("booster waiting"):msg("boosters waiting")}</span></div>
        <button className="crown-debug-button" onClick={()=>{updateCollection(gainDebugCrowns);setCollectionMessage(msg("Debug grant: +1,000 crowns."));}}><Plus size={14}/>{msg("Gain 1,000 crowns")}<small>{msg("DEBUG")}</small></button>
      </section>
      <div className="collection-economy-note"><span>{msg("Duplicate crowns: common")}{' '}{collectionRules.duplicateCrowns.common} {msg("· rare")}{' '}{collectionRules.duplicateCrowns.rare} {msg("· legendary")}{' '}{collectionRules.duplicateCrowns.legendary}</span><span role="status">{msg(collectionMessage)}</span></div>
      {!collectionSaved&&<p className="collection-save-error" role="alert">{msg("Your collection is available for this session. Browser storage could not save it.")}</p>}
      <section className="store-shelf" aria-label={msg("Boosters")}>
        {boosterPacks.map(pack=>{return <article className="store-item" key={pack.id} style={packColor(pack) as React.CSSProperties}>
          <div className="store-pack-stage" aria-hidden="true"><div className="store-pack-glow"/><div className="booster-pack store-pack"><span>REALMS OF VARHYR</span>{packSymbol(pack)?<b className="pack-symbol">{packSymbol(pack)}</b>:<Crown size={55}/>}<strong>{packLines(msg(pack.name))}</strong><small>{msg("FIVE CARDS")}</small></div></div>
          <div className="store-item-body"><h2>{msg(pack.name)}</h2><p>{msg(pack.blurb)}</p>
            <div className="store-pack-inventory">{packCount(collection,pack.id)} {msg("owned")}</div>
            <div className="store-buy"><button className="gold-button" aria-label={msg("Open {v0} booster", {v0: pack.name})} disabled={!packCount(collection,pack.id)} onClick={()=>openBooster(pack)}><Gift size={17}/>{msg("Open booster")}</button><button className="outline-button store-crown-buy" aria-label={msg("Buy {v0} booster for {v1} crowns", {v0: pack.name, v1: collectionRules.packCost})} disabled={collection.crowns<collectionRules.packCost} onClick={()=>buyBooster(pack)}>{msg("Buy")}<CrownAmount amount={collectionRules.packCost}/></button></div></div>
        </article>;})}
      </section>
    </main>:screen==='stats'?<CollectionStats collection={collection} inspect={inspect}/>:screen==='builder'?<DeckBuilder draft={draft} decks={props.decks} ownedCopies={ownedCopies} message={msg(message)} canUndo={!!past.length} reduced={props.reduced} change={change} add={add} remove={remove} load={load} save={save} removeDeck={deleteDraft} undo={undo} inspect={inspect}/>:<main className="collection-page">
      <div className="collection-heading"><div><h1>{msg("Cards")}</h1></div></div>
      <div className="collection-columns"><section className="all-cards-panel" aria-label={msg("All cards")}>{cards.length!==Object.keys(registry.cards).length&&<div className="collection-panel-heading"><span>{cards.length} / {Object.keys(registry.cards).length}</span></div>}
        <div className="collection-filters"><label className="collection-search"><Search size={16}/><input aria-label={msg("Search cards")} placeholder={msg("Search cards or abilities…")} value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <FactionSelect aria-label={msg("Filter by faction")} value={faction} onChange={e=>setFaction(e.target.value)}/>
          <select aria-label={msg("Filter by set")} value={set} onChange={e=>setSet(e.target.value)}><option value="all">{msg("All sets")}</option>{setDefinitions.map(set=><option key={set.id} value={set.id}>{msg(set.name)}</option>)}</select>
          <select aria-label={msg("Filter by card type")} value={kind} onChange={e=>setKind(e.target.value)}><option value="all">{msg("All types")}</option><option value="creature">{msg("Creatures")}</option><option value="spell">{msg("Spells")}</option><option value="bulwark">{msg("Bulwarks")}</option></select>
          <Checkbox className="collection-unowned-filter" checked={showUnowned} onChange={e=>setShowUnowned(e.target.checked)}>{msg("Show unowned")}</Checkbox></div>
        {!cards.length&&<p className="collection-empty">{showUnowned?msg("No cards match. Try another search or filter."):msg("No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.")}</p>}
        <div className="collection-card-grid">{cards.map(card=><article key={card.id} className={ownedCopyCount(ownedCopies,card.id)>0?undefined:'unowned-card'}><ArtCard card={card} reduced={props.reduced} onClick={()=>inspect(card)}/><div className="collection-card-meta"><span className={`collection-rarity rarity-${card.legendary?'legendary':card.rarity}`}>{msg(card.rarity)}</span><OwnershipPips card={card} owned={ownedCopies}/></div></article>)}</div>
      </section></div>
    </main>}
    {offer&&<div className="modal-backdrop" onClick={()=>settleOffer('skipped')}><section className="choice-dialog tutorial-offer" role="dialog" aria-modal="true" aria-label={msg("Learn to play")} onClick={e=>e.stopPropagation()}><h2>{msg("New to Varhyr?")}</h2><div className="tutorial-offer-actions"><button className="gold-button" autoFocus onClick={()=>{settleOffer('started');props.learn();}}><GraduationCap size={17}/>{msg("Start the tutorial")}</button><button className="outline-button" onClick={()=>settleOffer('skipped')}>{msg("I’ll figure it out")}</button></div></section></div>}
    {setup&&<GameSetup mode={setup} setMode={setSetupMode} close={()=>{setSetup(null);if(screen==='multiplayer')navigate('menu');}}
      options={props.options} selected={props.selected} setSelected={props.setSelected} ownedCopies={ownedCopies}
      opponentId={props.opponentId} setOpponentId={props.setOpponentId} seed={props.seed} setSeed={props.setSeed}
      start={props.start} startSession={props.startSession}/>}
    {booster&&<BoosterOpening key={booster.id} pack={booster} reduced={props.reduced} suspended={!!inspected}
      close={()=>setBooster(null)} openAnother={()=>openBooster(booster.pack)} canOpenAnother={packCount(collection,booster.pack.id)>0} inspect={inspect}
      browse={()=>{setBooster(null);navigate('cards');}}/>}
    {inspected&&<div className="modal-backdrop collection-modal" onClick={()=>setInspected(null)}><section ref={detailRef} onKeyDown={trapDetailFocus} className="collection-card-detail" role="dialog" aria-modal="true" aria-label={msg("{v0} details", {v0: inspected.name})} onClick={e=>e.stopPropagation()}><button className="collection-close" aria-label={msg("Close card details")} onClick={()=>setInspected(null)} autoFocus><X size={20}/></button><CardDetail card={inspected} animated reduced={props.reduced}><CardPurchase card={inspected} collection={collection} buy={()=>updateCollection(current=>buyCollectionCard(current,inspected))}/>{screen==='builder'&&<button className="gold-button" disabled={!deckCardAvailability(draft.cards,inspected.id,registry,ownedCopies).remaining} onClick={()=>add(inspected.id)}>{msg("Add to deck")}<Plus size={16}/></button>}</CardDetail></section></div>}
  </div>;
}
