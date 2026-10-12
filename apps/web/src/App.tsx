import { CardDetail } from './CardDetail';
import { DrawChoice } from './DrawChoice';
import { BattleLog } from './BattleLog';
import { lazy, type CSSProperties, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Heart, CircleHelp, Download, Eye, Leaf, RotateCcw, ScrollText, Settings2, Shield, Sparkles, Swords, X, Zap, Moon, Check, Play, SkipForward, BookOpen, Terminal, Skull } from 'lucide-react';
import { deckRules, positionName } from '../../../packages/contracts/src';
import type { CardDefinition, Command, CommandEnvelope, EnergyType, GameState, PlayerId, Pool, PlayerView } from '../../../packages/contracts/src';
import { apply, decisionPlayer, effectiveStats, laneBlocks, other, projectForPlayer, replay } from '../../../packages/core/src';
import { botCommand } from '../../../packages/core/src/bot';
import { defaultDeckId, factionInfo, registry } from '../../../packages/content/src';
const Board=lazy(()=>import('../../../packages/renderer/src/Board').then(module=>({default:module.Board})));
import type { SlotLayout } from '../../../packages/renderer/src/Board';
import { nextPlayStage, resolveDrop, resolveLaneDrop, type DropZone, type PlayDraft } from './cardInteraction';
import { useCardDrag, type CardDrag } from './useCardDrag';
import { creatureActions, undoableChannels, undoChannel, type CreatureAction } from './creatureActions';
import { BoardPositionLabel } from './BoardPositionLabel';
import { CombatArrows } from './CombatArrows';
import { EnergyFlow, type EnergyFlight } from './EnergyFlow';
import { SpellCast, spellTone, type SpellFx } from './SpellCast';
import { combatForecast } from './combatForecast';
import { ClashLayer, type FxBatch } from './ClashLayer';
import { buildAftermath, buildArrival, buildCharge, buildClash, type ClashStep } from './combatReplay';
import { useCardMotion, type Poses } from './cardMotion';
import { Cost, Energy, EnergyOutput, ArtCard, CardFace, CardFacts, CardLore, cardAbilityDescriptions, cardClassification } from './CardPresentation';
import { AuthoringLobby } from './AuthoringLobby';
import { Coach } from './Coach';
import { opponentCommand, opponentMoves, opponentNote, playerCommands, scriptFinished, startTutorial, stepAfter, tutorialKey, tutorialSteps } from './tutorial';
import { Lobby, type Screen } from './Lobby';
import { decksKey, parseDecks, starterOptions, type CustomDeck } from './decks';
import { compatibleMatch, restoreSession, startMatch, type DeckName, type SavedSession } from './session';
import { claimVictory, collectionRules, missingDeckCopies } from './collection';
import { updateCollection, useCollection } from './collectionStore';
import { DustAmount } from './Dust';
import type { RtcRoom } from './multiplayer/RtcRoom';
import { useRoom } from './multiplayer/useRoom';
import { presentationState, type MatchSnapshot } from '../../../packages/multiplayer/src/protocol';
type Mode='practice'|'hotseat';
type Draft=PlayDraft & {activation?:number};
type PreviewRequest={pinned?:boolean;cardId:string;left:number;top:number;right:number;bottom:number};
function LibraryCount({count}:{count:number}) {
  return <div className={`library-count ${count<=6?'library-low':''}`} title={`${count} cards in library. Drawing the last card loses the game.`} aria-label={`${count} cards in library`}><BookOpen size={15}/><strong>{count}</strong><small>LIBRARY</small></div>;
}
function DiscardCount({count,top,onOpen}:{count:number;top?:CardDefinition;onOpen:()=>void}) {
  return <button className="discard-count" onClick={onOpen} title={`${count} ${count===1?'card':'cards'} in the discard pile. Click to view.`} aria-label={`Open discard pile, ${count} cards`}>
    <span className={`discard-top ${top?'':'empty'}`}>{top&&<img src={top.art} alt="" draggable={false}/>}</span><strong>{count}</strong><small>DISCARD</small>
  </button>;
}
function playTone(type:string, enabled:boolean) {
  if(!enabled)return;
  try { const AudioContextClass=window.AudioContext;const ctx=new AudioContextClass(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.type='sine';osc.frequency.value=type==='damage.dealt'?110:type==='energy.generated'?620:330;gain.gain.setValueAtTime(.04,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.15);osc.start();osc.stop(ctx.currentTime+.17);osc.onended=()=>void ctx.close(); } catch { /* Audio is optional. */ }
}
const savedKey='varhir-session-v1';
function readSaved():SavedSession|null {
  try { const raw=localStorage.getItem(savedKey);if(!raw)return null;const saved=JSON.parse(raw) as SavedSession;return restoreSession(saved); } catch { return null; }
}
type BootSession = SavedSession & { hasSaved: boolean; openMatch?: boolean };
export function App() {
  const [online,setOnline]=useState<RtcRoom|null>(null);
  const [session, setSession] = useState<BootSession | null>(() => {
    const saved = readSaved();
    return saved && saved.started !== false ? { ...saved, hasSaved: true } : null;
  });
  const leaveOnline=()=>{online?.leave();setOnline(null);const saved=readSaved();setSession(saved&&saved.started!==false?{...saved,hasSaved:true}:null);};
  const onlineSnapshot=useRoom(online).snapshot;
  if(online&&onlineSnapshot)return <MatchApp key={onlineSnapshot.matchId} online={online} leaveOnline={leaveOnline} onOnlineStart={setOnline} boot={{initial:presentationState(onlineSnapshot),commands:[],mode:'hotseat',deck:defaultDeckId,skirmish:false,started:true,hasSaved:true,openMatch:true,rewardId:onlineSnapshot.matchId,rewardEligible:true}}/>;
  return session ? <MatchApp boot={session} onOnlineStart={setOnline}/> : <AuthoringLobby onStart={saved => setSession({ ...saved, hasSaved: true, openMatch: true })} onOnlineStart={setOnline}/>;
}
function MatchApp({boot,online,leaveOnline,onOnlineStart}: {boot: BootSession;online?:RtcRoom;leaveOnline?:()=>void;onOnlineStart:(room:RtcRoom)=>void}) {
  const onlineState=useRoom(online);
  const [initial,setInitial]=useState(boot.initial),[commands,setCommands]=useState<CommandEnvelope[]>(boot.commands),[localState,setState]=useState(()=>replay(boot.initial,boot.commands,registry));
  const state=useMemo(()=>onlineState.snapshot?presentationState(onlineState.snapshot):localState,[onlineState.snapshot,localState]);
  const {collection,saved:collectionSaved}=useCollection();
  const [rewardId,setRewardId]=useState<string|undefined>(()=>boot.rewardId??(state.outcome?undefined:crypto.randomUUID()));
  const [rewardEligible,setRewardEligible]=useState(boot.rewardEligible!==false);
  const [tutorial,setTutorial]=useState(!!boot.tutorial&&!online),[tutorialStep,setTutorialStep]=useState(()=>stepAfter(playerCommands(boot.commands))),[coachNudge,setCoachNudge]=useState(0);
  const collectionOutcome=onlineState.snapshot?(state.outcome===onlineState.snapshot.seat?'p1':state.outcome==='draw'?'draw':state.outcome?'p2':null):state.outcome;
  useEffect(()=>{updateCollection(current=>claimVictory(current,rewardId,collectionOutcome,rewardEligible));},[rewardId,collectionOutcome,rewardEligible]);
  const [mode,setMode]=useState<Mode>(boot.mode),[deck,setDeck]=useState<DeckName>(boot.deck),[skirmish,setSkirmish]=useState(boot.skirmish);
  const [screen,setScreen]=useState<Screen>(boot.openMatch?'match':'menu'),[hasMatch,setHasMatch]=useState(boot.hasSaved);
  const [customDeck,setCustomDeck]=useState<CustomDeck|undefined>(boot.customDeck);
  const [savedDecks,setSavedDecks]=useState<CustomDeck[]>(()=>{try{return parseDecks(localStorage.getItem(decksKey));}catch{return [];}});
  const deckOptions=[...starterOptions,...savedDecks,...(customDeck&&!savedDecks.some(d=>d.id===customDeck.id)?[customDeck]:[])];
  const setupPrefs=useMemo<{mode?:Mode;deckId?:string;opponentId?:string;seed?:string}>(()=>{try{const p=JSON.parse(localStorage.getItem('varhir-setup-v1')??'{}');return {mode:p.mode==='practice'||p.mode==='hotseat'?p.mode:undefined,deckId:typeof p.deckId==='string'?p.deckId:undefined,opponentId:typeof p.opponentId==='string'?p.opponentId:undefined,seed:typeof p.seed==='string'?p.seed:undefined};}catch{return {};}},[]);
  const [setupMode,setSetupMode]=useState<Mode>(setupPrefs.mode??boot.mode),[setupDeck,setSetupDeck]=useState<string>(deckOptions.some(d=>d.id===setupPrefs.deckId)?setupPrefs.deckId!:boot.customDeck?.id??boot.deck);
  const [setupOpponent,setSetupOpponent]=useState<string>(()=>setupPrefs.opponentId&&(setupPrefs.opponentId==='auto'||deckOptions.some(d=>d.id===setupPrefs.opponentId))?setupPrefs.opponentId:boot.opponentDeck?.id??'auto'),[opponentDeck,setOpponentDeck]=useState(boot.opponentDeck);
  const [viewer,setViewer]=useState<PlayerId>(onlineState.snapshot?.seat??(mode==='hotseat'?decisionPlayer(state):'p1')),[covered,setCovered]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[hovered,setHovered]=useState<string|null>(null),[draft,setDraft]=useState<Draft|null>(null),[stage,setStage]=useState<'none'|'consume'|'position'|'target'>('none');
  const [attackers,setAttackers]=useState<string[]>([]),[lanes,setLanes]=useState<Record<string,number>>({});
  const [mulliganPick,setMulliganPick]=useState<string[]>([]),[drawOther,setDrawOther]=useState<'discard'|'bottom'>('discard'),[logOpen,setLogOpen]=useState(()=>(window.innerWidth>=951&&window.innerWidth>window.innerHeight)||(window.innerWidth<=950&&window.innerHeight>=800&&window.innerHeight>window.innerWidth)),[panel,setPanel]=useState<'rules'|'settings'|'journal'|'debug'|'discard'|null>(null),[error,setError]=useState(''),[sound,setSound]=useState(false),[reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches),[seed,setSeed]=useState(setupPrefs.seed??String(initial.seed));
  useEffect(()=>{if(online)return;try{localStorage.setItem('varhir-setup-v1',JSON.stringify({mode:setupMode,deckId:setupDeck,opponentId:setupOpponent,seed}));}catch{/* Optional setup preferences. */}},[setupMode,setupDeck,setupOpponent,seed,online]);
  const boardRef=useRef<HTMLDivElement>(null),enemyAvatarRef=useRef<HTMLButtonElement>(null);
  const poolRef=useRef<HTMLDivElement>(null),enemyPoolRef=useRef<HTMLDivElement>(null),previewRef=useRef<HTMLElement>(null);
  const [energyFlights,setEnergyFlights]=useState<EnergyFlight[]>([]),[spellCasts,setSpellCasts]=useState<SpellFx[]>([]);
  const actionPopoverRef=useRef<HTMLDivElement>(null);
  const [actionCard,setActionCard]=useState<string|null>(null);
  const [slotLayout,setSlotLayout]=useState<SlotLayout[]>([]),[previewRequest,setPreviewRequest]=useState<PreviewRequest|null>(null),[preview,setPreview]=useState<PreviewRequest|null>(null);
  const [historyIndex,setHistoryIndex]=useState<number|null>(null);
  const [clash,setClash]=useState<{steps:ClashStep[];i:number}|null>(null),posesRef=useRef<Poses>({});
  const displayedState=useMemo(()=>clash?clash.steps[clash.i].state:online||historyIndex===null||!compatibleMatch(state)?state:replay(initial,commands.slice(0,historyIndex),registry),[state,initial,commands,historyIndex,online,clash]);
  const view=useMemo(()=>{
    const snap=onlineState.snapshot;
    if(!snap)return projectForPlayer(displayedState,viewer,registry);
    // While a fight replays, show the replayed boards over the live snapshot (the hand and rules data stay as they are).
    if(!clash)return snap.view;
    const step=displayedState,pick=(id:PlayerId)=>({...snap.view.players[id],life:step.players[id].life,board:step.players[id].board,discard:step.players[id].discard,energy:step.players[id].energy});
    return {...snap.view,players:{p1:pick('p1'),p2:pick('p2')},cards:step.cards,combat:step.combat};
  },[displayedState,viewer,onlineState.snapshot,clash]);
  const ambient=useMemo(()=>{const tally:Record<string,number>={};for(const side of ['p1','p2'] as PlayerId[])for(const id of view.players[side].board)if(id)for(const f of registry.cards[view.cards[id].definitionId]?.factions??[])tally[f]=(tally[f]??0)+1;const top=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0];return factionInfo[top??'']?.color??'#d1bd86';},[view]);
  const [banner,setBanner]=useState<{id:number;text:string;tone:'own'|'enemy'|'combat'}|null>(null),bannerSeen=useRef<{turn:number;active:PlayerId;combat:boolean}|null>(null);
  useEffect(()=>{
    const now={turn:view.turn,active:view.active,combat:!!view.combat};
    const before=bannerSeen.current;bannerSeen.current=now;
    if(!before||screen!=='match'||historyIndex!==null||covered||tutorial||reduced||clash||view.outcome)return;
    let next:{text:string;tone:'own'|'enemy'|'combat'}|null=null;
    if(now.active!==before.active||now.turn!==before.turn)next=now.active===viewer?{text:'Your turn',tone:'own'}:{text:'Opponent’s turn',tone:'enemy'};
    else if(now.combat&&!before.combat&&view.combat?.stage==='declare')next={text:'Combat',tone:'combat'};
    if(!next)return;
    const id=Date.now();setBanner({id,...next});const t=setTimeout(()=>setBanner(b=>b?.id===id?null:b),1500);return()=>clearTimeout(t);
  },[view.turn,view.active,view.combat?.stage]);
  const actor=online?view.legal.actor:decisionPlayer(state),thinking=!online&&mode==='practice'&&actor==='p2'&&!state.outcome,live=screen==='match'&&compatibleMatch(state)&&historyIndex===null&&!clash&&!covered&&!thinking&&(!online||onlineState.connected&&!onlineState.busy&&actor===viewer);
  // The opponent pauses before each phase change so the player confirms it (enter combat, resolve combat, end turn).
  // In the tutorial the opponent follows a written script; once that runs out (or outside it) the regular bot plays.
  const opponentPlay=useCallback((s:GameState)=>(tutorial?opponentCommand(s,opponentMoves(commands)):null)??botCommand(s,registry),[tutorial,commands]);
  const botGate=useMemo(()=>{if(screen!=='match'||mode!=='practice'||actor!=='p2'||state.outcome||historyIndex!==null||!compatibleMatch(state)||state.pending)return null;const cmd=opponentPlay(state);return cmd.type==='confirm-combat'||(cmd.type==='end'&&state.combat?.stage!=='death')?cmd:null;},[screen,mode,actor,state,historyIndex,opponentPlay]);
  const selectedLegal=view.legal.playable.find(a=>a.cardId===draft?.cardId);
  const undoable=live&&view.phase==='play'?(onlineState.snapshot?.undoable??undoableChannels(commands,viewer)):[];
  const visibleAttacks=view.combat?.stage==='declare'?attackers:view.combat?.attackers??[];
  const clashBatches=useMemo<FxBatch[]>(()=>clash?clash.steps.slice(0,clash.i+1).map((step,j)=>({key:`s${j}`,poses:j===clash.i?step.poses:[],pops:step.pops,ms:step.ms,caption:j===clash.i?step.caption:undefined})):[],[clash]);
  useCardMotion(clash?clash.steps[clash.i]:null,slotLayout,viewer,posesRef);
  const draftLanes=useMemo(()=>Object.fromEntries(attackers.map(id=>[id,lanes[id]??displayedState.cards[id]?.slot??0])),[attackers,lanes,displayedState]);
  const forecast=useMemo(()=>online?onlineState.snapshot?.forecast??null:combatForecast(displayedState,attackers.length?{attackers,lanes:draftLanes}:null,registry),[displayedState,attackers,draftLanes,online,onlineState.snapshot]);
  const selectedActivation=view.legal.activations.find(a=>a.cardId===draft?.cardId&&a.ability===draft?.activation);
  const targets=stage==='target'?(selectedActivation?.targets??selectedLegal?.targets??[]):stage==='consume'?selectedLegal?.consumes??[]:[];
  const send=useCallback((command:Command)=>{
    if(screen!=='match'||historyIndex!==null||!compatibleMatch(state)||clash)return;
    if(tutorial&&!online&&decisionPlayer(state)==='p1'){const step=tutorialSteps[tutorialStep];if(!step?.accept||!step.accept(command,state)){setCoachNudge(n=>n+1);return;}}
    if(online){
      try{online.act(command);setActionCard(null);setError('');setDraft(null);setStage('none');setAttackers([]);setLanes({});setSelected(null);setHovered(null);setPreviewRequest(null);}
      catch(cause){setError(cause instanceof Error?cause.message:'Could not send the move.');}
      return;
    }
    const envelope:CommandEnvelope={actor:decisionPlayer(state),expectedRevision:state.revision,command,clientActionId:`local-${crypto.randomUUID()}`};
    const result=apply(state,envelope,registry);
    if(result.error){setError(result.error);return;}
    if(command.type==='energy'&&!reduced&&!covered){
      const card=state.cards[command.cardId],slot=slotLayout.find(s=>s.player===card.controller&&s.slot===card.slot),board=boardRef.current?.getBoundingClientRect();
      const pool=(card.controller===viewer?poolRef:enemyPoolRef).current?.getBoundingClientRect();
      const colors=Object.entries(result.state.players[envelope.actor].energy).flatMap(([color,amount])=>Array.from({length:Math.min(4,Math.max(0,amount!-(state.players[envelope.actor].energy[color as EnergyType]??0)))},()=>factionInfo[color as EnergyType].color));
      if(slot&&board&&pool&&colors.length)setEnergyFlights(f=>[...f.slice(-3),{id:envelope.clientActionId!,player:envelope.actor,from:{x:board.left+slot.x+slot.width/2,y:board.top+slot.y+slot.height/2},to:{x:pool.left+pool.width/2,y:pool.top+pool.height/2},colors}]);
    }
    if(!reduced&&!covered){
      // Spells leave the board at once, so reveal each one and trace it to its target.
      const board=boardRef.current?.getBoundingClientRect();
      if(board){
        const centre={x:board.left+board.width/2,y:board.top+board.height/2};
        const casts=result.events.filter(e=>e.type==='spell.cast'&&e.cardId).map((e,i):SpellFx=>{
          const card=registry.cards[result.state.cards[e.cardId!].definitionId];
          let to:SpellFx['to']=null;
          if(e.target==='p1'||e.target==='p2'){const pool=(e.target===viewer?poolRef:enemyPoolRef).current?.getBoundingClientRect();if(pool)to={x:pool.left+pool.width/2,y:pool.top+pool.height/2};}
          else if(e.target){const target=state.cards[e.target],slot=slotLayout.find(l=>l.player===target?.controller&&l.slot===target?.slot);if(slot)to={x:board.left+slot.x+slot.width/2,y:board.top+slot.y+slot.height/2};}
          return {id:`${envelope.clientActionId??e.seq}-${i}`,card,caster:envelope.actor===viewer?'mine':'theirs',tone:spellTone(card),from:centre,to};
        });
        if(casts.length)setSpellCasts(list=>[...list.slice(-1),...casts]);
      }
    }
    // A fight is replayed one exchange at a time; anything else gets numbers over what was hurt and a dissolve for the fallen.
    let nextClash:ClashStep[]=[];
    if(!reduced&&!covered&&mode!=='hotseat'){
      const playedDef=command.type==='play'?registry.cards[result.state.cards[command.cardId]?.definitionId??'']:undefined;
      if(command.type==='confirm-combat')nextClash=buildClash(state,result.events,registry);
      else if(command.type==='play'&&playedDef?.type==='creature'&&playedDef.abilities.some(a=>a.id==='charge'))nextClash=buildCharge(result.state,result.events,registry,command.cardId);
      if(!nextClash.length)nextClash=buildAftermath(result.state,result.events,registry,result.events.some(e=>e.type==='spell.cast')?950:0);
      if(!nextClash.length&&command.type==='play')nextClash=buildArrival(result.state,command.cardId);
    }
    setClash(nextClash.length?{steps:nextClash,i:0}:null);
    if(tutorial&&envelope.actor==='p1')setTutorialStep(stepAfter(playerCommands(commands)+1));
    setActionCard(null);setError('');setState(result.state);setCommands(c=>[...c,envelope]);setDraft(null);setStage('none');setAttackers([]);setLanes({});setSelected(null);setHovered(null);setPreviewRequest(null);
    const event=result.events.find(e=>['damage.dealt','energy.generated','card.played','spell.cast'].includes(e.type));if(event)playTone(event.type,sound);
  },[state,historyIndex,sound,reduced,covered,slotLayout,viewer,screen,online,tutorial,tutorialStep,commands,clash,mode]);
  useEffect(()=>{if(!clash)return;const timer=setTimeout(()=>setClash(c=>c&&(c.i+1<c.steps.length?{...c,i:c.i+1}:null)),clash.steps[clash.i].ms);return()=>clearTimeout(timer);},[clash]);
  useEffect(()=>{setClash(null);},[viewer,initial,historyIndex,reduced,covered,screen]);
  useEffect(()=>{if(!clash)return;const skip=(event:KeyboardEvent)=>{if(event.key===' '||event.key==='Enter'||event.key==='Escape'){event.preventDefault();setClash(null);}};window.addEventListener('keydown',skip);return()=>window.removeEventListener('keydown',skip);},[clash]);
  useEffect(()=>{if(!spellCasts.length)return;const timer=setTimeout(()=>setSpellCasts([]),2100);return()=>clearTimeout(timer);},[spellCasts]);
  useEffect(()=>{setSpellCasts([]);},[viewer,initial,historyIndex,reduced,covered]);
  useEffect(()=>{if(!energyFlights.length)return;const timer=setTimeout(()=>setEnergyFlights([]),1600);return()=>clearTimeout(timer);},[energyFlights]);
  useEffect(()=>{setEnergyFlights([]);},[viewer,initial,historyIndex,reduced,covered]);
  useEffect(()=>{
    if(screen==='match'&&compatibleMatch(state)&&mode==='practice'&&actor==='p2'&&!state.outcome&&historyIndex===null&&!botGate&&!clash){const timer=setTimeout(()=>send(opponentPlay(state)),state.combat?.stage==='review'?1800:reduced?130:650);return()=>clearTimeout(timer);}
  },[state,mode,actor,send,reduced,historyIndex,screen,botGate,opponentPlay,clash]);
  useEffect(()=>{if(!online&&mode==='hotseat'&&actor!==viewer&&!state.outcome)setCovered(true);},[actor,viewer,mode,state.outcome,online]);
  useEffect(()=>{if(online)return;try{localStorage.setItem(savedKey,JSON.stringify({initial,commands,mode,deck,skirmish,customDeck,opponentDeck,started:hasMatch,rewardId,rewardEligible,tutorial} satisfies SavedSession));}catch{/* Saving is best-effort. */}},[initial,commands,mode,deck,skirmish,customDeck,opponentDeck,hasMatch,rewardId,rewardEligible,tutorial,online]);
  useEffect(()=>{if(onlineState.snapshot?.error)setError(onlineState.snapshot.error);},[onlineState.snapshot]);
  useEffect(()=>{if(online){setActionCard(null);setDraft(null);setStage('none');setAttackers([]);setLanes({});}},[online,view.revision]);
  const networkPrevious=useRef<MatchSnapshot|null>(null);
  useEffect(()=>{
    const next=onlineState.snapshot,previous=networkPrevious.current;
    networkPrevious.current=next;
    if(!online||!next||!previous||next.view.revision===previous.view.revision)return;
    const oldSeq=previous.view.events.at(-1)?.seq??0,newSeq=next.view.events.at(-1)?.seq??0;
    if(newSeq<oldSeq){setEnergyFlights([]);return;}
    const events=next.view.events.filter(event=>event.seq>oldSeq);
    const board=boardRef.current?.getBoundingClientRect();
    if(board&&!reduced){
      for(const event of events.filter(event=>event.type==='energy.generated'&&event.cardId)){
        const card=previous.view.cards[event.cardId!]??next.view.cards[event.cardId!];
        if(!card)continue;
        const slot=slotLayout.find(slot=>slot.player===card.controller&&slot.slot===card.slot);
        const pool=(card.controller===viewer?poolRef:enemyPoolRef).current?.getBoundingClientRect();
        const colors=Object.entries(next.view.players[card.controller].energy).flatMap(([color,amount])=>Array.from({length:Math.min(4,Math.max(0,amount-(previous.view.players[card.controller].energy[color]??0)))},()=>factionInfo[color as EnergyType].color));
        if(slot&&pool&&colors.length)setEnergyFlights(list=>[...list.slice(-3),{id:`online-${next.view.revision}-${event.seq}`,player:card.controller,from:{x:board.left+slot.x+slot.width/2,y:board.top+slot.y+slot.height/2},to:{x:pool.left+pool.width/2,y:pool.top+pool.height/2},colors}]);
      }
      const casts=events.filter(event=>event.type==='spell.cast'&&event.cardId).flatMap((event):SpellFx[]=>{
        const instance=next.view.cards[event.cardId!];if(!instance)return [];
        const card=registry.cards[instance.definitionId],from={x:board.left+board.width/2,y:board.top+board.height/2};let to:SpellFx['to']=null;
        if(event.target==='p1'||event.target==='p2'){const pool=(event.target===viewer?poolRef:enemyPoolRef).current?.getBoundingClientRect();if(pool)to={x:pool.left+pool.width/2,y:pool.top+pool.height/2};}
        else if(event.target){const target=previous.view.cards[event.target],slot=slotLayout.find(slot=>slot.player===target?.controller&&slot.slot===target?.slot);if(slot)to={x:board.left+slot.x+slot.width/2,y:board.top+slot.y+slot.height/2};}
        return [{id:`online-${next.view.revision}-${event.seq}`,card,caster:instance.owner===viewer?'mine':'theirs',tone:spellTone(card),from,to}];
      });
      if(casts.length)setSpellCasts(list=>[...list.slice(-1),...casts]);
    }
    // Replay the fight on the boards, the same way a local game does.
    if(board&&!reduced&&!clash){
      const before=presentationState(previous),after=presentationState(next),played=events.find(event=>event.type==='card.played'&&event.cardId),playedDef=played?registry.cards[after.cards[played.cardId!]?.definitionId??'']:undefined;
      let steps:ClashStep[]=[];
      if(previous.view.combat?.stage==='review'&&events.some(event=>event.type==='damage.dealt'))steps=buildClash(before,events,registry);
      else if(played&&playedDef?.type==='creature'&&playedDef.abilities.some(a=>a.id==='charge'))steps=buildCharge(after,events,registry,played.cardId!);
      if(!steps.length)steps=buildAftermath(after,events,registry,events.some(event=>event.type==='spell.cast')?950:0);
      if(!steps.length&&played&&playedDef?.type==='creature')steps=buildArrival(after,played.cardId!);
      if(steps.length)setClash({steps,i:0});
    }
    const event=events.find(event=>['damage.dealt','energy.generated','card.played','spell.cast'].includes(event.type));if(event)playTone(event.type,sound);
  },[online,onlineState.snapshot,reduced,slotLayout,viewer,sound]);
  useEffect(()=>{if(error){const t=setTimeout(()=>setError(''),5500);return()=>clearTimeout(t);}},[error]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSelected(null);setDraft(null);setStage('none');setPanel(null);setActionCard(null);} };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  function navigate(next:Screen) {
    if(online&&next!=='match'){leaveOnline?.();return;}
    setScreen(next);setPanel(null);setActionCard(null);setSelected(null);setHovered(null);setPreviewRequest(null);setPreview(null);setDraft(null);setStage('none');setEnergyFlights([]);
  }
  function saveDeck(next:CustomDeck):string|null {
    const decks=[...savedDecks.filter(d=>d.id!==next.id),structuredClone(next)];
    try{localStorage.setItem(decksKey,JSON.stringify(decks));}catch{return 'Could not save. This browser’s storage is full or unavailable.';}
    setSavedDecks(decks);setSetupDeck(next.id);return null;
  }
  function reset(isSkirmish:boolean,nextMode:Mode=mode,nextDeck:string=customDeck?.id??deck,nextSeed:number=Number(seed)||731,override?:CustomDeck,nextOpponent:string=setupOpponent) {
    if(online)return;
    const custom=override??savedDecks.find(d=>d.id===nextDeck)??(customDeck?.id===nextDeck?customDeck:undefined);
    const starter:DeckName=starterOptions.some(d=>d.id===nextDeck)?nextDeck:defaultDeckId;
    const chosen=custom??starterOptions.find(d=>d.id===starter);
    if(chosen&&missingDeckCopies(chosen.cards,collection.counts).length){setError('You do not own enough copies to play this deck.');return;}
    let next:GameState;try{const chosenOpponent=deckOptions.find(d=>d.id===nextOpponent);next=startMatch(nextSeed,starter,isSkirmish,custom,undefined,chosenOpponent);setOpponentDeck(chosenOpponent?structuredClone(chosenOpponent):undefined);}catch(e){setError(e instanceof Error?e.message:'This deck cannot start a match.');return;}
    setCustomDeck(custom?structuredClone(custom):undefined);setHasMatch(true);setScreen('match');
    setRewardId(crypto.randomUUID());setRewardEligible(true);
    setTutorial(false);setActionCard(null);setInitial(next);setCommands([]);setState(next);setMode(nextMode);setDeck(starter);setSkirmish(isSkirmish);setViewer('p1');setCovered(false);setSelected(null);setHovered(null);setPreviewRequest(null);setDraft(null);setStage('none');setHistoryIndex(null);setPanel(null);setAttackers([]);setLanes({});setError('');
  }
  function startTutorialMatch() {
    if(online)return;
    const saved=startTutorial();
    try{localStorage.setItem(tutorialKey,'started');}catch{/* Optional. */}
    setTutorial(true);setTutorialStep(0);setCoachNudge(0);setCustomDeck(undefined);setOpponentDeck(undefined);setHasMatch(true);setScreen('match');
    setRewardId(undefined);setRewardEligible(false);
    setActionCard(null);setInitial(saved.initial);setCommands([]);setState(saved.initial);setMode('practice');setDeck(saved.deck);setSkirmish(false);setViewer('p1');setCovered(false);setSelected(null);setHovered(null);setPreviewRequest(null);setDraft(null);setStage('none');setHistoryIndex(null);setPanel(null);setAttackers([]);setLanes({});setError('');
  }
  function endTutorial(finished:boolean) {
    try{localStorage.setItem(tutorialKey,finished?'done':'skipped');}catch{/* Optional. */}
    setTutorial(false);
  }
  const compatible=compatibleMatch(state);
  useEffect(()=>{
    if(compatible)return;
    if(online){setError('Rules or cards changed. Leave the room and rejoin using the same build.');return;}
    if(tutorial){startTutorialMatch();return;}
    reset(skirmish,mode,customDeck?.id??deck,initial.seed,customDeck);
    setScreen(screen);
    setError('The game rules updated. A fresh match has started with your current setup.');
  },[compatible,skirmish,mode,deck,initial.seed,customDeck,screen,online]);
  function exportReplay(){if(online)return;const data=JSON.stringify({initial,commands,mode,deck,skirmish,customDeck,started:hasMatch,rewardId,rewardEligible:false} satisfies SavedSession,null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`varhyr-replay-${initial.seed}.json`;a.click();URL.revokeObjectURL(url);}
  async function importReplay(file:File){if(online)return;try{const saved=JSON.parse(await file.text()) as SavedSession;const next=replay(saved.initial,saved.commands,registry);setInitial(saved.initial);setCommands(saved.commands);setState(next);setRewardId(saved.rewardId);setRewardEligible(false);setMode(saved.mode);setDeck(saved.deck);setSkirmish(saved.skirmish);setCustomDeck(saved.customDeck);setHasMatch(true);setScreen('match');setSetupDeck(saved.customDeck?.id??saved.deck);setSetupMode(saved.mode);setViewer(saved.mode==='hotseat'?decisionPlayer(next):'p1');setHistoryIndex(null);setPanel(null);setSelected(null);setDraft(null);setStage('none');setCovered(false);setSeed(String(saved.initial.seed));}catch{setError('This replay is incompatible or contains an invalid command.');}}
  function beginPlay(nextDraft:Draft) {
    setActionCard(null);
    const legal=view.legal.playable.find(a=>a.cardId===nextDraft.cardId);if(!legal){setError('Generate the required energy first, and check your free slots.');return;}
    setDraft(nextDraft);
    const nextStage=nextPlayStage(registry.cards[view.cards[nextDraft.cardId].definitionId],legal,nextDraft);
    if(nextStage!=='none'){setStage(nextStage);return;}
    send({type:'play',...nextDraft});
  }
  function inspectBoard(id:string) {
    const card=view.cards[id],slot=slotLayout.find(s=>s.player===card?.controller&&s.slot===card?.slot),rect=boardRef.current?.getBoundingClientRect();
    if(slot&&rect)pinPreview(id,{left:rect.left+slot.x,top:rect.top+slot.y,right:rect.left+slot.x+slot.width,bottom:rect.top+slot.y+slot.height});
  }
  function pinPreview(id:string,rect:Pick<DOMRect,'left'|'top'|'right'|'bottom'>){setActionCard(null);setSelected(id);setPreviewRequest({cardId:id,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,pinned:true});}
  function closePreview(){setSelected(null);setPreviewRequest(null);setPreview(null);}
  function sendTarget(target:string) {
    if(!draft)return;
    if(draft.activation!==undefined)send({type:'activate',cardId:draft.cardId,ability:draft.activation,target});
    else send({type:'play',...draft,target});
  }
  function selectBoard(id:string) {
    if(!live||suppressClick())return;
    if(stage==='consume'&&draft&&targets.includes(id)){beginPlay({...draft,consume:id,slot:view.cards[id].slot!});return;}
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
      if(legal.requiresTarget){setDraft({cardId:id,activation:action.ability});setStage('target');setSelected(id);}
      else send({type:'activate',cardId:id,ability:action.ability});
    }
    else if(action.kind==='attack'){setAttackers(a=>a.includes(id)?a:[...a,id]);setLanes(l=>({...l,[id]:action.lane}));setSelected(null);setHovered(null);}
    else if(action.kind==='withdraw'){setAttackers(a=>a.filter(x=>x!==id));setLanes(l=>{const {[id]:_removed,...rest}=l;return rest;});setSelected(null);setHovered(null);}
    else {
      if(online){try{online.undoChannel(id);setEnergyFlights([]);setSelected(null);setHovered(null);setDraft(null);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Cannot undo this energy.');}return;}
      if(tutorial){setCoachNudge(n=>n+1);return;}
      const undone=undoChannel(initial,commands,viewer,id,registry);
      if(!undone){setError('This energy is committed and cannot be undone.');return;}
      setEnergyFlights([]);setState(undone.state);setCommands(undone.commands);setSelected(null);setHovered(null);setDraft(null);setError('');
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
      if(lane===null){setError('Drop the attacker on a highlighted lane.');return;}
      setAttackers(a=>a.includes(point.cardId)?a:[...a,point.cardId]);setLanes(l=>({...l,[point.cardId]:lane}));setSelected(null);return;
    }
    const drop=resolveDrop(view,viewer,registry,point.cardId,hitZone(point));
    if(!drop){setError(view.legal.playable.some(a=>a.cardId===point.cardId)?'Card returned to hand. Drop onto a highlighted slot or target.':'Card returned to hand. Generate matching energy and check the timing first.');return;}
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
  useEffect(()=>{const clear=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPreviewRequest(null);setPreview(null);}};window.addEventListener('keydown',clear);return()=>window.removeEventListener('keydown',clear);},[]);
  useEffect(()=>{
    if(!previewRequest?.pinned)return;
    const outside=(event:PointerEvent)=>{if(event.button!==2&&!previewRef.current?.contains(event.target as Node))closePreview();};
    window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);
  },[previewRequest?.pinned]);
  function clearHoverPreview(){setPreviewRequest(current=>current?.pinned?current:null);}
  function requestPreview(id:string,rect:DOMRect) {if(previewRequest?.pinned)return;setPreviewRequest({cardId:id,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom});}
  // Lane names stay hidden until the pointer is over that lane (the column of both rows).
  const [hoverLane,setHoverLane]=useState<number|null>(null);
  const laneAtX=(x:number)=>{const board=boardRef.current?.getBoundingClientRect();if(!board)return null;return slotLayout.find(s=>x>=board.left+s.x&&x<=board.left+s.x+s.width)?.slot??null;};
  function hoverBoard(id:string|null) {
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
  const actionPosition=actionSlot&&boardBounds?{left:Math.max(10,Math.min(window.innerWidth-234,boardBounds.left+actionSlot.x+actionSlot.width/2-112)),top:Math.max(10,Math.min(window.innerHeight-230,boardBounds.top+actionSlot.y+actionSlot.height+10))}:{left:10,top:100};
  const you=view.players[viewer],opponent=view.players[other(viewer)],deathWindow=view.combat?.stage==='death';
  const discardTop=(pile:string[])=>pile.length?registry.cards[view.cards[pile[pile.length-1]]?.definitionId]:undefined;
  const laneOccupant=(lane:number)=>{const id=view.players[other(viewer)].board[lane];return id?registry.cards[view.cards[id].definitionId].name:'Open · hits player';};
  let prompt=online&&!live?onlineState.connected?onlineState.busy?'Sending your move…':'Opponent’s turn…':onlineState.message:thinking?botGate?(botGate.type==='confirm-combat'?'The opponent’s attack is set. Review the arrows, then resolve combat.':view.phase==='play'?'The opponent is ready to attack.':'The opponent is done. Begin your turn.'):view.combat?.stage==='review'?'Lanes are set. The opponent is reviewing the attack…':'Opponent’s turn…':stage==='consume'?'Choose a friendly creature to Consume.':stage==='position'?'Choose a highlighted position. Deployment is permanent.':stage==='target'?'Choose a highlighted target.':view.phase==='draw'?'Draw two. Keep one.':view.phase==='play'?undoable.length?'Click a channelled creature to undo. Drag a card to play.':'Click a ready field card for actions. Drag a card to play.':view.combat?.stage==='declare'?attackers.length?'Gold arrows hit the player; cyan arrows meet a blocker. Drag an attacker to another lane to change it.':'Drag a ready creature onto a highlighted lane, or click it to choose one.':view.combat?.stage==='review'?'Defenders in the targeted lanes block automatically. Review the arrows, then confirm combat.':deathWindow?'The fallen leave energy behind. Cast a spell or close the window.':'End your turn to ready your field cards.';
  const factionSymbol=(id:PlayerId)=>{const tally:Record<string,number>={};for(const c of Object.values(state.cards))if(c.owner===id)for(const f of registry.cards[c.definitionId]?.factions??[])tally[f]=(tally[f]??0)+1;const top=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0];return (factionInfo[top??'']??Object.values(factionInfo)[0]).symbol;};
  const enemyPhase=view.combat?1:view.phase==='play'?0:2;
  const mainLabel=online&&!live?onlineState.connected?onlineState.busy?'Sending…':'Opponent’s turn':'Disconnected':thinking&&botGate?(botGate.type==='confirm-combat'?'Resolve combat':view.phase==='play'?'Enemy combat':'Your turn'):view.phase==='play'?'Enter combat':view.combat?.stage==='declare'?attackers.length?`Attack with ${attackers.length}`:'Skip combat':view.combat?.stage==='review'?'Confirm combat':deathWindow?'Close death window':'End turn';
  const phaseIndex=enemyPhase;
  function mainAction(){if(thinking&&botGate){send(botGate);return;}if(view.combat?.stage==='declare')send({type:'attack',attackers,lanes:draftLanes});else if(view.combat?.stage==='review')send({type:'confirm-combat'});else send({type:'end'});}
  const spaceRef=useRef<()=>void>(()=>{});
  spaceRef.current=()=>{if((live||(thinking&&botGate&&!covered&&screen==='match'))&&!view.pending&&!view.outcome&&!panel&&!drag&&!actionCard)mainAction();};
  useEffect(()=>{const onSpace=(e:KeyboardEvent)=>{if(e.code!=='Space'||e.repeat||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;const t=e.target as HTMLElement|null;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)||t.closest('[role="dialog"]')))return;e.preventDefault();spaceRef.current();};window.addEventListener('keydown',onSpace);return()=>window.removeEventListener('keydown',onSpace);},[]);
  if(screen!=='match')return <><Lobby reduced={reduced} screen={screen} navigate={navigate} canResume={hasMatch&&!state.outcome} resumeLabel={`Turn ${state.turn} · ${state.players.p1.name}`} decks={savedDecks} options={deckOptions} saveDeck={saveDeck} mode={setupMode} setMode={setSetupMode} selected={setupDeck} setSelected={setSetupDeck} opponentId={setupOpponent} setOpponentId={setSetupOpponent} seed={seed} setSeed={setSeed} start={isSkirmish=>reset(isSkirmish,setupMode,setupDeck)} startOnline={onOnlineStart} learn={startTutorialMatch}/>{error&&<div className="toast" role="alert">{error}</div>}</>;
  return <div className={`app ${drag?'is-dragging':''} ${reduced?'reduce-motion':''} ${tutorial&&!online?'tutorial-on':''}`}>
    <div className="world-bg"/><div className="world-vignette"/>
    <header className="topbar"><button className="brand" aria-label="Realms of Varhyr home" onClick={()=>navigate('menu')}><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button><div className="match-status" aria-label={`Turn ${view.turn}, ${view.active===viewer?'your':'opponent’s'} initiative`}><span>Turn {view.turn}</span><i/><strong>{online&&actor!==viewer?'Opponent’s turn':thinking?'Opponent’s turn':view.combat?.stage==='review'?'Review combat':deathWindow?'Death energy':view.phase==='play'?'Play & channel':view.phase==='attack'?'Select attackers':view.phase==='draw'?'Choose a card':'End turn'}</strong></div><nav className="game-navigation"><button onClick={()=>navigate('menu')} aria-label={online?"Leave online game":"Main menu"}><span>{online?"Leave":"Menu"}</span></button><button className={logOpen?'active-nav':''} onClick={()=>setLogOpen(open=>!open)} aria-label="Toggle battle log" aria-pressed={logOpen}><ScrollText size={17}/><span>Log</span></button>{!online&&<button onClick={()=>navigate('cards')} aria-label="Browse cards"><BookOpen size={17}/><span>Cards</span></button>}<button onClick={()=>setPanel('settings')} aria-label="Match settings"><Settings2 size={18}/></button></nav></header>
    {online&&<div className={`online-connection-strip ${onlineState.connected?'connected':'offline'}`} role="status"><span className="online-status-dot"/><span>Room {onlineState.code} · {onlineState.connected?onlineState.busy?'Sending move…':'Connected':onlineState.message}</span>{!onlineState.connected&&<button onClick={()=>online.reconnect()}>Reconnect</button>}</div>}
    <main className={`arena-shell ${logOpen?'with-log':''}`}>
      <section className="battlefield">
        <div className={`player-banner opponent ${targets.includes(other(viewer))||drag&&resolveDrop(view,viewer,registry,drag.cardId,{player:other(viewer)})?'targetable':''}`}>
          <div className="portrait"><button ref={enemyAvatarRef} className="avatar enemy-avatar" aria-label="Target opponent" disabled={!live||!targets.includes(other(viewer))&&!(drag&&resolveDrop(view,viewer,registry,drag.cardId,{player:other(viewer)}))} onClick={()=>sendTarget(other(viewer))}>{factionSymbol(other(viewer))}</button><div className="life-counter"><Heart size={11} aria-hidden="true"/><strong>{opponent.life}</strong><small>LIFE</small></div></div>
          <div className="player-name"><h2>{opponent.name}</h2></div>
          <div ref={enemyPoolRef} title="Energy pool" className={`energy-meter opponent-pool ${deathWindow&&view.active===viewer?'death-pool':''} ${energyFlights.some(f=>f.player===other(viewer))?'receiving-energy':''}`}><Zap className="pool-icon" size={17}/>{deathWindow&&view.active===viewer&&<span className="eyebrow">DEATH ENERGY</span>}<Energy pool={deathWindow&&view.active===viewer?opponent.deathEnergy:opponent.energy}/></div><div className="player-meta"><span title="Cards in hand"><BookOpen size={13}/>{opponent.handCount}</span><span title="Cards in deck"><LayersIcon/>{opponent.deckCount}</span></div><div className="piles"><LibraryCount count={opponent.deckCount}/><DiscardCount count={opponent.discard.length} top={discardTop(opponent.discard)} onOpen={()=>setPanel('discard')}/></div>
        </div>
        <div ref={boardRef} className="board-scene" style={{'--ambient':ambient} as CSSProperties} onPointerMove={e=>{if(!drag){const lane=laneAtX(e.clientX);setHoverLane(current=>current===lane?current:lane);}}} onPointerLeave={()=>setHoverLane(null)}>

          <div className="lane-bands" aria-hidden="true">{view.players[viewer].board.map((_,lane)=>{const s=slotLayout.find(x=>x.player===viewer&&x.slot===lane);if(!s)return null;const hot=(drag?laneAtX(drag.x):hoverLane)===lane;return <i key={lane} className={`${lane%2?'odd':''} ${hot?'hot':''}`} style={{left:s.x-12,width:s.width+24}}/>;})}</div>
          <div className="board-mist" aria-hidden="true"><i/><i/><i/></div>
          <Suspense fallback={<div className="board-loading">The sanctum is taking shape…</div>}><Board view={view} viewer={viewer} registry={registry} selected={selected} attacks={visibleAttacks} blocks={visibleBlocks} targets={targets} onSelect={selectBoard} onInspect={inspectBoard} onSlot={slot=>{if(live&&draft&&draft.activation===undefined&&registry.cards[view.cards[draft.cardId].definitionId].type!=='spell')beginPlay({...draft,slot});}} onHover={hoverBoard} onDragStart={startAttackDrag} onLayout={setSlotLayout} reduced={reduced} poses={posesRef} ambient={ambient}/></Suspense>
          <div className="board-light" aria-hidden="true"/>
          {banner&&<div key={banner.id} className={`turn-banner ${banner.tone}`} aria-hidden="true"><span>{banner.text}</span></div>}
          <div className="board-card-labels" aria-hidden="true">{slotLayout.map(slot=>{
            const id=view.players[slot.player].board[slot.slot],card=id?view.cards[id]:null,def=card?registry.cards[card.definitionId]:null,stats=id?effectiveStats(view,id,registry):null;
            const legal=drag?resolveDrop(view,viewer,registry,drag.cardId,{player:slot.player,slot:slot.slot}):null;
            const laneLegal=laneAt({player:slot.player,slot:slot.slot})!==null;
            const positionChoice=live&&stage==='position'&&slot.player===viewer&&selectedLegal?.slots.includes(slot.slot);
            const attackIndex=id?visibleAttacks.indexOf(id):-1,block=visibleBlocks.find(b=>b.blocker===id),blockIndex=block?visibleAttacks.indexOf(block.attacker):-1;
            const canUndo=!!id&&undoable.includes(id);
            const canChannel=!!id&&view.legal.energy.some(a=>a.cardId===id);
            const canActivate=!!id&&view.legal.activations.some(a=>a.cardId===id);
            const over=(!!dropPlay||dropLane!==null)&&dropZone?.player===slot.player&&dropZone.slot===slot.slot;
            return <div key={`${slot.player}-${slot.slot}`} data-battlefield-slot={`${slot.player}-${slot.slot}`} className={`board-card-label ${def?.legendary?'is-legendary':''} ${attackIndex>=0?'is-attacker':''} ${block?'is-blocker':''} ${canUndo?'is-channelled':''} ${card?.exhausted?'is-exhausted':''} ${legal||laneLegal||positionChoice?'drop-legal':''} ${over?'drop-over':''}`} style={{left:slot.x,top:slot.y,width:slot.width,height:slot.height}}>
              {def&&card&&stats&&<><div className={`art-card card-face-overlay ${def.legendary?'legendary-card':''} ${def.type==='bastion'?'bastion-card':''}`}><CardFace card={def} stats={{attack:stats.attack,defense:Math.max(0,stats.defense-card.damage)}} showCost={false}/></div>{attackIndex>=0?<span className="combat-role attacker-role" title={`Attacker ${attackIndex+1}`}><Swords/>Attack {attackIndex+1}</span>:block?<span className="combat-role blocker-role" title={`Blocks attacker ${blockIndex+1}`}><Shield/>Blocks {blockIndex+1}</span>:canUndo?<span className="board-status undo-status" title="Exhausted · click to undo channeling"><RotateCcw/></span>:canChannel?<span className="board-status ready-status" title={canActivate?"Ready · click to choose an action":"Ready · click to channel energy"}><Check/></span>:canActivate?<span className="board-status ready-status" title="Ready · click to activate"><Sparkles/></span>:card.exhausted&&<span className="board-status exhausted-status" title="Exhausted · can still block"><Moon/></span>}</>}
              {laneLegal&&<span className="drop-label">{id?'Attack':'Open lane'}</span>}
              {legal&&<span className="drop-label">{legal.consume?'Consume':dragDef?.type==='spell'?legal.target?'Target':'Cast':'Deploy'}</span>}
            </div>;
          })}</div>
          <CombatArrows view={view} slots={slotLayout} lanes={clash||view.combat?.stage==='death'?{}:visibleLanes} blocks={visibleBlocks} registry={registry}/>
          <div className="lane-labels" aria-hidden="true">{view.players[viewer].board.map((_,lane)=>{
            const top=slotLayout.find(s=>s.player===other(viewer)&&s.slot===lane),bottom=slotLayout.find(s=>s.player===viewer&&s.slot===lane);
            if(!top||!bottom)return null;
            const under=(drag?laneAtX(drag.x):hoverLane)===lane;
            // Lanes you could drop on keep their name so the target is clear.
            const droppable=draggingAttacker?laneAt({player:other(viewer),slot:lane})!==null:!!drag&&dragDef?.type!=='spell'&&!!resolveDrop(view,viewer,registry,drag.cardId,{player:viewer,slot:lane});
            const choosing=stage==='position'&&!!selectedLegal?.slots.includes(lane);
            return <div key={lane} className={`lane-label ${under||droppable||choosing?'shown':''}`} style={{left:bottom.x,width:bottom.width,top:"50%"}}><BoardPositionLabel slot={lane}/></div>;
          })}</div>
          <div className="board-divider"><i/><span>✦</span><i/></div>
          <div className="board-key-row enemy-keys">{opponent.board.map((id,i)=><button key={i} onFocus={()=>id&&hoverBoard(id)} onBlur={()=>hoverBoard(null)} onContextMenu={e=>{e.preventDefault();if(id)inspectBoard(id);}} onClick={e=>id&&(e.shiftKey?inspectBoard(id):selectBoard(id))} disabled={!id||!live} aria-label={`Opponent ${positionName(i)}: ${id?registry.cards[view.cards[id].definitionId].name:'empty'}`} title={`${positionName(i)} · ${id?registry.cards[view.cards[id].definitionId].name:'Empty position'}`}>{i+1}</button>)}</div>
          <div className="board-key-row own-keys">{you.board.map((id,i)=><button key={i} onFocus={()=>id&&hoverBoard(id)} onBlur={()=>hoverBoard(null)} onContextMenu={e=>{e.preventDefault();if(id)inspectBoard(id);}} onClick={e=>id?(e.shiftKey?inspectBoard(id):selectBoard(id)):draft&&live&&beginPlay({...draft,slot:i})} disabled={!live||!id&&(!draft||draft.activation!==undefined||registry.cards[view.cards[draft.cardId].definitionId].type==='spell')} aria-label={`Your ${positionName(i)}: ${id?registry.cards[view.cards[id].definitionId].name:'empty'}`} title={`${positionName(i)} · ${id?registry.cards[view.cards[id].definitionId].name:'Deploy here'}`}>{i+1}</button>)}</div>

        </div>
        <div className="player-banner own"><div className="portrait"><div className="avatar">{factionSymbol(viewer)}</div><div className="life-counter"><Heart size={11} aria-hidden="true"/><strong>{you.life}</strong><small>LIFE</small></div></div><div className="player-name">{!online&&viewer!=='p1'&&<span className="eyebrow">PLAYER TWO</span>}<h2>{you.name}</h2></div><div ref={poolRef} title="Energy pool" className={`energy-meter ${deathWindow&&view.active!==viewer?'death-pool':''} ${energyFlights.some(f=>f.player===viewer)?'receiving-energy':''}`}><Zap className="pool-icon" size={20}/>{deathWindow&&view.active!==viewer&&<span className="eyebrow">DEATH ENERGY</span>}<Energy pool={deathWindow&&view.active!==viewer?you.deathEnergy:you.energy}/></div><div className="player-meta"><span title="Deck"><LayersIcon/>{you.deckCount}</span></div><div className="piles"><LibraryCount count={you.deckCount}/><DiscardCount count={you.discard.length} top={discardTop(you.discard)} onOpen={()=>setPanel('discard')}/></div></div>
        <div className="floating-action"><div className="action-guidance"><p id="turn-guidance" role="status">{prompt}</p>{forecast&&(!thinking||view.combat?.stage==='review')&&<span className="combat-forecast" aria-label={`${forecast.blocked} blocked, ${forecast.fallen} defenders and ${forecast.attackersFallen} attackers lost, ${forecast.lifeDamage} life damage`}>{(()=>{const mine=view.active===viewer,lostOwn=mine?forecast.attackersFallen:forecast.fallen,lostFoe=mine?forecast.fallen:forecast.attackersFallen;return <>
          {forecast.blocked>0&&<i title="Blocked attackers"><Shield size={12}/>{forecast.blocked}</i>}
          {lostFoe>0&&<i className="good" title="Enemy cards destroyed"><Skull size={12}/>{lostFoe}</i>}
          {lostOwn>0&&<i className="bad" title="Your cards destroyed"><Skull size={12}/>{lostOwn}</i>}
          {forecast.lifeDamage>0&&<i className={mine?'good':'bad'} title="Life damage"><Heart size={12}/>−{forecast.lifeDamage}</i>}
        </>;})()}</span>}</div><button className={`gold-button primary-action ${thinking?'is-enemy':''}`} title={`${prompt} (Space)`} aria-describedby="turn-guidance" disabled={!(live||(thinking&&!!botGate&&!covered))||!!view.pending||!!view.outcome} onClick={mainAction}><span className="phase-orbit" aria-hidden>{[Sparkles,Swords,Moon].map((Icon,n)=><i key={n} className={`phase-bauble ${n===phaseIndex?'is-now':n<phaseIndex?'is-done':''}`} style={{['--a' as string]:`${-150+n*60}deg`}}><Icon size={13} strokeWidth={2.2}/></i>)}</span>{thinking&&!botGate?<><span className="thinking-dots">···</span>Opponent’s turn</>:<>{mainLabel}<ArrowRight size={17}/></>}</button></div>

      </section>
      {logOpen&&<BattleLog events={view.events} cards={view.cards} viewer={viewer} onClose={()=>setLogOpen(false)}/>}
    </main>
    <section className="hand-zone">{stage!=='none'&&<div className="hand-caption"><p>{stage==='consume'?'Choose what to Consume':stage==='position'?'Choose your position':'Choose your target'}</p></div>}<div className="hand-scroll" style={{['--n' as string]:view.hand.length}}>{view.hand.map((id,i)=><ArtCard detail={false} reduced={reduced} key={id} card={registry.cards[view.cards[id].definitionId]} selected={selected===id} disabled={!view.legal.playable.some(a=>a.cardId===id)} className={`hand-card ${drag?.cardId===id?'drag-source':''} ${dragEnabled&&view.legal.playable.some(a=>a.cardId===id)?'draggable':''}`} interaction={{id:`hand-${id}`,onContextMenu:e=>{e.preventDefault();pinPreview(id,e.currentTarget.getBoundingClientRect());},onPointerDown:e=>startDrag(id,e),onPointerEnter:e=>{if(e.pointerType!=='touch'&&!drag)requestPreview(id,e.currentTarget.getBoundingClientRect());},onPointerLeave:clearHoverPreview,onFocus:e=>requestPreview(id,e.currentTarget.getBoundingClientRect()),onBlur:clearHoverPreview}} onClick={()=>{if(!live||suppressClick())return;pinPreview(id,document.getElementById(`hand-${id}`)!.getBoundingClientRect());setDraft(null);setStage('none');}}/>)}{!view.hand.length&&<div className="empty-hand">No cards in hand</div>}</div></section>

    {error&&<div className="toast" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={14}/></button></div>}
    {historyIndex!==null&&<div className="replay-bar"><Eye size={16}/>Viewing command {historyIndex} of {commands.length}<button onClick={()=>setHistoryIndex(null)}>Return to live match<Play size={13}/></button></div>}
    {covered&&<div className="modal-backdrop privacy"><div className="privacy-card"><span className="brand-mark">V</span><h2>{state.players[actor].name}</h2>{state.combat?.stage==='review'?<p>Review the lanes and blockers, then confirm combat.</p>:state.combat?.stage==='death'?<p>Spend your fallen creatures’ energy.</p>:null}<button className="gold-button" onClick={()=>{setViewer(actor);setCovered(false);setSelected(null);setHovered(null);}}>Reveal my hand<Eye size={16}/></button></div></div>}
    {view.pending?.kind==='mulligan'&&!covered&&!thinking&&<div className="modal-backdrop"><div className="choice-dialog mulligan-dialog"><h2>Replace up to {view.pending.max} cards</h2><div className="choice-options mulligan-options">{view.pending.options.map(id=>{const picked=mulliganPick.includes(id),full=!picked&&mulliganPick.length>=(view.pending as {max:number}).max;return <div key={id} className={`mulligan-card ${picked?'picked':''} ${full?'locked':''}`}><ArtCard detail={false} reduced={reduced} card={registry.cards[view.cards[id].definitionId]} interaction={{id:`mull-${id}`,onPointerEnter:e=>{if(e.pointerType!=='touch')requestPreview(id,e.currentTarget.getBoundingClientRect());},onPointerLeave:clearHoverPreview,onFocus:e=>requestPreview(id,e.currentTarget.getBoundingClientRect()),onBlur:clearHoverPreview,onContextMenu:e=>{e.preventDefault();pinPreview(id,e.currentTarget.getBoundingClientRect());}}} onClick={()=>setMulliganPick(list=>picked?list.filter(x=>x!==id):full?list:[...list,id])}/><span className="mulligan-mark">{picked?'Replace':'Keep'}</span></div>;})}</div><button className="gold-button mulligan-confirm" disabled={!!online&&!live} onClick={()=>{const cardIds=mulliganPick;setMulliganPick([]);send({type:'mulligan',cardIds});}}>{mulliganPick.length?`Replace ${mulliganPick.length} ${mulliganPick.length===1?'card':'cards'}`:'Keep this hand'}<ArrowRight size={14}/></button></div></div>}
    {view.pending?.kind==='draw'&&!covered&&!thinking&&<DrawChoice reduced={reduced} cards={(view.pending.options as string[]).map(id=>({id,card:registry.cards[view.cards[id].definitionId]}))} discardCount={you.discard.length} discardTop={discardTop(you.discard)} libraryCount={you.deckCount} choose={(keep,other)=>send({type:'choose',choiceId:view.pending!.id,option:keep,other})}/>}
    {view.pending&&view.pending.kind==='death-energy'&&!covered&&!thinking&&<div className="modal-backdrop"><div className="choice-dialog"><h2>{view.pending.sourceName}: choose its energy</h2><div className="choice-options">{view.pending.options.map((pool,i)=><button className="energy-choice" key={i} onClick={()=>send({type:'choose',choiceId:view.pending!.id,option:i})}><Energy pool={pool}/><span>Choose this output<ArrowRight size={14}/></span></button>)}</div></div></div>}
    {state.outcome&&!clash&&!covered&&historyIndex===null&&<div className="modal-backdrop"><div className="result-dialog"><span className="result-mark">{state.outcome===viewer?factionSymbol(viewer):'✦'}</span><h2>{state.outcome==='draw'?'Draw':state.outcome===viewer?'Victory':'Defeat'}</h2><p>{state.outcome==='draw'?'Both sides fell in the same resolution.':state.outcomeReason==='empty-library'?`${state.players[other(state.outcome)].name} exhausted their library. ${state.players[state.outcome].name} wins.`:`${state.players[state.outcome].name} claims the battlefield.`}</p>{(online?state.outcome===viewer:state.outcome==='p1')&&rewardId&&collection.rewardedMatches.includes(rewardId)&&<div className="victory-rewards" role="status"><div><DustAmount amount={collectionRules.victoryDust}/><span><Sparkles size={18}/>+1 Realm’s Bounty booster</span></div><small>{collectionSaved?'Added to your collection.':'Available this session; browser storage could not save the reward.'}</small></div>}<div className="result-actions"><button className="outline-button" onClick={()=>navigate('menu')}>Main menu</button>{!online&&<><button className="gold-button" onClick={()=>reset(false)}>Play again<ArrowRight size={16}/></button><button className="outline-button" onClick={exportReplay}>Save replay<Download size={15}/></button><button className="text-button" onClick={()=>{setHistoryIndex(commands.length);setPanel('debug');}}>Review this match</button></>}</div></div></div>}
    {actionCard&&actionInstance&&live&&!covered&&!panel&&<div ref={actionPopoverRef} className="creature-actions" role="dialog" aria-label={`${registry.cards[actionInstance.definitionId].name} actions`} style={{...actionPosition,maxHeight:window.innerHeight-actionPosition.top-12}}><div className="creature-actions-heading"><span>{registry.cards[actionInstance.definitionId].name}</span><button aria-label="Close card actions" onClick={()=>setActionCard(null)}><X size={14}/></button></div>{creatureActions(view,actionCard,undoable,attackers,draftLanes).map((action,i)=><button autoFocus={i===0} key={i} className="inline-creature-action" onClick={()=>performCreatureAction(actionCard,action)}>{action.kind==='channel'?<><Zap size={15}/><span>Channel</span><Energy pool={action.output}/></>:action.kind==='activate'?<><Sparkles size={15}/>{cardAbilityDescriptions(registry.cards[actionInstance.definitionId])[action.ability].name}</>:action.kind==='undo-channel'?<><RotateCcw size={15}/>Undo channel</>:action.kind==='attack'?<><Swords size={15}/><span>{action.current?'Attacking':'Attack'} · {positionName(action.lane)}</span><small>{laneOccupant(action.lane)}</small></>:<><RotateCcw size={15}/>Withdraw attack</>}</button>)}<button className="inline-inspect-action" onClick={()=>inspectBoard(actionCard)}><Eye size={13}/>Inspect card</button><small>{view.combat?.stage==='declare'?'Choose a lane to attack.':'Choose an action.'}</small></div>}
    {drag&&dragDef&&<div className="drag-ghost" style={{left:drag.x,top:drag.y}}><ArtCard detail={false} card={dragDef} className="drag-card"/><span className={dropPlay||dropLane!==null?'valid':''}>{draggingAttacker?dropLane!==null?'Release to attack this lane':'Choose a highlighted lane':dropPlay?dropPlay.consume?'Release to Consume':dropPlay.target||dragDef.type==='spell'?'Release to cast':'Release to deploy':view.legal.playable.some(a=>a.cardId===drag.cardId)?'Choose a highlighted slot or target':'Needs energy or legal timing'}</span></div>}
    {preview&&previewCard&&previewDef&&!actionCard&&!drag&&!panel&&!covered&&(!view.pending||view.pending.kind==='mulligan')&&!state.outcome&&<div className="preview-anchor" aria-hidden style={{left:preview.left,top:preview.top,width:preview.right-preview.left,height:preview.bottom-preview.top}}/>}
    {preview&&previewCard&&previewDef&&!actionCard&&!drag&&!panel&&!covered&&(!view.pending||view.pending.kind==='mulligan')&&!state.outcome&&<aside ref={previewRef} className={`hover-preview ${preview.pinned?'pinned-preview':''}`} role={preview.pinned?'dialog':'tooltip'} aria-label={`${previewDef.name} preview`} style={{['--px' as string]:`${previewX}px`,['--py' as string]:`${previewY}px`,width:previewWidth,maxHeight:previewHeight}}>{preview.pinned&&<button className="preview-close" aria-label="Close card preview" onClick={closePreview}><X size={16}/></button>}<CardDetail card={previewDef} animated reduced={reduced} stats={previewStats?{...previewStats,defense:previewStats.defense-previewCard.damage}:undefined} state={previewCard.zone==='board'?<>{positionName(previewCard.slot)} · {previewCard.exhausted?'Exhausted · can still block':previewDef.type==='bastion'?`Ready · can block${previewDef.abilities.some(b=>registry.abilities[b.id].activate)?' or activate':''}`:`Ready to channel or attack${previewDef.abilities.some(b=>registry.abilities[b.id].activate)?' · can activate':''}`}{previewCard.damage>0?` · ${previewCard.damage} damage`:''}</>:undefined}></CardDetail></aside>}
    {(()=>{
      if(!tutorial||online||screen!=='match'||covered||state.outcome||historyIndex!==null)return null;
      const step=tutorialSteps[tutorialStep],progress={index:tutorialStep,total:tutorialSteps.length};
      if(actor==='p2'&&step.id!=='finish'){
        if(scriptFinished(opponentMoves(commands)))return null;
        const note=opponentNote(opponentMoves(commands));
        return <Coach tone="opponent" title={note.title} text={note.text} progress={progress} focus={botGate?['.primary-action']:[]} nudge={coachNudge} onSkip={()=>endTutorial(false)}/>;
      }
      const finish=step.id==='finish';
      return <Coach tone={finish?'finish':'player'} title={step.title} text={step.text} progress={progress} focus={step.focus?.(state)??[]} nudge={coachNudge} next={step.next} onNext={()=>finish?endTutorial(true):setTutorialStep(i=>i+1)} secondary={finish?'Main menu':undefined} onSecondary={()=>{endTutorial(true);navigate('menu');}} onSkip={()=>endTutorial(false)}/>;
    })()}
    <EnergyFlow flights={energyFlights}/><SpellCast casts={spellCasts}/><ClashLayer batches={clashBatches} board={boardRef.current} slots={slotLayout} viewer={viewer} onSkip={clash?()=>setClash(null):undefined}/>
    {panel&&<div className="panel-backdrop" onClick={()=>setPanel(null)}><section className={`side-panel `} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={panel}><div className="panel-header"><div><h2>{panel==='rules'?'Rules':panel==='settings'?'Settings':panel==='journal'?'Battle journal':panel==='discard'?'Discard piles':'Match laboratory'}</h2></div><button aria-label="Close panel" onClick={()=>setPanel(null)}><X size={20}/></button></div>
      {panel==='rules'&&<div className="rules-content">{[
        ['01','Draw & choose','Begin with five cards. Each turn, draw two and keep one; the other goes to your discard pile or under your library, as you choose. The first player skips their first draw.'],
        ['02','Build your economy','Play zero-cost creatures first. Most enter exhausted. On later turns, exhaust a ready creature to generate its printed energy. Match faction symbols to colored costs; any energy pays generic costs.'],
        ['03','Commit your assault','Enter combat, select any ready creatures, and attack as a batch. A creature cannot channel and attack in the same readiness cycle. Attackers choose a lane in the next step; unblocked attacks damage the opponent.'],
        ['04','Choose a lane','Each attacker targets its own lane or an adjacent one, and no two attackers may target the same lane. The creature or bastion in that lane blocks automatically, even when exhausted. A Guard next to the targeted lane steps in and blocks instead, even if the lane is empty. An empty lane, or a flank against Flank Evasion, lets the attack hit the player. Attacker and blocker deal their full Attack simultaneously; excess never hits the player.'],
        ['05','A final bargain','Creatures destroyed while defending leave their printed energy for eligible death-window spells. Choose one output for dual producers. Spell deaths do not generate more death energy.'],
        ['06','Ready & pass','At the end of your turn, your surviving field cards ready. Damage clears from all field cards and all energy expires. Drawing the last card in your library immediately loses the game. Discards do not recycle.']
      ].map(([n,title,copy])=><article key={n}><span>{n}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}<div className="note-box">Left Flank · Left Wing · Center · Right Wing · Right Flank. Choose a position when deploying. Cards cannot move while on the battlefield. Adjacent means one slot away in the same row; empty slots do not close the gap. Position affects an ability only when its text says so.</div><div className="note-box">Bastions occupy a field slot and deal their printed damage when blocking. They cannot attack or produce energy, including on death. Continuous effects stay active while on the field; activated abilities exhaust a ready field card during its controller’s play phase.</div><div className="note-box">Consume is an ability on specific cards. It sacrifices a friendly creature as a play cost, freeing its slot. There is no free sacrifice action.</div></div>}
      {panel==='settings'&&online&&<div className="settings-content"><p className="lead">Room {onlineState.code}. You are {onlineState.role==='host'?'the host':'the guest'}. Keep the host’s tab open.</p><p>{onlineState.message}</p>{(onlineState.role==='guest'||!onlineState.connected)&&<button className="gold-button full" onClick={()=>online.reconnect()}>Reconnect</button>}<button className="outline-button full" onClick={leaveOnline}>Leave online game</button></div>}
      {panel==='settings'&&!online&&<div className="settings-content"><label>PLAY MODE<select value={setupMode} onChange={e=>setSetupMode(e.target.value as Mode)}><option value="practice">Practice against the court</option><option value="hotseat">Two players · one device</option></select></label><label>YOUR DECK<select value={setupDeck} onChange={e=>setSetupDeck(e.target.value)}>{deckOptions.map(d=><option key={d.id} value={d.id} disabled={d.cards.length<deckRules.minimumCards}>{d.name}{d.cards.length<deckRules.minimumCards?' · unfinished':''}</option>)}</select></label><label>OPPONENT DECK<select value={setupOpponent} onChange={e=>setSetupOpponent(e.target.value)}><option value="auto">Automatic</option>{deckOptions.map(d=><option key={d.id} value={d.id} disabled={d.cards.length<deckRules.minimumCards}>{d.name}{d.cards.length<deckRules.minimumCards?' · unfinished':''}</option>)}</select></label><label>MATCH SEED<input type="number" value={seed} onChange={e=>setSeed(e.target.value)}/><small>The same seed produces the same shuffle.</small></label><button className="gold-button full" onClick={()=>reset(false,setupMode,setupDeck)}>Start a fresh match<ArrowRight size={17}/></button><button className="outline-button full" onClick={()=>reset(true,setupMode,setupDeck)}>Jump into a skirmish<SkipForward size={17}/></button><div className="setting-toggle"><div><h3>Reduced motion</h3></div><button className={`toggle ${reduced?'on':''}`} role="switch" aria-checked={reduced} aria-label="Reduced motion" onClick={()=>setReduced(!reduced)}><span/></button></div><div className="setting-toggle"><div><h3>Interaction sounds</h3></div><button className={`toggle ${sound?'on':''}`} role="switch" aria-checked={sound} aria-label="Interaction sounds" onClick={()=>setSound(!sound)}><span/></button></div><div className="match-tools"><button className="text-button" onClick={()=>setPanel('rules')}><CircleHelp size={15}/>How to play</button><button className="text-button" onClick={()=>setPanel('journal')}><ScrollText size={15}/>Battle journal</button><button className="text-button" onClick={()=>setPanel('debug')}><Terminal size={15}/>Match laboratory</button></div><button className="text-button" onClick={exportReplay}><Download size={14}/>Export replay</button><label className="import-label">Import replay<input type="file" accept=".json" onChange={e=>e.target.files?.[0]&&void importReplay(e.target.files[0])}/></label></div>}
      {panel==='discard'&&<div className="discard-content">{[viewer,other(viewer)].map(owner=><section key={owner}><h3>{view.players[owner].name} <small>{view.players[owner].discard.length} {view.players[owner].discard.length===1?'card':'cards'}</small></h3>{view.players[owner].discard.length?<div className="codex-grid">{[...view.players[owner].discard].reverse().map(id=><article key={id}><ArtCard reduced card={registry.cards[view.cards[id].definitionId]}/></article>)}</div>:<p className="empty-pile">Nothing here yet.</p>}</section>)}</div>}
      {panel==='journal'&&<div className="journal-content"><div className="discard-summary">{(['p1','p2'] as PlayerId[]).map(p=><div key={p}><h3>{view.players[p].name}</h3><p className="journal-counts">{view.players[p].handCount} in hand · {view.players[p].deckCount} in deck</p><span className="eyebrow">DISCARD · {view.players[p].discard.length}</span>{view.players[p].discard.map(id=><p key={id}>{registry.cards[view.cards[id].definitionId].name}</p>)}</div>)}</div><h3>Match events</h3><ol className="event-list">{[...view.events].reverse().map(e=><li key={e.seq}><span>{String(e.seq).padStart(3,'0')}</span><p>{e.message}</p></li>)}</ol></div>}
      {panel==='debug'&&<div className="debug-content"><div className="debug-metrics"><span>Revision<b>{view.revision}</b></span><span>Commands<b>{commands.length}</b></span><span>Seed<b>{initial.seed}</b></span></div><label>TIME TRAVEL<input type="range" min={0} max={commands.length} value={historyIndex??commands.length} onChange={e=>{setHistoryIndex(Number(e.target.value));setSelected(null);}}/></label><div className="debug-actions"><button className="outline-button" onClick={()=>setHistoryIndex(null)}>Return to live</button><button className="outline-button" onClick={exportReplay}>Export replay<Download size={14}/></button></div><details><summary>Player projection</summary><pre>{JSON.stringify(view,null,2)}</pre></details><h3>Accepted commands</h3><ol className="command-list">{commands.map((e,i)=><li key={i}><button onClick={()=>setHistoryIndex(i+1)}><span>{i+1}</span><b>{e.actor}</b>{e.command.type}<ChevronRight size={13}/></button></li>)}</ol></div>}
    </section></div>}
  </div>;
}
function LayersIcon(){return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 5l6-3 6 3-6 3Zm0 3l6 3 6-3M2 11l6 3 6-3"/></svg>;}
