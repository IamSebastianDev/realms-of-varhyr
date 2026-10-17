import { resolveCardBack } from '../cardBackStore';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { updateProfile } from '../profile';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Link, Radio, Users } from 'lucide-react';
import { registry } from '../../../../packages/content/src';
import { validateDeck } from '../../../../packages/core/src';
import { missingDeckCopies } from '../collection';
import { useCollection } from '../collectionStore';
import { RtcRoom, normalizeRoomCode, validRoomCode } from './RtcRoom';
import { useRoom } from './useRoom';
import { LiveMatchSession } from '../match/MatchSession';

type DeckChoice={id:string;name:string;cards:string[];back?:string};
export function MultiplayerLobby({decks,selected,onStart,compact=false,onSelectDeck}:{decks:DeckChoice[];selected:string;onStart:(session:LiveMatchSession)=>void;compact?:boolean;onSelectDeck?:(id:string)=>void}){
  useLanguage();
  const {collection}=useCollection();
  const [deckId,setDeckId]=useState(selected),[name,setName]=useState(()=>{try{return localStorage.getItem('varhyr-player-name')||msg("Wanderer");}catch{return msg("Wanderer");}});
  const [code,setCode]=useState(''),[room,setRoom]=useState<RtcRoom|null>(null),[creating,setCreating]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const state=useRoom(room),roomRef=useRef<RtcRoom|null>(null),handedOff=useRef(false),mounted=useRef(true);
  const chosen=decks.find(deck=>deck.id===deckId);
  const errors=chosen?[...validateDeck(chosen.cards,registry),...(missingDeckCopies(chosen.cards,collection.counts).length?[msg("You do not own all copies in this deck.")]:[])]:[msg("Choose a deck.")];
  const ready=!errors.length&&!!name.trim()&&!creating;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(!handedOff.current)roomRef.current?.leave();};},[]);
  useEffect(()=>{if(room&&state.snapshot&&!handedOff.current){handedOff.current=true;onStart(new LiveMatchSession(room));}},[room,state.snapshot,onStart]);
  async function connect(role:'host'|'guest'){
    if(!ready||!chosen)return;setCreating(true);setError('');
    try{
      updateProfile({name});
      const next=role==='host'?await RtcRoom.host(name.trim(),chosen,resolveCardBack(chosen.back)):await RtcRoom.join(code,name.trim(),chosen,resolveCardBack(chosen.back));
      if(!mounted.current){next.leave();return;}
      roomRef.current=next;setRoom(next);
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:msg("Could not create the room."));}
    finally{if(mounted.current)setCreating(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(state.code);setCopied(true);}catch{setError(msg("Select the room code and copy it with your keyboard."));}}
  function cancel(){room?.leave();roomRef.current=null;setRoom(null);setCopied(false);setError('');}
  return <div className={`multiplayer-page ${compact?'multiplayer-compact':''}`}>
    {!compact&&<div className="multiplayer-intro"><span className="eyebrow">{msg("TWO BROWSERS. ONE BATTLEFIELD.")}</span><h1>{msg("Across the realm.")}</h1><p>{msg("Bring your own deck. Share a room code. Play a friend.")}</p></div>}
    {!room?<>
      <div className="multiplayer-setup"><label>{msg("Your name")}<input aria-label={msg("Online player name")} value={name} maxLength={40} onChange={event=>setName(event.target.value)}/></label><label>{msg("Your deck")}<select aria-label={msg("Online deck")} value={deckId} onChange={event=>{setDeckId(event.target.value);onSelectDeck?.(event.target.value);}}>{decks.map(deck=><option key={deck.id} value={deck.id}>{msg(deck.name)}</option>)}</select></label></div>
      {!!errors.length&&<p className="online-error" role="status">{msg(errors[0])}</p>}
      <div className="multiplayer-choices"><section><div className="online-choice-icon"><Radio size={29}/></div><h2>{compact?msg("Host a game"):msg("Raise your banner.")}</h2>{!compact&&<p>{msg("Create a room and send its code to your opponent. You take the first turn.")}</p>}<button className="gold-button" disabled={!ready} onClick={()=>void connect('host')}><Radio size={16}/>{creating?msg("Connecting…"):msg("Host game")}</button></section>
        <section><div className="online-choice-icon"><Link size={29}/></div><h2>{compact?msg("Join a game"):msg("Answer the call.")}</h2>{!compact&&<p>{msg("Enter your friend’s room code to join their battlefield.")}</p>}<div className="online-join-controls"><label className="online-code-input"><span className="sr-only">{msg("Room code")}</span><input aria-label={msg("Room code")} placeholder={msg("ABCD EFGH")} value={code} maxLength={18} onChange={event=>setCode(normalizeRoomCode(event.target.value))} spellCheck={false} autoComplete="off"/></label><button className="gold-button" disabled={!ready||!validRoomCode(code)} onClick={()=>void connect('guest')}><Users size={16}/>{msg("Join game")}</button></div></section></div>
    </>:<section className="online-waiting"><div className="online-choice-icon"><Radio size={32}/></div><span className="eyebrow">{state.role==='host'?msg("YOUR ROOM"):msg("JOINING ROOM")}</span><div className="online-room-code" aria-label={msg("Room {v0}", {v0: state.code})}>{state.code.slice(0,4)} <span>{state.code.slice(4)}</span></div><p role="status">{msg(state.message)}</p><div className="online-room-actions">{state.role==='host'&&<button className="gold-button" disabled={state.phase==='connecting'||state.phase==='error'} onClick={()=>void copy()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?msg("Copied"):msg("Copy code")}</button>}{(state.phase==='disconnected'||state.phase==='error')&&<button className="outline-button" onClick={()=>room.reconnect()}>{msg("Reconnect")}</button>}<button className="text-button" onClick={cancel}><ArrowLeft size={15}/>{msg("Back")}</button></div>{state.role==='host'&&<small>{msg("Keep this tab open.")}</small>}</section>}
    {error&&<p className="online-error" role="alert">{msg(error)}</p>}
    {!compact&&<p className="online-footnote">{msg("A free room service introduces the browsers. The match runs directly between them over WebRTC.")}</p>}
  </div>;
}
