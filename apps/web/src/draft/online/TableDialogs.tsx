import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, Link2, UserRound } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../../packages/ui/src/i18n';
import { presetById, type DraftPreset } from '../../../../../packages/draft/src';
import type { LobbySeat } from '../../../../../packages/multiplayer/src/draftRoom';
import { BuilderDialog } from '../../BuilderDialog';
import { CrownAmount } from '../../Crowns';
import { updateCollection, useCollection } from '../../collectionStore';
import { randomSeed } from '../../session';
import { payEntryOnce } from './entry';
import { PeerTable, setActiveTable, useActiveTable, useTableState } from './PeerTable';
import { useDraftRun } from '../draftStore';

/** Who sits at the table: names, who is ready, and which seats a bot will take. */
function Seats({ lobby, you }: { lobby: LobbySeat[]; you: number | null }) {
  return <ul className="table-seats" aria-label={msg("Seats")}>{[0, 1, 2].map(index => {
    const seat = lobby[index];
    const person = !!seat?.human && !!seat.name;
    return <li key={index} className={`${person ? 'is-person' : 'is-bot'} ${seat?.present === false && person ? 'is-away' : ''}`}>
      {person ? <UserRound size={18}/> : <Bot size={18}/>}
      <span><b>{person ? seat!.name : msg("A bot takes this seat")}</b>{index === you ? <em>{msg("You")}</em> : index === 0 ? <em>{msg("Host")}</em> : null}</span>
      {person && <small>{seat!.present ? (seat!.ready ? msg("Ready") : msg("Joined")) : msg("Away")}</small>}
    </li>;
  })}</ul>;
}

/** The host's side: a room code to share, who has joined, and the start button. Empty seats are played by bots. */
export function HostTableDialog({ preset, origin, close }: { preset: DraftPreset; origin: HTMLElement | null; close: () => void }) {
  useLanguage();
  const { collection } = useCollection();
  const [room, setRoom] = useState<PeerTable | null>(null), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const state = useTableState(room);
  const created = useRef(false);
  useEffect(() => {
    if (created.current) return; created.current = true;
    PeerTable.host(preset).then(next => { setActiveTable(next); setRoom(next); }).catch(cause => setError(cause instanceof Error ? msg(cause.message) : msg("Could not create the room.")));
  }, [preset]);
  // The table has started: the draft screens take over.
  useEffect(() => { if (state.phase === 'table') close(); }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => { setActiveTable(null); close(); };
  const copy = async () => { try { await navigator.clipboard.writeText(state.code); setCopied(true); } catch { setError(msg("Select the room code and copy it with your keyboard.")); } };
  const canPay = collection.crowns >= preset.entryFee;
  const ready = !!room?.hub?.canStart && canPay;
  function start() {
    if (!room?.hub) return;
    const id = crypto.randomUUID();
    if (!payEntryOnce(id, preset)) { setError(msg("Entering costs {v0} crowns.", { v0: preset.entryFee })); return; }
    try { room.hub.start(randomSeed(), id); setError(''); }
    catch (cause) { updateCollection(current => ({ ...current, crowns: current.crowns + preset.entryFee })); setError(cause instanceof Error ? msg(cause.message) : msg("Could not start the draft.")); }
  }
  return <BuilderDialog title={msg("Invite to draft")} origin={origin} close={cancel}>
    {!room && !error && <p role="status">{msg("Opening a room…")}</p>}
    {room && <>
      <p>{msg("Share this code with up to two friends. Empty seats are played by bots.")}</p>
      <div className="table-code"><code aria-label={msg("Room code")}>{state.code}</code><button className="outline-button" onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? msg("Copied") : msg("Copy")}</button></div>
      <Seats lobby={state.lobby} you={0}/>
      <p>{msg("Everyone pays {v0} crowns when the draft starts and is paid for their own wins. You have {v1}.", { v0: preset.entryFee, v1: collection.crowns })}</p>
    </>}
    {error && <p className="builder-dialog-error" role="alert">{error}</p>}
    <div className="builder-dialog-actions"><button className="outline-button" onClick={cancel}>{msg("Cancel")}</button>
      <button className="gold-button" data-autofocus disabled={!ready} title={!canPay ? msg("Entering costs {v0} crowns.", { v0: preset.entryFee }) : !room?.hub?.canStart ? msg("Wait until everyone is ready.") : undefined} onClick={start}><span>{msg("Pay {v0} and start", { v0: preset.entryFee })}</span></button></div>
  </BuilderDialog>;
}

