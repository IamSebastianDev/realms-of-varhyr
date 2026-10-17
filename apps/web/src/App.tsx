import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { usePreferences, updatePreferences } from '../../../packages/ui/src/preferences';
import { ResetControls } from './ResetControls';
import { PreferenceControls, VersionLine } from './SettingsPage';
import { CardDetail } from '../../../packages/ui/src/CardDetail';
import { DrawChoice } from './DrawChoice';
import { PilePicker } from './PilePicker';
import { usePhaseAdvance } from './usePhaseAdvance';
import { PhaseTransitionProgress } from './PhaseTransitionProgress';
import { PeekBackdrop } from './Peek';
import { EnergyChoiceArc, type EnergyAction } from './EnergyChoiceArc';
import { BattleLog } from './BattleLog';
import { lazy, type CSSProperties, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, SkipBack, Heart, CircleHelp, Download, Eye, Leaf, RotateCcw, ScrollText, Settings2, Menu, Shield, Sparkles, Swords, X, Zap, Moon, Check, Play, SkipForward, BookOpen, Terminal, Skull, Hand, Maximize, Minimize } from 'lucide-react';
import { deckRules, positionName } from '../../../packages/contracts/src';
import type { CardDefinition, Command, GameState, PlayerId, Pool, PlayerView } from '../../../packages/contracts/src';
import { decisionPlayer, effectiveStats, laneBlocks, other } from '../../../packages/core/src';
import { botCommand } from '../../../packages/core/src/bot';
import { defaultDeckId, factionInfo, registry } from '../../../packages/content/src';
const Board=lazy(()=>import('../../../packages/renderer/src/Board').then(module=>({default:module.Board})));
import type { SlotLayout } from '../../../packages/renderer/src/Board';
import { nextPlayStage, resolveDrop, resolveLaneDrop, type DropZone, type PlayDraft } from './cardInteraction';
import { useCardDrag, type CardDrag } from './useCardDrag';
import { creatureActions, type CreatureAction } from './creatureActions';
import { BoardPositionLabel } from './BoardPositionLabel';
import { CombatArrows } from './CombatArrows';
import { EnergyFlow } from './EnergyFlow';
import { SpellCast } from './SpellCast';
import { combatForecast } from './combatForecast';
import { FactionIcon } from '../../../packages/renderer/src/FactionIcon';
import { factionAuras } from './factionEffects';
import { FactionAbilityEffects } from './FactionAbilityEffects';
import { ClashLayer } from './ClashLayer';
import { arenaForMatch } from './arenas';
import { useMatchPresentation } from './match/useMatchPresentation';
import { Cost, Energy, EnergyOutput, ArtCard, CardFace, CardFacts, CardLore, cardAbilityDescriptions, cardClassification } from '../../../packages/ui/src/CardPresentation';
import { AuthoringLobby } from './AuthoringLobby';
import { Coach } from './Coach';
import { opponentCommand, opponentMoves, opponentNote, playerCommands, scriptFinished, startTutorial, stepAfter, tutorialKey, tutorialSteps } from './tutorial';
import { Lobby, type Screen } from './Lobby';
import { preloadPacks } from './packScene';
import { decksKey, parseDecks, starterOptions, type CustomDeck } from './decks';
import { randomSeed, startMatch, type DeckName, type MatchSetup } from './session';
import { claimVictory, collectionRules, missingDeckCopies } from './collection';
import { updateCollection, useCollection } from './collectionStore';
import { trackMatch } from './goalsStore';
import { CardBackFace } from './CardBackFace';
import { useCardBack } from './cardBackStore';
import { cardBackById } from './cardBacks';
import { matchResult } from './goals';
import { MatchSummary } from './MatchSummary';
import { Avatar } from './Avatar';
import { Onboarding } from './Onboarding';
import { hasAccount } from './onboardingState';
import { getProfile, useProfile } from './profile';
import type { MatchSession } from './match/MatchSession';
import { createLocalMatch, type TutorialScript } from './match/localMatch';
import type { Forecast } from '../../../packages/multiplayer/src/protocol';
import { useMatchSession } from './match/useMatchSession';
import { useFullscreen } from './useFullscreen';
type Mode='practice'|'hotseat';
type Draft=PlayDraft & {activation?:number;target?:string};
type PreviewRequest={pinned?:boolean;cardId:string;left:number;top:number;right:number;bottom:number};
/** A player name that always stays on one line: the type shrinks until it fits its box. */
function FitName({name}:{name:string}) {
  const ref=useRef<HTMLHeadingElement>(null);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const fit=()=>{el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&size>13){size-=1;el.style.fontSize=`${size}px`;}};
    fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();
  },[name]);
  return <h2 ref={ref}>{name}</h2>;
}
function LibraryCount({count,back}:{count:number;back?:string}) {
  useLanguage();
  return <div className={`library-count ${count<=6?'library-low':''} ${back?'has-back':''}`} title={msg("{v0} cards in library. Drawing the last card loses the game.", {v0: count})} aria-label={msg("{v0} cards in library", {v0: count})}>{back?<CardBackFace id={back}/>:<BookOpen size={15}/>}<strong>{count}</strong><small>{msg("LIBRARY")}</small></div>;
}
function HandCount({count}:{count:number}) {
  useLanguage();
  return <div className="library-count hand-count" title={msg("{v0} {v1} in hand", {v0: count, v1: count===1?'card':'cards'})} aria-label={msg("{v0} {v1} in hand", {v0: count, v1: count===1?'card':'cards'})}><Hand size={15}/><strong>{count}</strong><small>{msg("HAND")}</small></div>;
}
function DiscardCount({count,top,onOpen}:{count:number;top?:CardDefinition;onOpen:()=>void}) {
  useLanguage();
  return <button className="discard-count" onClick={onOpen} title={msg("{v0} {v1} in the discard pile. Click to view.", {v0: count, v1: count===1?'card':'cards'})} aria-label={msg("Open discard pile, {v0} cards", {v0: count})}>
    <span className={`discard-top ${top?'':'empty'}`}>{top&&<img src={top.art} alt="" draggable={false}/>}</span><strong>{count}</strong><small>{msg("DISCARD")}</small>
  </button>;
}
type LiveMatch={match:MatchSession;setup?:MatchSetup;script?:TutorialScript};
export function App() {
  useLanguage();
  const {reduced}=usePreferences();
  const [onboarded,setOnboarded]=useState(hasAccount);
  const [live,setLive]=useState<LiveMatch|null>(null);
  const liveRef=useRef(live);liveRef.current=live;
  const replace=(next:LiveMatch|null)=>{liveRef.current?.match.leave();setLive(next);};
  const begin=(setup:MatchSetup)=>{const {session,script}=createLocalMatch(setup,reduced);replace({match:session,setup,script});};
  const attach=(session:MatchSession)=>replace({match:session});
  if(!onboarded)return <Onboarding onDone={()=>setOnboarded(true)}/>;
  if(!live)return <AuthoringLobby onStart={begin} onSessionStart={attach}/>;
  return <MatchApp key={live.match.getSnapshot().matchId} {...live} leave={()=>replace(null)} onBegin={begin} onAttach={attach}/>;
}
function MatchApp({match,setup,script,leave,onBegin,onAttach}: {match:MatchSession;setup?:MatchSetup;script?:TutorialScript;leave:()=>void;onBegin:(setup:MatchSetup)=>void;onAttach:(session:MatchSession)=>void}) {
  useLanguage();
  const {sound,reduced,skipEmptyWindows}=usePreferences();
  const sessionSnapshot=useMatchSession(match);
  const fullscreen=useFullscreen();
  const {initial,commands,state,connection,historySteps,bot}=sessionSnapshot;
  const watching=match.kind==='replay',local=match.kind==='live'&&match.local,online=match.kind==='live'&&!match.local,hotseat=sessionSnapshot.hotseat,mode:Mode=hotseat?'hotseat':'practice';
  const {collection,saved:collectionSaved}=useCollection();
  const rewardId=setup?setup.rewardId:online?sessionSnapshot.matchId:undefined,rewardEligible=setup?setup.rewardEligible!==false:online;
  const [tutorial,setTutorial]=useState(!!setup?.tutorial),[tutorialStep,setTutorialStep]=useState(()=>stepAfter(playerCommands(commands))),[coachNudge,setCoachNudge]=useState(0);
  const collectionOutcome=sessionSnapshot.seat?(state.outcome===sessionSnapshot.seat?'p1':state.outcome==='draw'?'draw':state.outcome?'p2':null):state.outcome;
  useEffect(()=>{updateCollection(current=>claimVictory(current,rewardId,collectionOutcome,rewardEligible));},[rewardId,collectionOutcome,rewardEligible]);
  const deck:DeckName=setup?.deck??defaultDeckId,customDeck=setup?.customDeck,opponentDeck=setup?.opponentDeck;
  // Goals count finished matches you played yourself: not replays, not the tutorial, and in hot seat only the first player.
  useEffect(()=>{if(!state.outcome||watching||setup?.tutorial)return;trackMatch(matchResult(initial,state,commands,sessionSnapshot.seat??'p1',{id:sessionSnapshot.matchId||String(initial.seed),online,deckId:customDeck?.id??deck,registry}));},[state.outcome]);
  const ownBack=useCardBack(!watching&&!hotseat?customDeck?.back:undefined);
  const [screen,setScreen]=useState<Screen>('match');
  useEffect(()=>{preloadPacks();},[]);
  const [savedDecks,setSavedDecks]=useState<CustomDeck[]>(()=>{try{return parseDecks(localStorage.getItem(decksKey));}catch{return [];}});
  const deckOptions=[...starterOptions,...savedDecks,...(customDeck&&!savedDecks.some(d=>d.id===customDeck.id)?[customDeck]:[])];
  const setupPrefs=useMemo<{mode?:Mode;deckId?:string;opponentId?:string}>(()=>{try{const p=JSON.parse(localStorage.getItem('varhir-setup-v1')??'{}');return {mode:p.mode==='practice'||p.mode==='hotseat'?p.mode:undefined,deckId:typeof p.deckId==='string'?p.deckId:undefined,opponentId:typeof p.opponentId==='string'?p.opponentId:undefined};}catch{return {};}},[]);
  const [setupMode,setSetupMode]=useState<Mode>(setupPrefs.mode??mode),[setupDeck,setSetupDeck]=useState<string>(deckOptions.some(d=>d.id===setupPrefs.deckId)?setupPrefs.deckId!:customDeck?.id??deck);
  const [setupOpponent,setSetupOpponent]=useState<string>(()=>setupPrefs.opponentId&&(setupPrefs.opponentId==='auto'||deckOptions.some(d=>d.id===setupPrefs.opponentId))?setupPrefs.opponentId:opponentDeck?.id??'auto');
  const [viewer,setViewer]=useState<PlayerId>(sessionSnapshot.seat??decisionPlayer(state)),[covered,setCovered]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[hovered,setHovered]=useState<string|null>(null),[draft,setDraft]=useState<Draft|null>(null),[stage,setStage]=useState<'none'|'consume'|'position'|'target'>('none');
  const [attackers,setAttackers]=useState<string[]>([]),[lanes,setLanes]=useState<Record<string,number>>({});
  const [mulliganPick,setMulliganPick]=useState<string[]>([]),[drawOther,setDrawOther]=useState<'discard'|'bottom'>('discard'),[logOpen,setLogOpen]=useState(false),[panel,setPanel]=useState<'rules'|'menu'|'settings'|'journal'|'debug'|'discard'|null>(null),[error,setError]=useState('');
  const [confirmConcede,setConfirmConcede]=useState(false);
  useEffect(()=>{if(!local)return;try{localStorage.setItem('varhir-setup-v1',JSON.stringify({mode:setupMode,deckId:setupDeck,opponentId:setupOpponent}));}catch{/* Optional setup preferences. */}},[setupMode,setupDeck,setupOpponent,local]);
  const boardRef=useRef<HTMLDivElement>(null),enemyAvatarRef=useRef<HTMLButtonElement>(null);
  const poolRef=useRef<HTMLDivElement>(null),enemyPoolRef=useRef<HTMLDivElement>(null),previewRef=useRef<HTMLElement>(null);
  const actionPopoverRef=useRef<HTMLDivElement>(null);
  const [actionCard,setActionCard]=useState<string|null>(null);
  const [slotLayout,setSlotLayout]=useState<SlotLayout[]>([]),[previewRequest,setPreviewRequest]=useState<PreviewRequest|null>(null),[preview,setPreview]=useState<PreviewRequest|null>(null);
  const [historyIndex,setHistoryIndex]=useState<number|null>(watching?0:null),[autoplay,setAutoplay]=useState(false);
  const profile=useProfile(),ownArt=!watching&&!hotseat;
  // A portrait id travels with each player; an older match without one still shows your own profile avatar.
  const artFor=(id:PlayerId):string|undefined=>view.players[id].avatar??(id===viewer&&ownArt?profile.avatar:undefined);
  const historyLength=historySteps.length;
  const {clash,setClash,posesRef,energyFlights,setEnergyFlights,spellCasts,setSpellCasts,clashBatches,factionEffects,setFactionEffects,present,stepping}=useMatchPresentation({sound,reduced,covered,slotLayout,viewer,hotseat,initial,screen,historyIndex,boardRef,poolRef,enemyPoolRef});
  const frame=useMemo(()=>match.frame(historyIndex,viewer),[match,sessionSnapshot,historyIndex,viewer]);
  const displayedState=clash?clash.steps[clash.i].state:frame.state;
  const view=useMemo(()=>{
    if(!clash)return frame.view;
    // Animation overlays only public board changes; hands and legal actions keep the received seat's view.
    const base=frame.view,pick=(id:PlayerId)=>({...base.players[id],life:displayedState.players[id].life,board:displayedState.players[id].board,discard:displayedState.players[id].discard,energy:displayedState.players[id].energy});
    return {...base,players:{p1:pick('p1'),p2:pick('p2')},cards:displayedState.cards,combat:displayedState.combat};
  },[frame,displayedState,viewer,clash,match]);
  const ambient=useMemo(()=>{const tally:Record<string,number>={};for(const side of ['p1','p2'] as PlayerId[])for(const id of view.players[side].board)if(id)for(const f of registry.cards[view.cards[id].definitionId]?.factions??[])tally[f]=(tally[f]??0)+1;const top=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0];return factionInfo[top??'']?.color??'#d1bd86';},[view]);
  const arena=useMemo(()=>arenaForMatch(initial,registry),[initial]);
  const [banner,setBanner]=useState<{id:number;text:string;tone:'own'|'enemy'|'combat'}|null>(null),bannerSeen=useRef<{turn:number;active:PlayerId;combat:boolean}|null>(null);
  useEffect(()=>{
    const now={turn:view.turn,active:view.active,combat:!!view.combat};
    const before=bannerSeen.current;bannerSeen.current=now;
    if(!before||screen!=='match'||historyIndex!==null||covered||tutorial||reduced||clash||view.outcome)return;
    let next:{text:string;tone:'own'|'enemy'|'combat'}|null=null;
    if(now.active!==before.active||now.turn!==before.turn)next=now.active===viewer?{text:msg("Your turn"),tone:'own'}:{text:msg("Opponent’s turn"),tone:'enemy'};
    else if(now.combat&&!before.combat&&view.combat?.stage==='declare')next={text:msg("Combat"),tone:'combat'};
    if(!next)return;
    const id=Date.now();setBanner({id,...next});const t=setTimeout(()=>setBanner(b=>b?.id===id?null:b),1500);return()=>clearTimeout(t);
  },[view.turn,view.active,view.combat?.stage]);
  const actor=view.legal.actor,thinking=!!bot?.thinking,botGate=bot?.gate??null;
  const live=screen==='match'&&!watching&&historyIndex===null&&!clash&&!covered&&!thinking&&actor===viewer&&(!online||!!connection?.connected&&!connection.busy);
  // The opponent waits while the screen is busy showing the last move or the player is looking elsewhere.
  const hold=!!clash||covered||historyIndex!==null||screen!=='match';
  useEffect(()=>{if(match.kind==='live')match.setHold(hold);},[match,hold]);
  useEffect(()=>{if(match.kind==='live'&&hotseat)match.setSeat(viewer);},[match,hotseat,viewer]);
  const selectedLegal=view.legal.playable.find(a=>a.cardId===draft?.cardId);
  const undoable=live&&view.phase==='play'?match.undoable(viewer):[];
  const visibleAttacks=view.combat?.stage==='declare'?attackers:view.combat?.attackers??[];
  const draftLanes=useMemo(()=>Object.fromEntries(attackers.map(id=>[id,lanes[id]??displayedState.cards[id]?.slot??0])),[attackers,lanes,displayedState]);
  // What a drafted attack would do is asked of whoever holds the real state, exactly as it is online.
  const [draftForecast,setDraftForecast]=useState<Forecast>(null);
  useEffect(()=>{
    if(match.kind!=='live'||view.combat?.stage!=='declare'||!attackers.length){setDraftForecast(null);return;}
    let stale=false;
    match.forecast({attackers,lanes:draftLanes}).then(next=>{if(!stale)setDraftForecast(next);},()=>{if(!stale)setDraftForecast(null);});
    return()=>{stale=true;};
  },[match,attackers,draftLanes,view.revision,view.combat?.stage]);
  const forecast=view.combat?.stage==='declare'?draftForecast:sessionSnapshot.forecast;
  const selectedActivation=view.legal.activations.find(a=>a.cardId===draft?.cardId&&a.ability===draft?.activation);
  const targets=stage==='target'?(selectedActivation?.targets??selectedLegal?.targets??[]):stage==='consume'?selectedLegal?.consumes??[]:[];
  /** Every session supplies review frames; a single step forward also presents that exchange. */
  const stepTo=useCallback((target:number)=>{
    const next=Math.max(0,Math.min(target,historyLength)),from=Math.min(historyIndex??historyLength,historyLength);
    if(next===from)return;
    if(next===from+1){
      const before=match.frame(from,viewer),after=match.frame(next,viewer),seen=before.view.events.at(-1)?.seq??0;
      stepping.current=true;
      present(before.state,after.state,after.view.events.filter(event=>event.seq>seen),`replay-${next}`);
    }
    setHistoryIndex(next);setSelected(null);
  },[match,sessionSnapshot,historyLength,historyIndex,viewer,present]);
  useEffect(()=>{
    if(!autoplay||historyIndex===null||clash)return;
    if(historyIndex>=historyLength){setAutoplay(false);return;}
    const timer=setTimeout(()=>stepTo(historyIndex+1),reduced?500:1300);return()=>clearTimeout(timer);
  },[autoplay,historyIndex,historyLength,clash,stepTo,reduced]);
  const send=useCallback((command:Command)=>{
    if(screen!=='match'||historyIndex!==null||clash)return;
    if(tutorial&&actor==='p1'){const step=tutorialSteps[tutorialStep];if(!step?.accept||!step.accept(command,state)){setCoachNudge(n=>n+1);return;}}
    if(match.kind==='replay')return;
    try{
      match.act(command);
      if(tutorial&&actor==='p1')setTutorialStep(stepAfter(playerCommands(match.getSnapshot().commands)));
      setActionCard(null);setError('');setDraft(null);setStage('none');setAttackers([]);setLanes({});setSelected(null);setHovered(null);setPreviewRequest(null);
    }catch(cause){setError(cause instanceof Error?cause.message:msg("Could not send the move."));}
  },[state,actor,historyIndex,screen,match,tutorial,tutorialStep,clash]);
  useEffect(()=>{if(hotseat&&actor!==viewer&&!state.outcome)setCovered(true);},[actor,viewer,hotseat,state.outcome]);
  useEffect(()=>{if(sessionSnapshot.error)setError(sessionSnapshot.error);},[sessionSnapshot.error]);
  useEffect(()=>{if(online){setActionCard(null);setDraft(null);setStage('none');setAttackers([]);setLanes({});}},[online,view.revision]);
  const previousSession=useRef(sessionSnapshot),historyRef=useRef<number|null>(null);historyRef.current=historyIndex;
  useEffect(()=>{
    const previous=previousSession.current;previousSession.current=sessionSnapshot;
    if(watching||sessionSnapshot.initial!==previous.initial||sessionSnapshot.revision===previous.revision)return;
    const oldSeq=previous.state.events.at(-1)?.seq??0,newSeq=state.events.at(-1)?.seq??0;
    if(newSeq<oldSeq){setClash(null);setSpellCasts([]);setEnergyFlights([]);setFactionEffects([]);return;}
    if(historyRef.current===null)present(previous.state,state,state.events.filter(event=>event.seq>oldSeq),`session-${sessionSnapshot.revision}`);
  },[sessionSnapshot,state,present,watching]);
  useEffect(()=>{if(error){const t=setTimeout(()=>setError(''),5500);return()=>clearTimeout(t);}},[error]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key===msg("Escape")){setSelected(null);setDraft(null);setStage('none');setPanel(null);setActionCard(null);} };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  function navigate(next:Screen) {
    if(!local&&next!=='match'){leave();return;}
    setScreen(next);setPanel(null);setActionCard(null);setSelected(null);setHovered(null);setPreviewRequest(null);setPreview(null);setDraft(null);setStage('none');setEnergyFlights([]);
  }
  function saveDeck(next:CustomDeck):string|null {
    const decks=[...savedDecks.filter(d=>d.id!==next.id),structuredClone(next)];
    try{localStorage.setItem(decksKey,JSON.stringify(decks));}catch{return msg("Could not save. This browser’s storage is full or unavailable.");}
    setSavedDecks(decks);setSetupDeck(next.id);return null;
  }
  function deleteDeck(id:string):string|null {
    const decks=savedDecks.filter(d=>d.id!==id);
    try{localStorage.setItem(decksKey,JSON.stringify(decks));}catch{return msg("Could not save. This browser’s storage is full or unavailable.");}
    setSavedDecks(decks);if(setupDeck===id)setSetupDeck(defaultDeckId);return null;
  }
  function reset(isSkirmish:boolean,nextMode:Mode=mode,nextDeck:string=customDeck?.id??deck,nextSeed:number=randomSeed(),override?:CustomDeck,nextOpponent:string=setupOpponent) {
    if(!local)return;
    const custom=override??savedDecks.find(d=>d.id===nextDeck)??(customDeck?.id===nextDeck?customDeck:undefined);
    const starter:DeckName=starterOptions.some(d=>d.id===nextDeck)?nextDeck:defaultDeckId;
    const chosen=custom??starterOptions.find(d=>d.id===starter);
    if(chosen&&missingDeckCopies(chosen.cards,collection.counts).length){setError(msg("You do not own enough copies to play this deck."));return;}
    let next:GameState,chosenOpponent;try{chosenOpponent=deckOptions.find(d=>d.id===nextOpponent);next=startMatch(nextSeed,starter,isSkirmish,custom,undefined,chosenOpponent,getProfile().name,nextMode==='hotseat'?undefined:getProfile().avatar);}catch(e){setError(e instanceof Error?e.message:msg("This deck cannot start a match."));return;}
    onBegin({initial:next,mode:nextMode,deck:starter,skirmish:isSkirmish,customDeck:custom?structuredClone(custom):undefined,opponentDeck:chosenOpponent?structuredClone(chosenOpponent):undefined,rewardId:crypto.randomUUID(),rewardEligible:true});
  }
  function startTutorialMatch() {
    if(!local)return;
    try{localStorage.setItem(tutorialKey,'started');}catch{/* Optional. */}
    onBegin(startTutorial());
  }
  function endTutorial(finished:boolean) {
    try{localStorage.setItem(tutorialKey,finished?'done':'skipped');}catch{/* Optional. */}
    if(script)script.active=false;
    setTutorial(false);
  }
  /** Saves what this seat saw, never more: the same file whether the match was local or online. */
  function exportReplay(){if(match.kind==='replay')return;try{const file=match.exportReplay(mode==='hotseat'?viewer:'p1',rewardId??String(initial.seed)),url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`varhyr-replay-${file.matchId.slice(0,8)}.json`;a.click();URL.revokeObjectURL(url);}catch(cause){setError(cause instanceof Error?cause.message:msg("Could not save the replay."));}}
  const placesCard=(cardId:string)=>!!registry.cards[view.cards[cardId].definitionId].cast?.some(b=>registry.abilities[b.id].placement);
  function beginPlay(nextDraft:Draft) {
    setActionCard(null);
    if(nextDraft.activation!==undefined){
      if(nextDraft.target && nextDraft.slot!==undefined)send({type:'activate',cardId:nextDraft.cardId,ability:nextDraft.activation,target:nextDraft.target,slot:nextDraft.slot});
      return;
    }
    const legal=view.legal.playable.find(a=>a.cardId===nextDraft.cardId);if(!legal){setError(msg("Generate the required energy first, and check your free slots."));return;}
    setDraft(nextDraft);
    const nextStage=nextPlayStage(registry.cards[view.cards[nextDraft.cardId].definitionId],legal,nextDraft,placesCard(nextDraft.cardId));
    if(nextStage!=='none'){setStage(nextStage);return;}
    send({type:'play',...nextDraft});
  }
  function inspectBoard(id:string) {
    const card=view.cards[id],slot=slotLayout.find(s=>s.player===card?.controller&&s.slot===card?.slot),rect=boardRef.current?.getBoundingClientRect();
    if(slot&&rect)pinPreview(id,{left:rect.left+slot.x,top:rect.top+slot.y,right:rect.left+slot.x+slot.width,bottom:rect.top+slot.y+slot.height});
  }
  function pinPreview(id:string,rect:Pick<DOMRect,'left'|'top'|'right'|'bottom'>){setActionCard(null);setSelected(id);setPreviewRequest({cardId:id,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,pinned:true});}
  function closePreview(){setSelected(null);setPreviewRequest(null);setPreview(null);}
  /** Giving up is always allowed, even while the opponent is deciding. */
  function concede(){
    if(state.outcome||watching)return;
    try{match.act({type:'concede'},viewer);setConfirmConcede(false);setPanel(null);setError('');}
    catch(cause){setError(cause instanceof Error?cause.message:msg("Could not send the move."));}
  }
  function sendTarget(target:string) {
    if(!draft)return;
    if(draft.activation!==undefined){
      if(selectedActivation?.slots){setPreviewRequest(null);setPreview(null);setDraft({...draft,target});setStage('position');setSelected(target);return;}
      send({type:'activate',cardId:draft.cardId,ability:draft.activation,target});
    }
    else if(placesCard(draft.cardId)&&draft.slot===undefined){setPreviewRequest(null);setPreview(null);setDraft({...draft,target});setStage('position');}
    else send({type:'play',...draft,target});
  }
  function selectBoard(id:string) {
    if(!live||suppressClick())return;
    if(stage==='consume'&&draft&&targets.includes(id)){beginPlay({...draft,consume:id,...(registry.cards[view.cards[draft.cardId].definitionId].type==='spell'?{}:{slot:view.cards[id].slot!})});return;}
    if(stage==='target'&&draft&&targets.includes(id)){sendTarget(id);return;}
    if(stage!=='none')return;
    const actions=creatureActions(view,id,undoable,attackers,draftLanes);
    setPreviewRequest(null);setPreview(null);
    if(actions.length===1){performCreatureAction(id,actions[0]);return;}
    if(actions.length>1){setActionCard(current=>current===id?null:id);setSelected(null);setDraft(null);return;}
    inspectBoard(id);setDraft(null);setStage('none');
  }
  function performCreatureAction(id:string,action:CreatureAction) {
    if(!live||stage!=='none')return;
    setActionCard(null);setPreviewRequest(null);setPreview(null);
    if(action.kind==='channel')send({type:'energy',cardId:id,option:action.option});
    else if(action.kind==='activate'){
      const legal=view.legal.activations.find(a=>a.cardId===id&&a.ability===action.ability);
      if(!legal)return;
      if(action.target)send({type:'activate',cardId:id,ability:action.ability,target:action.target});
      else if(legal.requiresTarget){setDraft({cardId:id,activation:action.ability});setStage('target');setSelected(id);}
      else send({type:'activate',cardId:id,ability:action.ability});
    }
    else if(action.kind==='attack'){setAttackers(a=>a.includes(id)?a:[...a,id]);setLanes(l=>({...l,[id]:action.lane}));setSelected(null);setHovered(null);}
    else if(action.kind==='withdraw'){setAttackers(a=>a.filter(x=>x!==id));setLanes(l=>{const {[id]:_removed,...rest}=l;return rest;});setSelected(null);setHovered(null);}
    else {
      if(tutorial){setCoachNudge(n=>n+1);return;}
      try{match.undoChannel(id,viewer);setEnergyFlights([]);setSelected(null);setHovered(null);setDraft(null);setError('');}
      catch(cause){setError(cause instanceof Error?cause.message:msg("Cannot undo this energy."));}
    }
  }
  useEffect(()=>{setActionCard(null);},[view.revision,viewer,panel,covered,historyIndex]);
  useEffect(()=>{
    if(!actionCard)return;
    const outside=(event:PointerEvent)=>{if(!actionPopoverRef.current?.contains(event.target as Node))setActionCard(null);};
    window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);
  },[actionCard]);
  function hitZone(point:CardDrag):DropZone|null {
    const board=boardRef.current?.getBoundingClientRect();
    if(board){const slot=slotLayout.find(s=>point.x>=board.left+s.x&&point.x<=board.left+s.x+s.width&&point.y>=board.top+s.y&&point.y<=board.top+s.y+s.height);if(slot)return {player:slot.player,slot:slot.slot};}
    const avatar=enemyAvatarRef.current?.getBoundingClientRect();
    if(avatar&&point.x>=avatar.left&&point.x<=avatar.right&&point.y>=avatar.top&&point.y<=avatar.bottom)return {player:other(viewer)};
    return null;
  }
  const dragEnabled=live&&!panel&&!view.pending&&!state.outcome&&stage==='none';
  const {drag,start:startDrag,suppressClick}=useCardDrag(dragEnabled,view.revision,point=>{
    if(view.cards[point.cardId]?.zone==='board'){
      const lane=resolveLaneDrop(view,viewer,point.cardId,hitZone(point),attackers,draftLanes);
      if(lane===null){setError(msg("Drop the attacker on a highlighted lane."));return;}
      setAttackers(a=>a.includes(point.cardId)?a:[...a,point.cardId]);setLanes(l=>({...l,[point.cardId]:lane}));setSelected(null);return;
    }
    const drop=resolveDrop(view,viewer,registry,point.cardId,hitZone(point));
    if(!drop){setError(view.legal.playable.some(a=>a.cardId===point.cardId)?msg("Card returned to hand. Drop onto a highlighted slot or target."):msg("Card returned to hand. Generate matching energy and check the timing first."));return;}
    if(drop.target)send({type:'play',...drop});
    else {setSelected(drop.cardId);beginPlay(drop);}
  },()=>{setActionCard(null);setSelected(null);setHovered(null);setDraft(null);setPreviewRequest(null);setPreview(null);setError('');});
  const dragDef=drag&&view.cards[drag.cardId]?registry.cards[view.cards[drag.cardId].definitionId]:null;
  const dropZone=drag?hitZone(drag):null;
  const dropPlay=drag?resolveDrop(view,viewer,registry,drag.cardId,dropZone):null;
  const draggingAttacker=!!drag&&view.cards[drag.cardId]?.zone==='board';
  const laneAt=(zone:DropZone|null)=>draggingAttacker?resolveLaneDrop(view,viewer,drag!.cardId,zone,attackers,draftLanes):null;
  const dropLane=laneAt(dropZone);
  // While dragging over a legal lane, preview its arrow and blocker before the drop commits it.
  const planAttackers=dropLane!==null&&!attackers.includes(drag!.cardId)?[...attackers,drag!.cardId]:attackers;
  const planLanes=dropLane!==null?{...draftLanes,[drag!.cardId]:dropLane}:draftLanes;
  const visibleLanes=view.combat?.stage==='declare'?planLanes:view.combat?.lanes??{};
  const visibleBlocks=view.combat?.stage==='declare'?laneBlocks(displayedState,[...planAttackers].sort((a,b)=>displayedState.cards[a].slot!-displayedState.cards[b].slot!),planLanes,registry):view.combat?.blocks??[];
  const startAttackDrag=(id:string,event:Parameters<typeof startDrag>[1])=>{if(view.combat?.stage==='declare'&&view.legal.lanes[id])startDrag(id,event);};
  useEffect(()=>{
    setPreview(null);
    if(!previewRequest||actionCard||drag||panel||covered||(view.pending&&view.pending.kind!=='mulligan')||state.outcome)return;
    if(previewRequest.pinned){setPreview(previewRequest);return;}
    const timer=setTimeout(()=>setPreview(previewRequest),420);return()=>clearTimeout(timer);
  },[previewRequest,actionCard,drag,panel,covered,view.pending,state.outcome]);
  useEffect(()=>{setPreviewRequest(null);setPreview(null);},[view.revision,viewer]);
  useEffect(()=>{const clear=(e:KeyboardEvent)=>{if(e.key===msg("Escape")){setPreviewRequest(null);setPreview(null);}};window.addEventListener('keydown',clear);return()=>window.removeEventListener('keydown',clear);},[]);
  useEffect(()=>{
    if(!previewRequest?.pinned)return;
    const outside=(event:PointerEvent)=>{if(event.button!==2&&!previewRef.current?.contains(event.target as Node))closePreview();};
    window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);
  },[previewRequest?.pinned]);
  function clearHoverPreview(){setPreviewRequest(current=>current?.pinned?current:null);}
  function requestPreview(id:string,rect:DOMRect) {if(stage!=='none'||previewRequest?.pinned)return;setPreviewRequest({cardId:id,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom});}
  // Lane names stay hidden until the pointer is over that lane (the column of both rows).
  const [hoverLane,setHoverLane]=useState<number|null>(null);
  const laneAtX=(x:number)=>{const board=boardRef.current?.getBoundingClientRect();if(!board)return null;return slotLayout.find(s=>x>=board.left+s.x&&x<=board.left+s.x+s.width)?.slot??null;};
  function hoverBoard(id:string|null) {
    if(stage!=='none')return;
    setHovered(id);
    if(previewRequest?.pinned)return;
    const card=id?view.cards[id]:null,slot=card?slotLayout.find(s=>s.player===card.controller&&s.slot===card.slot):null,rect=boardRef.current?.getBoundingClientRect();
    if(id&&slot&&rect)setPreviewRequest({cardId:id,left:rect.left+slot.x,top:rect.top+slot.y,right:rect.left+slot.x+slot.width,bottom:rect.top+slot.y+slot.height});
    else setPreviewRequest(null);
  }
  const previewCard=preview&&view.cards[preview.cardId],previewDef=previewCard?registry.cards[previewCard.definitionId]:null;
  const previewStats=previewCard&&previewDef&&previewDef.type!=='spell'?effectiveStats(view,previewCard.id,registry):undefined;
  const previewHeight=Math.min(650,window.innerHeight-24),previewWidth=window.innerWidth>=701?Math.min(600,window.innerWidth-24):Math.min(270,window.innerWidth-24);
  const previewX=preview?Math.max(12,Math.min(window.innerWidth-previewWidth-12,preview.right+14+previewWidth<window.innerWidth?preview.right+14:preview.left-previewWidth-14)):12;
  const previewY=preview?Math.max(12,Math.min(window.innerHeight-previewHeight-12,preview.top)):12;
  const actionInstance=actionCard?view.cards[actionCard]:null;
  const actionSlot=actionInstance?slotLayout.find(s=>s.player===actionInstance.controller&&s.slot===actionInstance.slot):null;
  const boardBounds=boardRef.current?.getBoundingClientRect();
  const availableActions=actionCard?creatureActions(view,actionCard,undoable,attackers,draftLanes):[];
  const useEnergyArc=availableActions.length>1&&availableActions.every(action=>(action.kind==='channel'||action.kind==='activate')&&action.output&&Object.entries(action.output).length===1&&Object.values(action.output)[0]>0);
  const energyAnchor=()=>{const bounds=boardRef.current?.getBoundingClientRect();return actionSlot&&bounds?{left:bounds.left+actionSlot.x,top:bounds.top+actionSlot.y,width:actionSlot.width,height:actionSlot.height}:null;};
  const actionPosition=actionSlot&&boardBounds?{left:Math.max(10,Math.min(window.innerWidth-234,boardBounds.left+actionSlot.x+actionSlot.width/2-112)),top:Math.max(10,Math.min(window.innerHeight-230,boardBounds.top+actionSlot.y+actionSlot.height+10))}:{left:10,top:100};
  const you=view.players[viewer],opponent=view.players[other(viewer)],responseStep=view.combat?.stage==='response'||!!view.responseStep;
  const discardTop=(pile:string[])=>pile.length?registry.cards[view.cards[pile[pile.length-1]]?.definitionId]:undefined;
  const playerName=(name:string)=>name==='You'||name==='Sparring partner'?msg(name):name;
  const laneOccupant=(lane:number)=>{const id=view.players[other(viewer)].board[lane];return id?msg(registry.cards[view.cards[id].definitionId].name):msg("Open · hits player");};
  let prompt=watching?msg("Watching a recorded match."):online&&!live?connection?.connected?connection?.busy?msg("Sending your move…"):msg("Opponent’s turn…"):connection?.message:thinking?botGate?(botGate.type==='confirm-combat'?msg("The opponent’s attack is set. Review the arrows, then resolve combat."):view.phase==='play'?msg("The opponent is ready to attack."):msg("The opponent is done. Begin your turn.")):view.combat?.stage==='review'?msg("Lanes are set. The opponent is reviewing the attack…"):msg("Opponent’s turn…"):stage==='consume'?msg("Choose a friendly creature to Consume."):stage==='position'?msg("Choose a highlighted position. Deployment is permanent."):stage==='target'?selectedActivation?.slots?msg("Choose a creature or holding from your hand to rally."):msg("Choose a highlighted target."):responseStep?msg("The fallen leave energy behind. Cast a spell or close the window."):view.phase==='draw'?msg("Draw two. Keep one."):view.phase==='play'?undoable.length?msg("Click a channelled creature to undo. Drag a card to play."):msg("Click a ready field card for actions. Drag a card to play."):view.combat?.stage==='declare'?attackers.length?msg("Gold arrows hit the player; cyan arrows meet a blocker. Drag an attacker to another lane to change it."):msg("Drag a ready creature onto a highlighted lane, or click it to choose one."):view.combat?.stage==='review'?msg("Defenders in the targeted lanes block automatically. Review the arrows, then confirm combat."):responseStep?msg("The fallen leave energy behind. Cast a spell or close the window."):msg("End your turn to ready your field cards.");
  const factionSymbol=(id:PlayerId)=>{const tally:Record<string,number>={};for(const c of Object.values(state.cards))if(c.owner===id)for(const f of registry.cards[c.definitionId]?.factions??[])tally[f]=(tally[f]??0)+1;const top=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0];return <FactionIcon faction={top??'neutral'}/>;};
  const enemyPhase=view.combat?1:view.phase==='play'?0:2;
  const mainLabel=watching?msg("Replay"):online&&!live?connection?.connected?connection?.busy?msg("Sending…"):msg("Opponent’s turn"):msg("Disconnected"):thinking&&botGate?(botGate.type==='confirm-combat'?msg("Resolve combat"):view.phase==='play'?msg("Enemy combat"):msg("Your turn")):responseStep?msg("Close response step"):view.phase==='play'?msg("Enter combat"):view.combat?.stage==='declare'?attackers.length?msg("Attack with {v0}", {v0: attackers.length}):msg("Skip combat"):view.combat?.stage==='review'?msg("Confirm combat"):responseStep?msg("Close response step"):msg("End turn");
  const phaseIndex=enemyPhase;
  function mainAction(){if(thinking&&botGate){if(match.kind==='live')match.advanceOpponent();return;}if(view.combat?.stage==='declare')send({type:'attack',attackers,lanes:draftLanes});else if(view.combat?.stage==='review')send({type:'confirm-combat'});else send({type:'end'});}
  const advanceEnabled=(live||thinking&&!!botGate&&!covered&&screen==='match')&&!clash&&!view.pending&&!view.outcome&&!panel&&!drag&&!actionCard&&stage==='none';
  const advancePhaseKey=`${rewardId??sessionSnapshot.matchId}:${view.turn}:${view.active}:${view.phase}:${view.combat?.stage??''}:${view.responseStep??''}`;
  const windowKey=`${view.revision}:${view.responseStep??''}`;
  const skippable=skipEmptyWindows&&!!view.responseStep&&view.responseStep===viewer&&view.legal.actor===viewer&&!tutorial&&!view.pending&&!view.outcome&&view.legal.playable.length===0&&live;
  useEffect(()=>{if(!skippable)return;const t=setTimeout(()=>send({type:'end'}),450);return()=>clearTimeout(t);},[skippable,windowKey]);
  const phaseAdvance=usePhaseAdvance({enabled:advanceEnabled,phaseKey:advancePhaseKey},mainAction);
  const transitioning=phaseAdvance.transitionStartedAt!==null;
  if(screen!=='match')return <><Lobby reduced={reduced} screen={screen} navigate={navigate} canResume={!state.outcome} resumeLabel={msg("Turn {v0} · {v1}", {v0: state.turn, v1: state.players.p1.name})} decks={savedDecks} options={deckOptions} saveDeck={saveDeck} deleteDeck={deleteDeck} mode={setupMode} setMode={setSetupMode} selected={setupDeck} setSelected={setSetupDeck} opponentId={setupOpponent} setOpponentId={setSetupOpponent} start={isSkirmish=>reset(isSkirmish,setupMode,setupDeck)} startSession={onAttach} learn={startTutorialMatch}/>{error&&<div className="toast" role="alert">{msg(error)}</div>}</>;
  return <div className={`app ${drag?'is-dragging':''} ${reduced?'reduce-motion':''} ${tutorial?'tutorial-on':''} ${transitioning?'phase-transitioning':''}`} style={{'--arena-image':`url("${arena.art}")`} as CSSProperties}>
    <div className="world-bg"/><div className="world-vignette"/>
    <header className="topbar"><button className="brand" aria-label={msg("Realms of Varhyr home")} onClick={()=>navigate('menu')}><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button><div className="match-status" aria-label={msg("Turn {v0}, {v1} initiative", {v0: view.turn, v1: view.active===viewer?'your':'opponent’s'})}><span>{msg("Turn")}{' '}{view.turn}</span><i/><strong>{online&&actor!==viewer?msg("Opponent’s turn"):thinking?msg("Opponent’s turn"):view.combat?.stage==='review'?msg("Review combat"):responseStep?msg("Response energy"):view.phase==='play'?msg("Play & channel"):view.phase==='attack'?msg("Select attackers"):view.phase==='draw'?msg("Choose a card"):msg("End turn")}</strong></div><div className="match-corner"><button aria-pressed={logOpen} onClick={()=>setLogOpen(open=>!open)} aria-label={logOpen?msg("Hide battle log"):msg("Show battle log")} title={logOpen?msg("Hide battle log"):msg("Show battle log")}><ScrollText size={17}/></button><button onClick={()=>setPanel('menu')} aria-label={msg("Match menu")}><Menu size={18}/></button></div></header>
    {online&&!watching&&<div className={`online-connection-strip ${connection?.connected?'connected':'offline'}`} role="status"><span className="online-status-dot"/><span>{msg("Room")}{' '}{connection?.code} · {connection?.connected?connection?.busy?msg("Sending move…"):msg("Connected"):connection?.message}</span>{!connection?.connected&&<button onClick={()=>match.kind==='live'&&match.reconnect()}>{msg("Reconnect")}</button>}</div>}
    <main className={`arena-shell ${logOpen?'with-log':''}`}>
      <section className="battlefield">
        <div className={`player-banner opponent ${targets.includes(other(viewer))||drag&&resolveDrop(view,viewer,registry,drag.cardId,{player:other(viewer)})?'targetable':''}`}>
          <div className="player-id"><div className="portrait"><button ref={enemyAvatarRef} className={`avatar enemy-avatar ${artFor(other(viewer))?'has-art':''}`} aria-label={msg("Target opponent")} disabled={!live||!targets.includes(other(viewer))&&!(drag&&resolveDrop(view,viewer,registry,drag.cardId,{player:other(viewer)}))} onClick={()=>sendTarget(other(viewer))}>{artFor(other(viewer))?<Avatar id={artFor(other(viewer))!}/>:factionSymbol(other(viewer))}</button><div className="life-counter"><Heart size={11} aria-hidden="true"/><strong>{opponent.life}</strong><small>{msg("LIFE")}</small></div></div>
          <div className="player-name"><FitName name={playerName(opponent.name)}/></div>
          <div ref={enemyPoolRef} title={msg("Energy pool")} className={`energy-meter opponent-pool ${responseStep&&view.active===viewer?'response-pool':''} ${energyFlights.some(f=>f.player===other(viewer))?'receiving-energy':''}`}><Zap className="pool-icon" size={17}/>{responseStep&&view.active===viewer&&<span className="eyebrow">{msg("RESPONSE ENERGY")}</span>}<Energy pool={responseStep&&view.active===viewer?opponent.responseEnergy:opponent.energy}/></div><div className="player-meta"><span title={msg("Cards in hand")}><BookOpen size={13}/>{opponent.handCount}</span><span title={msg("Cards in deck")}><LayersIcon/>{opponent.deckCount}</span></div></div><div className="piles"><HandCount count={opponent.handCount}/><LibraryCount count={opponent.deckCount} back={cardBackById(opponent.cardBack).id}/><DiscardCount count={opponent.discard.length} top={discardTop(opponent.discard)} onOpen={()=>setPanel('discard')}/></div>
        </div>
        <div ref={boardRef} className="board-scene" style={{'--ambient':ambient} as CSSProperties} onPointerMove={e=>{if(!drag){const lane=laneAtX(e.clientX);setHoverLane(current=>current===lane?current:lane);}}} onPointerLeave={()=>setHoverLane(null)}>

          <div className="lane-bands" aria-hidden="true">{view.players[viewer].board.map((_,lane)=>{const s=slotLayout.find(x=>x.player===viewer&&x.slot===lane);if(!s)return null;const hot=(drag?laneAtX(drag.x):hoverLane)===lane;return <i key={lane} className={`${lane%2?'odd':''} ${hot?'hot':''}`} style={{left:s.x-12,width:s.width+24}}/>;})}</div>
          <div className="board-mist" aria-hidden="true"><i/><i/><i/></div>
          <Suspense fallback={<div className="board-loading">{msg("The sanctum is taking shape…")}</div>}><Board view={view} viewer={viewer} registry={registry} selected={selected} placementSlots={stage==='position'?selectedActivation?.slots??selectedLegal?.slots:undefined} attacks={visibleAttacks} blocks={visibleBlocks} targets={targets} onSelect={selectBoard} onInspect={inspectBoard} onSlot={slot=>{if(live&&draft&&stage==='position'&&(draft.activation!==undefined||registry.cards[view.cards[draft.cardId].definitionId].type!=='spell'))beginPlay({...draft,slot});}} onHover={hoverBoard} onDragStart={startAttackDrag} onLayout={setSlotLayout} reduced={reduced} poses={posesRef} ambient={ambient}/></Suspense>
          {banner&&<div key={banner.id} className={`turn-banner ${banner.tone}`} aria-hidden="true"><span>{banner.text}</span></div>}
          <div className="board-card-labels" aria-hidden="true">{slotLayout.map(slot=>{
            const id=view.players[slot.player].board[slot.slot],card=id?view.cards[id]:null,def=card?registry.cards[card.definitionId]:null,stats=id?effectiveStats(view,id,registry):null;
            const legal=drag?resolveDrop(view,viewer,registry,drag.cardId,{player:slot.player,slot:slot.slot}):null;
            const laneLegal=laneAt({player:slot.player,slot:slot.slot})!==null;
            const positionChoice=live&&stage==='position'&&slot.player===viewer&&(selectedActivation?.slots??selectedLegal?.slots)?.includes(slot.slot);
            const attackIndex=id?visibleAttacks.indexOf(id):-1,block=visibleBlocks.find(b=>b.blocker===id),blockIndex=block?visibleAttacks.indexOf(block.attacker):-1;
            const canUndo=!!id&&undoable.includes(id);
            const canChannel=!!id&&view.legal.energy.some(a=>a.cardId===id);
            const canActivate=!!id&&view.legal.activations.some(a=>a.cardId===id);
            const over=(!!dropPlay||dropLane!==null)&&dropZone?.player===slot.player&&dropZone.slot===slot.slot;
            return <div key={`${slot.player}-${slot.slot}`} data-battlefield-slot={`${slot.player}-${slot.slot}`} className={`board-card-label ${def?.legendary?'is-legendary':''} ${attackIndex>=0?'is-attacker':''} ${block?'is-blocker':''} ${canUndo?'is-channelled':''} ${card?.exhausted?'is-exhausted':''} ${legal||laneLegal||positionChoice?'drop-legal':''} ${over?'drop-over':''}`} style={{left:slot.x,top:slot.y,width:slot.width,height:slot.height}}>
              {def&&card&&stats&&<><div className={`art-card card-face-overlay ${def.legendary?'legendary-card':''} ${def.type==='holding'?'holding-card':''}`}><CardFace card={def} stats={{attack:stats.attack,defense:Math.max(0,stats.defense-card.damage)}} showCost={false}/></div>{attackIndex>=0?<span className="combat-role attacker-role" title={msg("Attacker {v0}", {v0: attackIndex+1})}><Swords/>{msg("Attack")}{' '}{attackIndex+1}</span>:block?<span className="combat-role blocker-role" title={msg("Blocks attacker {v0}", {v0: blockIndex+1})}><Shield/>{msg("Blocks")}{' '}{blockIndex+1}</span>:canUndo?<span className="board-status undo-status" title={msg("Exhausted · click to undo channeling")}><RotateCcw/></span>:canChannel?<span className="board-status ready-status" title={canActivate?msg("Ready · click to choose an action"):msg("Ready · click to channel energy")}><Check/></span>:canActivate?<span className="board-status ready-status" title={msg("Ready · click to activate")}><Sparkles/></span>:card.exhausted&&<span className="board-status exhausted-status" title={msg("Exhausted · can still block")}><Moon/><span>{msg("Exhausted")}</span></span>}</>}
              {laneLegal&&<span className="drop-label">{id?msg("Attack"):msg("Open lane")}</span>}
              {legal&&<span className="drop-label">{legal.consume?msg("Consume"):dragDef?.type==='spell'?legal.target?msg("Target"):msg("Cast"):msg("Deploy")}</span>}
            </div>;
          })}</div>
          <CombatArrows view={view} slots={slotLayout} lanes={clash||view.combat?.stage==='response'?{}:visibleLanes} blocks={visibleBlocks} registry={registry}/>
          <div className="lane-labels" aria-hidden="true">{view.players[viewer].board.map((_,lane)=>{
            const top=slotLayout.find(s=>s.player===other(viewer)&&s.slot===lane),bottom=slotLayout.find(s=>s.player===viewer&&s.slot===lane);
            if(!top||!bottom)return null;
            const under=(drag?laneAtX(drag.x):hoverLane)===lane;
            // Lanes you could drop on keep their name so the target is clear.
            const droppable=draggingAttacker?laneAt({player:other(viewer),slot:lane})!==null:!!drag&&dragDef?.type!=='spell'&&!!resolveDrop(view,viewer,registry,drag.cardId,{player:viewer,slot:lane});
            const choosing=stage==='position'&&!!(selectedActivation?.slots??selectedLegal?.slots)?.includes(lane);
            return <div key={lane} className={`lane-label ${under||droppable||choosing?'shown':''}`} style={{left:bottom.x,width:bottom.width,top:"50%"}}><BoardPositionLabel slot={lane}/></div>;
          })}</div>
          <div className="board-divider"><i/><span>✦</span><i/></div>
          <div className="board-key-row enemy-keys">{opponent.board.map((id,i)=><button key={i} onFocus={()=>id&&hoverBoard(id)} onBlur={()=>hoverBoard(null)} onContextMenu={e=>{e.preventDefault();if(id)inspectBoard(id);}} onClick={e=>id&&(e.shiftKey?inspectBoard(id):selectBoard(id))} disabled={!id||!live} aria-label={msg("Opponent {v0}: {v1}", {v0: positionName(i), v1: id?registry.cards[view.cards[id].definitionId].name:'empty'})} title={msg("{v0} · {v1}", {v0: positionName(i), v1: id?registry.cards[view.cards[id].definitionId].name:'Empty position'})}>{i+1}</button>)}</div>
          <div className="board-key-row own-keys">{you.board.map((id,i)=><button key={i} onFocus={()=>id&&hoverBoard(id)} onBlur={()=>hoverBoard(null)} onContextMenu={e=>{e.preventDefault();if(id)inspectBoard(id);}} onClick={e=>id?(e.shiftKey?inspectBoard(id):selectBoard(id)):draft&&live&&beginPlay({...draft,slot:i})} disabled={!live||!id&&(!draft||stage!=='position'||!(selectedActivation?.slots??selectedLegal?.slots)?.includes(i))} aria-label={msg("Your {v0}: {v1}", {v0: positionName(i), v1: id?registry.cards[view.cards[id].definitionId].name:'empty'})} title={msg("{v0} · {v1}", {v0: positionName(i), v1: id?registry.cards[view.cards[id].definitionId].name:'Deploy here'})}>{i+1}</button>)}</div>

        </div>
        <div className="player-banner own"><div className="player-id"><div className="portrait"><div className={`avatar ${artFor(viewer)?'has-art':''}`}>{artFor(viewer)?<Avatar id={artFor(viewer)!}/>:factionSymbol(viewer)}</div><div className="life-counter"><Heart size={11} aria-hidden="true"/><strong>{you.life}</strong><small>{msg("LIFE")}</small></div></div><div className="player-name">{hotseat&&viewer!=='p1'&&<span className="eyebrow">{msg("PLAYER TWO")}</span>}<FitName name={playerName(you.name)}/></div><div ref={poolRef} title={msg("Energy pool")} className={`energy-meter ${responseStep&&view.active!==viewer?'response-pool':''} ${energyFlights.some(f=>f.player===viewer)?'receiving-energy':''}`}><Zap className="pool-icon" size={20}/>{responseStep&&view.active!==viewer&&<span className="eyebrow">{msg("RESPONSE ENERGY")}</span>}<Energy pool={responseStep&&view.active!==viewer?you.responseEnergy:you.energy}/></div><div className="player-meta"><span title={msg("Deck")}><LayersIcon/>{you.deckCount}</span></div></div><div className="piles"><HandCount count={you.handCount}/><LibraryCount count={you.deckCount} back={ownBack}/><DiscardCount count={you.discard.length} top={discardTop(you.discard)} onOpen={()=>setPanel('discard')}/></div></div>
        <div className="floating-action"><div className="action-guidance"><p id="turn-guidance" role="status">{msg(prompt??'')}</p>{stage!=='none'&&<button className="outline-button" onClick={()=>{setDraft(null);setStage('none');setSelected(null);setPreviewRequest(null);setPreview(null);}}>{msg("Cancel")}</button>}{forecast&&(!thinking||view.combat?.stage==='review')&&<span className="combat-forecast" aria-label={msg("{v0} blocked, {v1} defenders and {v2} attackers lost, {v3} life damage", {v0: forecast.blocked, v1: forecast.fallen, v2: forecast.attackersFallen, v3: forecast.lifeDamage})}>{(()=>{const mine=view.active===viewer,lostOwn=mine?forecast.attackersFallen:forecast.fallen,lostFoe=mine?forecast.fallen:forecast.attackersFallen;return <>
          {forecast.blocked>0&&<i title={msg("Blocked attackers")}><Shield size={12}/>{forecast.blocked}</i>}
          {lostFoe>0&&<i className="good" title={msg("Enemy cards destroyed")}><Skull size={12}/>{lostFoe}</i>}
          {lostOwn>0&&<i className="bad" title={msg("Your cards destroyed")}><Skull size={12}/>{lostOwn}</i>}
          {forecast.lifeDamage>0&&<i className={mine?'good':'bad'} title={msg("Life damage")}><Heart size={12}/>−{forecast.lifeDamage}</i>}
        </>;})()}</span>}</div><button ref={phaseAdvance.buttonRef} className={`gold-button primary-action ${thinking?'is-enemy':''} ${transitioning?'is-transitioning':''}`} title={msg("{v0} (Space)", {v0: mainLabel})} aria-describedby={advanceEnabled?"turn-guidance phase-shortcut-hint":"turn-guidance"} aria-keyshortcuts="Space" aria-busy={transitioning||undefined} disabled={!advanceEnabled||transitioning} onClick={phaseAdvance.click}><span className="phase-orbit" aria-hidden>{[Sparkles,Swords,Moon].map((Icon,n)=><i key={n} className={`phase-bauble ${n===phaseIndex?'is-now':n<phaseIndex?'is-done':''}`} style={{['--a' as string]:`${-150+n*60}deg`}}><Icon size={13} strokeWidth={2.2}/></i>)}</span>{thinking&&!botGate?<><span className="thinking-dots">···</span>{msg("Opponent’s turn")}</>:<><span className="phase-button-label">{mainLabel}<small id="phase-shortcut-hint">{transitioning?msg("Changing phase…"):msg("Space")}</small></span><ArrowRight size={17}/></>}{phaseAdvance.transitionStartedAt!==null&&<PhaseTransitionProgress startedAt={phaseAdvance.transitionStartedAt}/>}</button></div>

      </section>
      {logOpen&&<BattleLog events={view.events} cards={view.cards} viewer={viewer} onClose={()=>setLogOpen(false)}/>}
    </main>
    <section className="hand-zone">{stage!=='none'&&<div className="hand-caption"><p>{stage==='consume'?msg("Choose what to Consume"):stage==='position'?msg("Choose your position"):msg("Choose your target")}</p></div>}<div className="hand-scroll" style={{['--n' as string]:view.hand.length}}>{view.hand.map((id,i)=><ArtCard detail={false} reduced={reduced} key={id} card={registry.cards[view.cards[id].definitionId]} selected={selected===id} disabled={!targets.includes(id)&&!view.legal.playable.some(a=>a.cardId===id)} className={`hand-card ${targets.includes(id)?'rally-target':''} ${drag?.cardId===id?'drag-source':''} ${dragEnabled&&view.legal.playable.some(a=>a.cardId===id)?'draggable':''}`} interaction={{id:`hand-${id}`,onContextMenu:e=>{e.preventDefault();pinPreview(id,e.currentTarget.getBoundingClientRect());},onPointerDown:e=>startDrag(id,e),onPointerEnter:e=>{if(e.pointerType!=='touch'&&!drag)requestPreview(id,e.currentTarget.getBoundingClientRect());},onPointerLeave:clearHoverPreview,onFocus:e=>requestPreview(id,e.currentTarget.getBoundingClientRect()),onBlur:clearHoverPreview}} onClick={()=>{if(!live||suppressClick())return;if(stage==='target'&&targets.includes(id)){sendTarget(id);return;}if(stage!=='none')return;pinPreview(id,document.getElementById(`hand-${id}`)!.getBoundingClientRect());setDraft(null);setStage('none');}}/>)}{!view.hand.length&&<div className="empty-hand">{msg("No cards in hand")}</div>}</div></section>

    {error&&<div className="toast" role="alert">{msg(error)}<button aria-label={msg("Dismiss error")} onClick={()=>setError('')}><X size={14}/></button></div>}
    {historyIndex!==null&&<div className={`replay-bar ${watching?'watching':''}`}><Eye size={16}/><span>{watching?msg("Replay"):msg("Viewing")} {msg("· step")}{' '}{historyIndex} {msg("of")}{' '}{historyLength}</span>
      {watching&&<span className="replay-controls"><button aria-label={msg("First step")} disabled={historyIndex===0} onClick={()=>{setAutoplay(false);stepTo(0);}}><SkipBack size={14}/></button><button aria-label={msg("Previous step")} disabled={historyIndex===0} onClick={()=>{setAutoplay(false);stepTo(historyIndex-1);}}><ChevronLeft size={15}/></button><button className="replay-play" aria-label={autoplay?msg("Pause"):msg("Play")} onClick={()=>{if(historyIndex>=historyLength)stepTo(0);setAutoplay(a=>!a);}}>{autoplay?<Pause size={14}/>:<Play size={14}/>}</button><button aria-label={msg("Next step")} disabled={historyIndex>=historyLength} onClick={()=>{setAutoplay(false);stepTo(historyIndex+1);}}><ChevronRight size={15}/></button><button aria-label={msg("Last step")} disabled={historyIndex>=historyLength} onClick={()=>{setAutoplay(false);stepTo(historyLength);}}><SkipForward size={14}/></button></span>}
      {watching?<button onClick={()=>leave()}>{msg("Close replay")}<X size={13}/></button>:<button onClick={()=>setHistoryIndex(null)}>{msg("Return to live match")}<Play size={13}/></button>}</div>}
    {covered&&<div className="modal-backdrop privacy"><div className="privacy-card"><span className="brand-mark">V</span><h2>{playerName(state.players[actor].name)}</h2>{state.combat?.stage==='review'?<p>{msg("Review the lanes and blockers, then confirm combat.")}</p>:state.combat?.stage==='response'?<p>{msg("Spend your fallen creatures’ energy.")}</p>:null}<button className="gold-button" onClick={()=>{setViewer(actor);setCovered(false);setSelected(null);setHovered(null);}}>{msg("Reveal my hand")}<Eye size={16}/></button></div></div>}
    {!watching&&view.pending?.kind==='mulligan'&&!covered&&!thinking&&<PeekBackdrop back={msg("Back to your hand")}><div className="choice-dialog mulligan-dialog"><h2>{msg("Replace up to")}{' '}{view.pending.max} {msg("cards")}</h2><div className="choice-options mulligan-options">{view.pending.options.map(id=>{const picked=mulliganPick.includes(id),full=!picked&&mulliganPick.length>=(view.pending as {max:number}).max;return <div key={id} className={`mulligan-card ${picked?'picked':''} ${full?'locked':''}`}><ArtCard detail={false} reduced={reduced} card={registry.cards[view.cards[id].definitionId]} interaction={{id:`mull-${id}`,onPointerEnter:e=>{if(e.pointerType!=='touch')requestPreview(id,e.currentTarget.getBoundingClientRect());},onPointerLeave:clearHoverPreview,onFocus:e=>requestPreview(id,e.currentTarget.getBoundingClientRect()),onBlur:clearHoverPreview,onContextMenu:e=>{e.preventDefault();pinPreview(id,e.currentTarget.getBoundingClientRect());}}} onClick={()=>setMulliganPick(list=>picked?list.filter(x=>x!==id):full?list:[...list,id])}/><span className="mulligan-mark">{picked?msg("Replace"):msg("Keep")}</span></div>;})}</div><button className="gold-button mulligan-confirm" disabled={!!online&&!live} onClick={()=>{const cardIds=mulliganPick;setMulliganPick([]);send({type:'mulligan',cardIds});}}>{mulliganPick.length?msg("Replace {v0} {v1}", {v0: mulliganPick.length, v1: mulliganPick.length===1?'card':'cards'}):msg("Keep this hand")}<ArrowRight size={14}/></button></div></PeekBackdrop>}
    {live&&stage==='target'&&!covered&&targets.length>0&&view.cards[targets[0]]?.zone==='discard'&&<PilePicker reduced={reduced} title={msg("Choose a creature to raise")} cards={targets.map(id=>({id,card:registry.cards[view.cards[id].definitionId]}))} choose={sendTarget} cancel={()=>{setDraft(null);setStage('none');setSelected(null);}}/>}
    {!watching&&view.pending?.kind==='draw'&&!covered&&!thinking&&<DrawChoice reduced={reduced} cards={(view.pending.options as string[]).map(id=>({id,card:registry.cards[view.cards[id].definitionId]}))} discardCount={you.discard.length} discardTop={discardTop(you.discard)} libraryCount={you.deckCount} choose={(keep,other)=>send({type:'choose',choiceId:view.pending!.id,option:keep,other})}/>}
    {view.pending&&view.pending.kind==='response-energy'&&!covered&&!thinking&&<PeekBackdrop back={msg("Back to the choice")}><div className="choice-dialog"><h2>{msg(view.pending.sourceName)}{msg(": choose its energy")}</h2><div className="choice-options">{view.pending.options.map((pool,i)=><button className="energy-choice" key={i} onClick={()=>send({type:'choose',choiceId:view.pending!.id,option:i})}><Energy pool={pool}/><span>{msg("Choose this output")}<ArrowRight size={14}/></span></button>)}</div></div></PeekBackdrop>}
    {state.outcome&&!clash&&!covered&&(historyIndex===null||watching&&historyIndex>=historyLength)&&<MatchSummary state={state} viewer={viewer} registry={registry} reduced={reduced} symbol={factionSymbol(viewer)} reward={!watching&&(hotseat?state.outcome==='p1':state.outcome===viewer)&&rewardId&&collection.rewardedMatches.includes(rewardId)?{crowns:collectionRules.victoryCrowns,boosters:collectionRules.victoryBoosters,saved:collectionSaved}:null} onMenu={()=>navigate('menu')} onAgain={local?()=>reset(false):undefined} onExport={watching?undefined:exportReplay} reviewLabel={watching?msg("Watch again"):undefined} onReview={watching?()=>{setHistoryIndex(0);}:()=>{setHistoryIndex(historyLength);setPanel('debug');}}/>}
    {actionCard&&actionInstance&&live&&!covered&&!panel&&useEnergyArc&&<EnergyChoiceArc cardName={msg(registry.cards[actionInstance.definitionId].name)} actions={availableActions as EnergyAction[]} getAnchor={energyAnchor} containerRef={actionPopoverRef} reduced={reduced} onClose={()=>setActionCard(null)} onChoose={action=>performCreatureAction(actionCard,action)} actionName={action=>action.kind==='channel'?msg("Channel"):cardAbilityDescriptions(registry.cards[actionInstance.definitionId])[action.ability].name}/>}
    {actionCard&&actionInstance&&live&&!covered&&!panel&&!useEnergyArc&&<div ref={actionPopoverRef} className="creature-actions" role="dialog" aria-label={msg("{v0} actions", {v0: registry.cards[actionInstance.definitionId].name})} style={{...actionPosition,maxHeight:window.innerHeight-actionPosition.top-12}}><div className="creature-actions-heading"><span>{msg(registry.cards[actionInstance.definitionId].name)}</span><button aria-label={msg("Close card actions")} onClick={()=>setActionCard(null)}><X size={14}/></button></div>{availableActions.map((action,i)=><button autoFocus={i===0} key={i} className="inline-creature-action" onClick={()=>performCreatureAction(actionCard,action)}>{action.kind==='channel'?<><Zap size={15}/><span>{msg("Channel")}</span><Energy pool={action.output}/></>:action.kind==='activate'?<><Sparkles size={15}/><span>{cardAbilityDescriptions(registry.cards[actionInstance.definitionId])[action.ability].name}</span>{action.output&&<Energy pool={action.output}/>}</>:action.kind==='undo-channel'?<><RotateCcw size={15}/>{msg("Undo channel")}</>:action.kind==='attack'?<><Swords size={15}/><span>{action.current?msg("Attacking"):msg("Attack")} · {msg(positionName(action.lane)??'')}</span><small>{laneOccupant(action.lane)}</small></>:<><RotateCcw size={15}/>{msg("Withdraw attack")}</>}</button>)}<button className="inline-inspect-action" onClick={()=>inspectBoard(actionCard)}><Eye size={13}/>{msg("Inspect card")}</button><small>{view.combat?.stage==='declare'?msg("Choose a lane to attack."):msg("Choose an action.")}</small></div>}
    {drag&&dragDef&&<div className="drag-ghost" style={{left:drag.x,top:drag.y}}><ArtCard detail={false} card={dragDef} className="drag-card"/><span className={dropPlay||dropLane!==null?'valid':''}>{draggingAttacker?dropLane!==null?msg("Release to attack this lane"):msg("Choose a highlighted lane"):dropPlay?dropPlay.consume?msg("Release to Consume"):dropPlay.target||dragDef.type==='spell'?msg("Release to cast"):msg("Release to deploy"):view.legal.playable.some(a=>a.cardId===drag.cardId)?msg("Choose a highlighted slot or target"):msg("Needs energy or legal timing")}</span></div>}
    {preview&&previewCard&&previewDef&&!actionCard&&!drag&&!panel&&!covered&&(!view.pending||view.pending.kind==='mulligan')&&!state.outcome&&<div className="preview-anchor" aria-hidden style={{left:preview.left,top:preview.top,width:preview.right-preview.left,height:preview.bottom-preview.top}}/>}
    {preview&&previewCard&&previewDef&&!actionCard&&!drag&&!panel&&!covered&&(!view.pending||view.pending.kind==='mulligan')&&!state.outcome&&<aside ref={previewRef} className={`hover-preview ${preview.pinned?'pinned-preview':''}`} role={preview.pinned?'dialog':'tooltip'} aria-label={msg("{v0} preview", {v0: previewDef.name})} style={{['--px' as string]:`${previewX}px`,['--py' as string]:`${previewY}px`,width:previewWidth,maxHeight:previewHeight}}>{preview.pinned&&<button className="preview-close" aria-label={msg("Close card preview")} onClick={closePreview}><X size={16}/></button>}<CardDetail card={previewDef} animated reduced={reduced} stats={previewStats?{...previewStats,defense:previewStats.defense-previewCard.damage}:undefined} state={previewCard.zone==='board'?<>{msg(positionName(previewCard.slot)??'')} · {previewCard.exhausted?msg("Exhausted · can still block"):previewDef.type==='holding'?msg("Ready · can block{v0}", {v0: previewDef.abilities.some(b=>registry.abilities[b.id].activate)?' or activate':''}):msg("Ready to channel or attack{v0}", {v0: previewDef.abilities.some(b=>registry.abilities[b.id].activate)?' · can activate':''})}{previewCard.damage>0?msg(" · {v0} damage", {v0: previewCard.damage}):''}</>:undefined}></CardDetail></aside>}
    {(()=>{
      if(!tutorial||screen!=='match'||covered||state.outcome||historyIndex!==null)return null;
      const step=tutorialSteps[tutorialStep],progress={index:tutorialStep,total:tutorialSteps.length};
      if(actor==='p2'&&step.id!=='finish'){
        if(scriptFinished(opponentMoves(commands)))return null;
        const note=opponentNote(opponentMoves(commands));
        return <Coach tone="opponent" title={note.title} text={note.text} progress={progress} focus={botGate?['.primary-action']:[]} nudge={coachNudge} onSkip={()=>endTutorial(false)}/>;
      }
      const finish=step.id==='finish';
      return <Coach tone={finish?'finish':'player'} title={step.title} text={step.text} progress={progress} focus={step.focus?.(state)??[]} nudge={coachNudge} next={step.next} onNext={()=>finish?endTutorial(true):setTutorialStep(i=>i+1)} secondary={finish?msg("Main menu"):undefined} onSecondary={()=>{endTutorial(true);navigate('menu');}} onSkip={()=>endTutorial(false)}/>;
    })()}
    {!covered&&!panel&&!view.outcome&&<FactionAbilityEffects auras={clash?[]:factionAuras(view,registry)} bursts={factionEffects} board={boardRef.current} slots={slotLayout} viewer={viewer} reduced={reduced}/>}
    <EnergyFlow flights={energyFlights}/><SpellCast casts={spellCasts}/><ClashLayer batches={clashBatches} board={boardRef.current} slots={slotLayout} viewer={viewer} onSkip={clash?()=>setClash(null):undefined}/>
    {panel==='menu'&&<div className="modal-backdrop" onClick={()=>setPanel(null)}><section className="choice-dialog match-menu-dialog" role="dialog" aria-modal="true" aria-label={msg("Menu")} onClick={e=>e.stopPropagation()}><h2>{msg("Menu")}</h2><div className="match-menu">{online&&<><p>{msg(connection?.message??'')}</p>{(connection?.role==='guest'||!connection?.connected)&&<button className="outline-button full" onClick={()=>match.kind==='live'&&match.reconnect()}>{msg("Reconnect")}</button>}</>}{fullscreen.supported?<button className="outline-button full" onClick={()=>void fullscreen.toggle()}>{fullscreen.active?<Minimize size={15}/>:<Maximize size={15}/>}{fullscreen.active?msg("Exit fullscreen"):msg("Fullscreen")}</button>:!fullscreen.installed&&<p className="match-menu-hint">{msg("For fullscreen, add this page to your home screen: Share, then Add to Home Screen.")}</p>}<button className="outline-button full" onClick={()=>!local?setPanel('settings'):navigate('settings')}><Settings2 size={15}/>{msg("Settings")}</button><button className="outline-button full" onClick={()=>setPanel('rules')}><CircleHelp size={15}/>{msg("How to play")}</button><button className="outline-button full" onClick={()=>setPanel('journal')}><ScrollText size={15}/>{msg("Battle journal")}</button><button className="outline-button full" aria-pressed={logOpen} onClick={()=>{setLogOpen(open=>!open);setPanel(null);}}><ScrollText size={15}/>{logOpen?msg("Hide battle log"):msg("Show battle log")}</button><div className="match-skip"><span>{msg("Skip empty response steps")}</span><button className={`toggle ${skipEmptyWindows?'on':''}`} role="switch" aria-checked={skipEmptyWindows} aria-label={msg("Skip empty response steps")} onClick={()=>updatePreferences({skipEmptyWindows:!skipEmptyWindows})}><span/></button></div><button className="outline-button full" onClick={()=>{setPanel(null);navigate('menu');}}>{watching?msg("Close replay"):!local?msg("Leave online game"):msg("Main menu")}</button>{!watching&&!tutorial&&!state.outcome&&(confirmConcede?<div className="concede-confirm" role="alertdialog" aria-label={msg("Concede")}><p>{msg("Give up this match? Your opponent wins.")}</p><div><button className="outline-button danger" onClick={concede}>{msg("Concede")}</button><button className="outline-button" onClick={()=>setConfirmConcede(false)}>{msg("Keep playing")}</button></div></div>:<button className="outline-button full danger" onClick={()=>setConfirmConcede(true)}>{msg("Concede")}</button>)}</div></section></div>}
    {panel&&panel!=='menu'&&<div className="panel-backdrop" onClick={()=>setPanel(null)}><section className={`side-panel `} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={panel==='rules'?msg("Rules"):panel==='settings'?msg("Settings"):panel==='journal'?msg("Battle journal"):panel==='discard'?msg("Discard piles"):msg("Match laboratory")}><div className="panel-header"><div><h2>{panel==='rules'?msg("Rules"):panel==='settings'?msg("Settings"):panel==='journal'?msg("Battle journal"):panel==='discard'?msg("Discard piles"):msg("Match laboratory")}</h2></div><button aria-label={msg("Close panel")} onClick={()=>setPanel(null)}><X size={20}/></button></div>
      {panel==='rules'&&<div className="rules-content">{[
        ['01',msg("Draw & choose"),msg("Begin with five cards. Each turn, draw two and keep one; the other goes to your discard pile or under your library, as you choose. The first player skips their first draw.")],
        ['02',msg("Build your economy"),msg("Play zero-cost creatures first. Most enter exhausted. On later turns, exhaust a ready creature to generate its printed energy. Match faction symbols to colored costs; any energy pays generic costs.")],
        ['03',msg("Commit your assault"),msg("Enter combat, select any ready creatures, and attack as a batch. A creature cannot channel and attack in the same readiness cycle. Attackers choose a lane in the next step; unblocked attacks damage the opponent.")],
        ['04',msg("Choose a lane"),msg("Each attacker targets its own lane or an adjacent one, and no two attackers may target the same lane. The creature or holding in that lane blocks automatically, even when exhausted. A Guard next to the targeted lane steps in and blocks instead, even if the lane is empty. An empty lane lets the attack hit the player. Attacker and blocker deal their full Attack simultaneously; excess never hits the player.")],
        ['05',msg("A final bargain"),msg("Whenever a creature with an energy output dies, on any turn and from any cause, its owner gets that energy for response spells. After combat the attacker's window opens first, then the defender's. Choose one output for dual producers. Creatures that die inside a window add to their owner's pool.")],
        ['06',msg("Ready & pass"),msg("At the end of your turn, your surviving field cards ready. Damage clears from all field cards and all energy expires. Drawing the last card in your library immediately loses the game. Discards do not recycle.")]
      ].map(([n,title,copy])=><article key={n}><span>{n}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}<div className="note-box">{msg("Left Flank · Left Wing · Center · Right Wing · Right Flank. Choose a position when deploying. Cards cannot move while on the battlefield. Adjacent means one slot away in the same row; empty slots do not close the gap. Position affects an ability only when its text says so.")}</div><div className="note-box">{msg("Holdings occupy a field slot and deal their printed damage when blocking. They cannot attack or produce energy, including on death. Continuous effects stay active while on the field; activated abilities exhaust a ready field card during its controller’s play phase.")}</div><div className="note-box">{msg("Consume is an ability on specific cards. It sacrifices a friendly creature as a play cost, freeing its slot. There is no free sacrifice action.")}</div></div>}
      {panel==='settings'&&<div className="settings-content match-preferences"><PreferenceControls/><VersionLine/></div>}
      
      {panel==='discard'&&<div className="discard-content">{[viewer,other(viewer)].map(owner=><section key={owner}><h3>{playerName(view.players[owner].name)} <small>{view.players[owner].discard.length} {msg(view.players[owner].discard.length===1?'card':'cards')}</small></h3>{view.players[owner].discard.length?<div className="codex-grid">{[...view.players[owner].discard].reverse().map(id=><article key={id}><ArtCard reduced card={registry.cards[view.cards[id].definitionId]}/></article>)}</div>:<p className="empty-pile">{msg("Nothing here yet.")}</p>}</section>)}</div>}
      {panel==='journal'&&<div className="journal-content"><div className="discard-summary">{(['p1','p2'] as PlayerId[]).map(p=><div key={p}><h3>{playerName(view.players[p].name)}</h3><p className="journal-counts">{view.players[p].handCount} {msg("in hand ·")}{' '}{view.players[p].deckCount} {msg("in deck")}</p><span className="eyebrow">{msg("DISCARD ·")}{' '}{view.players[p].discard.length}</span>{view.players[p].discard.map(id=><p key={id}>{msg(registry.cards[view.cards[id].definitionId].name)}</p>)}</div>)}</div><h3>{msg("Match events")}</h3><ol className="event-list">{[...view.events].reverse().map(e=><li key={e.seq}><span>{String(e.seq).padStart(3,'0')}</span><p>{msg(e.message)}</p></li>)}</ol></div>}
      {panel==='debug'&&<div className="debug-content"><div className="debug-metrics"><span>{msg("Revision")}<b>{view.revision}</b></span><span>{msg("Steps")}<b>{historyLength}</b></span><span>{msg("Seed")}<b>{initial.seed}</b></span></div><label>{msg("TIME TRAVEL")}<input type="range" min={0} max={historyLength} value={historyIndex??historyLength} onChange={e=>{setHistoryIndex(Number(e.target.value));setSelected(null);}}/></label><div className="debug-actions"><button className="outline-button" onClick={()=>setHistoryIndex(null)}>{msg("Return to live")}</button>{local&&<button className="outline-button" onClick={exportReplay}>{msg("Export replay")}<Download size={14}/></button>}</div><details><summary>{msg("Player projection")}</summary><pre>{JSON.stringify(view,null,2)}</pre></details><h3>{!local?msg("What happened"):msg("Accepted commands")}</h3><ol className="command-list">{historySteps.map((e,i)=><li key={i}><button onClick={()=>setHistoryIndex(i+1)}><span>{i+1}</span><b>{e.who}</b>{msg(e.label)}<ChevronRight size={13}/></button></li>)}</ol></div>}
    </section></div>}
  </div>;
}
function LayersIcon(){
  useLanguage();return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 5l6-3 6 3-6 3Zm0 3l6 3 6-3M2 11l6 3 6-3"/></svg>;}
