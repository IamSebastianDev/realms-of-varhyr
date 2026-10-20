import { Checkbox } from './Checkbox';
import { FactionSelect } from './FactionSelect';
import { BurnEmbers } from './BurnEmbers';
import { subtypeLabel, t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Crown, GraduationCap, Gift, House, Layers, Package, Plus, Search, Settings, Swords, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { factionInfo, registry, setDefinitions, setInfo } from '../../../packages/content/src';
import { boosterPacks, type BoosterPack } from '../../../packages/content/src/boosters';
import type { CardDefinition } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { BoosterOpening, packColor, packLines, packSymbol, type OpenBooster } from './BoosterOpening';
import { ArtCard, cardAbilityDescriptions } from '../../../packages/ui/src/CardPresentation';
import { CardDetail } from '../../../packages/ui/src/CardDetail';
import { OwnershipPips } from './OwnershipPips';
import { addDeckCard, deckCardAvailability, draftKey, parseDeck, removeDeckCard, starterOptions, type CustomDeck } from './decks';
import { buyCollectionBooster, buyCollectionCard, buyMissingDeckCards, collectionRules, missingDeckCopies, missingDeckPurchase, openCollectionBooster, ownedCopyCount, packCount, totalPacks } from './collection';
import { updateCollection, useCollection } from './collectionStore';
import { trackBooster, trackDeckSave, useGoals, externalOf, claimDailyGoal, rerollGoal } from './goalsStore';
import { CardPurchase } from './CardPurchase';
import { CollectionStats } from './CollectionStats';
import { CrownAmount, CrownIcon } from './Crowns';
import { DeckBuilder } from './DeckBuilder';
import { Store } from './Store';
import { Packs } from './Packs';
import { StartPage } from './StartPage';
import { CountBadge } from './CountBadge';
import './nav.css';
import { byOwnership, CardFilterBar, defaultOwnership } from './CardFilters';
import { GameSetup, type SetupMode } from './GameSetup';
import type { MatchSession } from './match/MatchSession';
import { Avatar } from './Avatar';
import { ProfilePage } from './ProfilePage';
import { SettingsPage } from './SettingsPage';
import { useProfile } from './profile';
import { tutorialKey } from './tutorial';
import { builderCards, compareCards, initialBuilderFilters } from './deckTools';

import { QuestPage } from './quest/QuestPage';
import { readRun } from './quest/questStore';
import { DraftPage } from './draft/DraftPage';
import { setActiveDraft } from './draft/draftStore';
import type { MatchSetup } from './session';
import { useAudio } from './AudioExperience';
export type Screen='menu'|'cards'|'builder'|'stats'|'store'|'packs'|'profile'|'settings'|'multiplayer'|'quest'|'draft'|'match';
type Mode='practice'|'hotseat';
type Props={
  reduced:boolean; screen:Exclude<Screen,'match'>; navigate:(screen:Screen)=>void; canResume:boolean; resumeLabel:string;
  decks:CustomDeck[]; options:{id:string;name:string;cards:string[]}[]; saveDeck:(deck:CustomDeck)=>string|null; deleteDeck:(id:string)=>string|null;
  mode:Mode; setMode:(mode:Mode)=>void; selected:string; setSelected:(id:string)=>void;
  opponentId:string; setOpponentId:(id:string)=>void;
  start:(skirmish:boolean)=>void;
  startSession:(session:MatchSession,setup?:MatchSetup)=>void;
  /** Starts the guided first match. */
  learn:()=>void;
  /** Starts a prepared match (quest fights). */
  beginMatch:(setup:MatchSetup)=>void;
  /** A quest fight is open in the background and can be returned to. */
  questFight:boolean;
  /** A draft match is open in the background and can be returned to. */
  draftFight?:boolean;
};
function emptyDeck():CustomDeck{return {id:`custom-${crypto.randomUUID()}`,name:msg("New deck"),cards:[]};}
function readDraft():CustomDeck {
  try{return parseDeck(JSON.parse(localStorage.getItem(draftKey)??'null'),true)??emptyDeck();}catch{return emptyDeck();}
}
export function Lobby(props:Props){
  useLanguage();
  const {screen,canResume}=props;
  const {playEffect}=useAudio();
  // Changing scene in the menu has its own sound; nothing else in the interface does.
  const navigate=(next:Screen)=>{if(next!==screen&&next!=='match')playEffect('ui.scene');props.navigate(next);};
  // New players are offered the tutorial once. Any answer, or having a match under way, settles it.
  const profile=useProfile();
  const [offer,setOffer]=useState(()=>{try{return screen==='menu'&&!canResume&&!localStorage.getItem(tutorialKey);}catch{return false;}});
  function settleOffer(value:string){try{localStorage.setItem(tutorialKey,value);}catch{/* Optional. */}setOffer(false);}
  const [setup,setSetup]=useState<SetupMode|null>(screen==='multiplayer'?'online':null);
  const setupOrigin=useRef<HTMLElement|null>(null);
  const isHome=screen==='menu'||screen==='multiplayer';
  function openSetup(mode:SetupMode){setupOrigin.current=document.activeElement as HTMLElement;if(!isHome)navigate('menu');setSetup(mode);}
  useEffect(()=>{if(!setup){setupOrigin.current?.focus();setupOrigin.current=null;}},[setup]);
  function setSetupMode(mode:SetupMode){setSetup(mode);if(mode==='practice'||mode==='hotseat')props.setMode(mode);}
  useEffect(()=>{if(screen==='multiplayer')setSetup('online');else if(screen!=='menu')setSetup(null);},[screen]);
  const [filters,setFilters]=useState(initialBuilderFilters),[ownership,setOwnership]=useState(defaultOwnership);
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
      if(reward){setBooster({id:crypto.randomUUID(),cards:reward.cards,saved:next.saved,pack});trackBooster(reward.cards.map(card=>card.id));}
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
  useEffect(()=>{setInspected(null);setFilters(initialBuilderFilters);setOwnership(defaultOwnership);},[screen]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key===msg("Escape")){if(inspected)setInspected(null);else if(booster)setBooster(null);else if(setup)setSetup(null);else if(screen!=='menu'&&screen!=='quest'&&screen!=='draft')navigate('menu');}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[inspected,booster,setup,screen,navigate]);
  const matches=useMemo(()=>builderCards(registry,[],filters),[filters]);
  const cards=useMemo(()=>byOwnership(matches,ownedCopies,ownership),[matches,ownedCopies,ownership]);
  const change=(next:CustomDeck)=>{if(JSON.stringify(next)===JSON.stringify(draft))return;const nameOnly=next.id===draft.id&&next.cards===draft.cards;if(!nameOnly||!editingName.current)setPast(list=>[...list.slice(-49),structuredClone(draft)]);editingName.current=nameOnly;setDraft(next);setMessage('');};
  const undo=()=>{const previous=past[past.length-1];if(!previous)return;editingName.current=false;setDraft(previous);setPast(list=>list.slice(0,-1));setMessage(msg("Edit undone."));};
  const add=(id:string)=>change({...draft,cards:addDeckCard(draft.cards,id,registry)});
  const remove=(id:string)=>change({...draft,cards:removeDeckCard(draft.cards,id)});
  function buyMissingCards(){
    try {
      let purchased = 0;
      let cost = 0;
      updateCollection(current => {
        const plan = missingDeckPurchase(draft.cards, current.counts, registry);
        purchased = plan.copies; cost = plan.crowns;
        return buyMissingDeckCards(current, draft.cards, registry);
      });
      if (purchased) setMessage(msg("Added {v0} cards to your collection for {v1} crowns.", { v0: purchased, v1: cost }));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : msg("Could not buy the missing cards.")); }
  }
  function load(id:string){
    const saved=props.decks.find(d=>d.id===id),starter=starterOptions.find(d=>d.id===id);
    if(saved)change({...saved,cards:[...saved.cards]});
    else if(starter)change({...emptyDeck(),name:msg("{v0} (copy)", {v0: starter.name}),cards:[...starter.cards]});
  }
  function save(){const next={...draft,name:draft.name.trim()};const error=props.saveDeck(next);setMessage(error??msg("Saved locally. Your deck is available in Play."));if(!error){editingName.current=false;setDraft(next);trackDeckSave();}return !error;}
  function renameSaved(id:string,name:string){const deck=props.decks.find(d=>d.id===id);if(!deck)return null;const error=props.saveDeck({...deck,name});if(!error&&draft.id===id)setDraft(current=>({...current,name}));return error;}
  function deleteSaved(id:string){const error=props.deleteDeck(id);if(!error&&draft.id===id){setPast([]);setDraft(emptyDeck());}return error;}
  function deleteDraft(){const error=props.deleteDeck(draft.id);if(error){setMessage(error);return;}editingName.current=false;setPast([]);setDraft(emptyDeck());setMessage(msg("Deck deleted."));}
  if(screen==='draft')return <DraftPage reduced={props.reduced} leave={()=>navigate('menu')} liveMatch={!!props.draftFight} resume={()=>navigate('match')} beginFight={props.beginMatch} attachMatch={props.startSession}/>;
  if(screen==='quest')return <QuestPage reduced={props.reduced} leave={()=>navigate('menu')} liveMatch={props.questFight} resume={()=>navigate('match')} beginFight={props.beginMatch}/>;
  return <div className={`lobby ${isHome?'menu-screen':''}`} data-screen={screen}>
    <div className="world-bg"/><div className="world-vignette"/>
    <header className="lobby-header" inert={setup!==null}>
      <button className="brand" onClick={()=>navigate('menu')} aria-label={msg("Main menu")}><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button>
      <nav aria-label={msg("Main navigation")}>
        <button className={isHome?'active':''} onClick={()=>navigate('menu')}><House size={18}/>{msg("Menu")}</button>
        <button className={screen==='cards'||screen==='builder'||screen==='stats'?'active':''} onClick={()=>navigate('builder')}><Layers size={18}/>{msg("Decks")}</button>
        <button className={screen==='packs'?'active':''} aria-label={boostersAvailable>0?`${msg("Packs")}, ${msg("{v0} boosters waiting", {v0: boostersAvailable})}`:undefined} onClick={()=>navigate('packs')}><Package size={18}/>{msg("Packs")}{boostersAvailable>0&&<CountBadge count={boostersAvailable}/>}</button>
        <button className={screen==='store'?'active':''} onClick={()=>navigate('store')}><Gift size={18}/>{msg("Store")}</button>
        <button className={screen==='profile'?'active':''} onClick={()=>navigate('profile')}><User size={18}/>{msg("Profile")}</button>
      </nav>
      <button className="collection-wallet-pill" aria-label={msg("Open store, {v0} crowns, {v1} boosters", {v0: collection.crowns, v1: boostersAvailable})} onClick={()=>navigate('store')}><CrownAmount amount={collection.crowns}/><span className="wallet-pack-count"><Gift size={14}/>{boostersAvailable}</span></button>
      <button className={`lobby-settings ${screen==='settings'?'active':''}`} aria-label={msg("Settings")} title={msg("Settings")} onClick={()=>navigate('settings')}><Settings size={17}/></button>
      {canResume&&<button className="lobby-resume" aria-label={msg("Return to match")} onClick={()=>navigate('match')}><ArrowLeft size={15}/>{msg("Return to match")}</button>}
    </header>
    {isHome?<StartPage inert={setup!==null} collection={collection}
      canResume={canResume} resumeLabel={props.resumeLabel} play={()=>openSetup('practice')} draft={()=>openSetup('draft')}
      resume={()=>navigate('match')} newQuest={()=>{const run=readRun();if(run)navigate('quest');else openSetup('quest');}}/>:screen==='profile'?<ProfilePage/>:screen==='packs'?<Packs collection={collection} reduced={props.reduced} open={openBooster} goToStore={()=>navigate('store')}/>:screen==='settings'?<SettingsPage learn={props.learn} watch={props.startSession}/>:screen==='store'?<Store collection={collection} saved={collectionSaved} message={msg(collectionMessage)} reduced={props.reduced} open={openBooster} buy={buyBooster}/>:screen==='stats'?<CollectionStats collection={collection} inspect={inspect} back={()=>navigate('cards')}/>:screen==='builder'?<DeckBuilder openCollection={()=>navigate('cards')} draft={draft} decks={props.decks} ownedCopies={ownedCopies} crowns={collection.crowns} message={msg(message)} canUndo={!!past.length} reduced={props.reduced} change={change} add={add} remove={remove} load={load} save={save} renameDeck={renameSaved} deleteSaved={deleteSaved} removeDeck={deleteDraft} undo={undo} buyMissing={buyMissingCards} inspect={inspect}/>:<main className="collection-page collection-wide">
      <div className="collection-heading collection-subhead"><button className="builder-icon-button" aria-label={msg("Back to decks")} title={msg("Back to decks")} onClick={()=>navigate('builder')}><ArrowLeft size={16}/></button><h1>{msg("Collection")}</h1><button className="outline-button" onClick={()=>navigate('stats')}><BarChart3 size={15}/>{msg("Statistics")}</button></div>
      <div className="collection-columns"><section className="all-cards-panel" aria-label={msg("All cards")}>{cards.length!==Object.keys(registry.cards).length&&<div className="collection-panel-heading"><span>{cards.length} / {Object.keys(registry.cards).length}</span></div>}
        <div className="builder-collection-bar collection-filterbar"><CardFilterBar filters={filters} setFilters={setFilters} ownership={ownership} setOwnership={setOwnership} count={cards.length} hidden={matches.length-cards.length}/></div>
        {!cards.length&&<p className="collection-empty">{ownership.unowned?msg("No cards match. Try another search or filter."):msg("No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.")}</p>}
        <div className="collection-card-grid">{cards.map(card=><article key={card.id} className={ownedCopyCount(ownedCopies,card.id)>0?undefined:'unowned-card'}><ArtCard card={card} reduced={props.reduced} onClick={()=>inspect(card)}/><div className="collection-card-meta"><span className={`collection-rarity rarity-${card.legendary?'legendary':card.rarity}`}>{msg(card.rarity)}</span><OwnershipPips card={card} owned={ownedCopies}/></div></article>)}</div>
      </section></div>
    </main>}
    {offer&&<div className="modal-backdrop" onClick={()=>settleOffer('skipped')}><section className="choice-dialog tutorial-offer" role="dialog" aria-modal="true" aria-label={msg("Learn to play")} onClick={e=>e.stopPropagation()}><h2>{msg("New to Varhyr?")}</h2><div className="tutorial-offer-actions"><button className="gold-button" autoFocus onClick={()=>{settleOffer('started');props.learn();}}><GraduationCap size={17}/>{msg("Start the tutorial")}</button><button className="outline-button" onClick={()=>settleOffer('skipped')}>{msg("I’ll figure it out")}</button></div></section></div>}
    {setup&&<GameSetup mode={setup} setMode={setSetupMode} close={()=>{setSetup(null);if(screen==='multiplayer')navigate('menu');}}
      options={props.options} selected={props.selected} setSelected={props.setSelected} ownedCopies={ownedCopies}
      opponentId={props.opponentId} setOpponentId={props.setOpponentId}
      start={props.start} startQuest={()=>{setSetup(null);navigate('quest');}} openDraft={preset=>{setActiveDraft(preset);setSetup(null);navigate('draft');}} startSession={props.startSession}/>}
    {booster&&<BoosterOpening key={booster.id} pack={booster} reduced={props.reduced} suspended={!!inspected}
      close={()=>setBooster(null)} openAnother={()=>openBooster(booster.pack)} canOpenAnother={packCount(collection,booster.pack.id)>0} inspect={inspect}
      browse={()=>{setBooster(null);navigate('cards');}}/>}
    {inspected&&<div className="modal-backdrop collection-modal" onClick={()=>setInspected(null)}><section ref={detailRef} onKeyDown={trapDetailFocus} className="collection-card-detail" role="dialog" aria-modal="true" aria-label={msg("{v0} details", {v0: inspected.name})} onClick={e=>e.stopPropagation()}><button className="collection-close" aria-label={msg("Close card details")} onClick={()=>setInspected(null)} autoFocus><X size={20}/></button><CardDetail card={inspected} animated reduced={props.reduced}><CardPurchase card={inspected} collection={collection} buy={()=>updateCollection(current=>buyCollectionCard(current,inspected))}/>{screen==='builder'&&<button className="gold-button" disabled={!deckCardAvailability(draft.cards,inspected.id,registry).remaining} onClick={()=>add(inspected.id)}>{msg("Add to deck")}<Plus size={16}/></button>}</CardDetail></section></div>}
  </div>;
}