/** A guest's side: enter the host's code, sit down, and wait for the start. The entry fee is taken when the host starts. */
export function JoinTableDialog({ origin, close, started }: { origin: HTMLElement | null; close: () => void; started: (preset: string) => void }) {
  useLanguage();
  const { collection } = useCollection();
  const table = useActiveTable();
  const state = useTableState(table?.role === 'guest' ? table : null);
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const preset = presetById(state.preset ?? '');
  const existing = useDraftRun(preset?.id ?? ''), blocked = !!existing && existing.stage !== 'finished' && !existing.table;
  async function join() {
    setBusy(true); setError('');
    try { setActiveTable(await PeerTable.join(code)); } catch (cause) { setError(cause instanceof Error ? msg(cause.message) : msg("Could not join the room.")); }
    setBusy(false);
  }
  // The host started: pay the entry once, then the draft begins. Without the crowns, leave the table rather than sit in it for free.
  useEffect(() => {
    if (state.phase !== 'table' || !state.run || !preset) return;
    if (payEntryOnce(state.run.id, preset)) started(preset.id);
    else { table?.client.leave(); setActiveTable(null); setError(msg("Entering costs {v0} crowns.", { v0: preset.entryFee })); }
  }, [state.phase, state.run?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = () => { table?.client.leave(); setActiveTable(null); close(); };
  const inLobby = state.phase === 'lobby' && !!preset, mine = state.seat !== null ? state.lobby[state.seat] : undefined;
  return <BuilderDialog title={msg("Join a draft table")} origin={origin} close={inLobby ? leave : close}>
    {!inLobby ? <>
      <p>{msg("Enter the eight-character room code your host shared.")}</p>
      <label className="table-code-field"><Link2 size={16}/><input value={code} maxLength={9} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-2345" aria-label={msg("Room code")}
        onChange={event => setCode(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter' && code && !busy) void join(); }}/></label>
      {state.phase === 'error' && <p className="builder-dialog-error" role="alert">{msg(state.message)}</p>}
    </> : <>
      <p>{msg("You are at {v0}'s table for the {v1} draft. Entering costs {v2} crowns, paid when the host starts. You have {v3}.", { v0: state.lobby[0]?.name ?? '', v1: msg(preset!.name), v2: preset!.entryFee, v3: collection.crowns })}</p>
      <Seats lobby={state.lobby} you={state.seat}/>
      <p role="status">{blocked ? msg("You already have a run of this draft. Finish or end it first.") : mine?.ready ? msg("Waiting for the host to start.") : msg("Press ready when you want to play.")}</p>
    </>}
    {error && <p className="builder-dialog-error" role="alert">{error}</p>}
    <div className="builder-dialog-actions"><button className="outline-button" onClick={inLobby ? leave : close}>{inLobby ? msg("Leave table") : msg("Cancel")}</button>
      {inLobby
        ? <button className="gold-button" data-autofocus disabled={(collection.crowns < preset!.entryFee || blocked) && !mine?.ready} onClick={() => table?.client.ready(!mine?.ready)}><span>{mine?.ready ? msg("Not ready") : msg("Ready")}</span></button>
        : <button className="gold-button" data-autofocus disabled={!code || busy} onClick={() => void join()}><span>{busy ? msg("Connecting…") : msg("Join")}</span></button>}
    </div>
  </BuilderDialog>;
}
