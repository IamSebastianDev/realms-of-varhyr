import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Link, Radio, Users } from 'lucide-react';
import { registry } from '../../../../packages/content/src';
import { validateDeck } from '../../../../packages/core/src';
import { missingDeckCopies } from '../collection';
import { useCollection } from '../collectionStore';
import { RtcRoom, normalizeRoomCode, validRoomCode } from './RtcRoom';
import { useRoom } from './useRoom';

type DeckChoice={id:string;name:string;cards:string[]};
export function MultiplayerLobby({decks,selected,onStart,compact=false,onSelectDeck}:{decks:DeckChoice[];selected:string;onStart:(room:RtcRoom)=>void;compact?:boolean;onSelectDeck?:(id:string)=>void}){
  const {collection}=useCollection();
  const [deckId,setDeckId]=useState(selected),[name,setName]=useState(()=>{try{return localStorage.getItem('varhyr-player-name')||'Wanderer';}catch{return 'Wanderer';}});
  const [code,setCode]=useState(''),[room,setRoom]=useState<RtcRoom|null>(null),[creating,setCreating]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const state=useRoom(room),roomRef=useRef<RtcRoom|null>(null),handedOff=useRef(false),mounted=useRef(true);
  const chosen=decks.find(deck=>deck.id===deckId);
  const errors=chosen?[...validateDeck(chosen.cards,registry),...(missingDeckCopies(chosen.cards,collection.counts).length?['You do not own all copies in this deck.']:[])]:['Choose a deck.'];
  const ready=!errors.length&&!!name.trim()&&!creating;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(!handedOff.current)roomRef.current?.leave();};},[]);
  useEffect(()=>{if(room&&state.snapshot&&!handedOff.current){handedOff.current=true;onStart(room);}},[room,state.snapshot,onStart]);
  async function connect(role:'host'|'guest'){
    if(!ready||!chosen)return;setCreating(true);setError('');
    try{
      try{localStorage.setItem('varhyr-player-name',name.trim());}catch{/* Name storage is optional. */}
      const next=role==='host'?await RtcRoom.host(name.trim(),chosen):await RtcRoom.join(code,name.trim(),chosen);
      if(!mounted.current){next.leave();return;}
      roomRef.current=next;setRoom(next);
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Could not create the room.');}
    finally{if(mounted.current)setCreating(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(state.code);setCopied(true);}catch{setError('Select the room code and copy it with your keyboard.');}}
  function cancel(){room?.leave();roomRef.current=null;setRoom(null);setCopied(false);setError('');}
  return <div className={`multiplayer-page ${compact?'multiplayer-compact':''}`}>
    {!compact&&<div className="multiplayer-intro"><span className="eyebrow">TWO BROWSERS. ONE BATTLEFIELD.</span><h1>Across the realm.</h1><p>Bring your own deck. Share a room code. Play a friend.</p></div>}
    {!room?<>
      <div className="multiplayer-setup"><label>Your name<input aria-label="Online player name" value={name} maxLength={40} onChange={event=>setName(event.target.value)}/></label><label>Your deck<select aria-label="Online deck" value={deckId} onChange={event=>{setDeckId(event.target.value);onSelectDeck?.(event.target.value);}}>{decks.map(deck=><option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label></div>
      {!!errors.length&&<p className="online-error" role="status">{errors[0]}</p>}
      <div className="multiplayer-choices"><section><div className="online-choice-icon"><Radio size={29}/></div><h2>{compact?'Host a game':'Raise your banner.'}</h2>{!compact&&<p>Create a room and send its code to your opponent. You take the first turn.</p>}<button className="gold-button" disabled={!ready} onClick={()=>void connect('host')}><Radio size={16}/>{creating?'Connecting…':'Host game'}</button></section>
        <section><div className="online-choice-icon"><Link size={29}/></div><h2>{compact?'Join a game':'Answer the call.'}</h2>{!compact&&<p>Enter your friend’s room code to join their battlefield.</p>}<div className="online-join-controls"><label className="online-code-input"><span className="sr-only">Room code</span><input aria-label="Room code" placeholder="ABCD EFGH" value={code} maxLength={18} onChange={event=>setCode(normalizeRoomCode(event.target.value))} spellCheck={false} autoComplete="off"/></label><button className="gold-button" disabled={!ready||!validRoomCode(code)} onClick={()=>void connect('guest')}><Users size={16}/>Join game</button></div></section></div>
    </>:<section className="online-waiting"><div className="online-choice-icon"><Radio size={32}/></div><span className="eyebrow">{state.role==='host'?'YOUR ROOM':'JOINING ROOM'}</span><div className="online-room-code" aria-label={`Room ${state.code}`}>{state.code.slice(0,4)} <span>{state.code.slice(4)}</span></div><p role="status">{state.message}</p><div className="online-room-actions">{state.role==='host'&&<button className="gold-button" disabled={state.phase==='connecting'||state.phase==='error'} onClick={()=>void copy()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy code'}</button>}{(state.phase==='disconnected'||state.phase==='error')&&<button className="outline-button" onClick={()=>room.reconnect()}>Reconnect</button>}<button className="text-button" onClick={cancel}><ArrowLeft size={15}/>Back</button></div>{state.role==='host'&&<small>Keep this tab open.</small>}</section>}
    {error&&<p className="online-error" role="alert">{error}</p>}
    {!compact&&<p className="online-footnote">A free room service introduces the browsers. The match runs directly between them over WebRTC.</p>}
  </div>;
}
