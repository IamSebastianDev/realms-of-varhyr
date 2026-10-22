import { useSyncExternalStore } from 'react';
import type { DataConnection, Peer, PeerOptions } from 'peerjs';
import { registry } from '../../../../../packages/content/src';
import { presetById, type DraftPreset } from '../../../../../packages/draft/src';
import { DraftTableHost, TableClient, type TableRoomState } from '../../../../../packages/multiplayer/src/draftRoom';
import { NETWORK_VERSION } from '../../../../../packages/multiplayer/src/protocol';
import { getProfile } from '../../profile';
import { newRoomCode, normalizeRoomCode, validRoomCode } from '../../multiplayer/RtcRoom';
import { readDraftRun, saveDraftRun } from '../draftStore';

const peerId = (code: string) => `varhyr-draft2-v${NETWORK_VERSION}-${code}`;
const tokenKey = (code: string) => `varhyr-draft-seat-v1:${code}`;
/** The same person gets the same seat back after a reload, because the token stays in this browser. */
function seatToken(code: string, fresh = false) {
  try { const saved = !fresh && localStorage.getItem(tokenKey(code)); if (saved) return saved; const token = crypto.randomUUID(); localStorage.setItem(tokenKey(code), token); return token; }
  catch { return crypto.randomUUID(); }
}
async function openPeer(id?: string): Promise<Peer> {
  const { Peer: PeerClass } = await import('peerjs');
  const options: PeerOptions = { debug: 0 };
  if (import.meta.env.VITE_PEER_HOST) Object.assign(options, { host: import.meta.env.VITE_PEER_HOST, port: Number(import.meta.env.VITE_PEER_PORT) || 443, path: import.meta.env.VITE_PEER_PATH || '/', secure: import.meta.env.VITE_PEER_SECURE !== 'false' });
  if (import.meta.env.VITE_RTC_ICE_SERVERS) options.config = { iceServers: JSON.parse(import.meta.env.VITE_RTC_ICE_SERVERS) };
  return id ? new PeerClass(id, options) : new PeerClass(options);
}
const describe = (type: string) => type === 'peer-unavailable' ? 'Room not found. Check the code and keep the host’s tab open.'
  : type === 'unavailable-id' ? 'This room code is already in use.' : type === 'browser-incompatible' ? 'This browser does not support WebRTC data connections.'
  : type === 'webrtc' ? 'The browsers could not connect. Try another network.' : 'Connection interrupted. Try reconnecting.';

/**
 * A draft table over WebRTC, with the room service only introducing the browsers. The host's browser runs the table (`hub`),
 * guests only talk to it. Either way the page works with `client`.
 */
export class PeerTable {
  readonly client: TableClient;
  readonly hub: DraftTableHost | null;
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private closed = false;
  private constructor(readonly code: string, readonly role: 'host' | 'guest', private token: string, readonly preset: DraftPreset | null, readonly faction: string | null = null) {
    this.client = new TableClient(role, code, registry);
    this.hub = role === 'host' ? new DraftTableHost({ registry, preset: preset!, code, faction: faction! }, token) : null;
    // The saved run follows what the table says, so the overview and a reload see the same thing as the draft screens.
    this.client.subscribe(() => {
      const run = this.client.getSnapshot().run, saved = run && readDraftRun(run.preset);
      // Never overwrite a different run of the same named draft; joining is refused for that case before it gets here.
      if (run && (!saved || saved.id === run.id || saved.stage === 'finished')) saveDraftRun(run.preset, run);
    });
  }
  private get profile() { const profile = getProfile(); return { token: this.token, name: profile.name || 'Player', avatar: profile.avatar }; }

  static async host(preset: DraftPreset, faction: string) {
    const room = new PeerTable(newRoomCode(), 'host', crypto.randomUUID(), preset, faction);
    room.peer = await openPeer(peerId(room.code));
    const peer = room.peer;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The room service is not responding. Try again in a moment.')), 18000);
      peer.on('open', () => { clearTimeout(timer); resolve(); });
      peer.on('error', error => { clearTimeout(timer); reject(new Error(describe(error.type))); });
    });
    peer.on('connection', connection => {
      let handler: ReturnType<DraftTableHost['accept']> | null = null;
      connection.on('open', () => {
        handler = room.hub!.accept({ send: message => { if (connection.open) connection.send(message); }, close: () => connection.close() });
      });
      connection.on('data', input => handler?.receive(input));
      connection.on('close', () => handler?.closed());
      connection.on('error', () => handler?.closed());
    });
    peer.on('disconnected', () => { if (!room.closed) setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1500); });
    room.hub!.connectLocal(room.client, room.profile);
    return room;
  }

  static async join(code: string) {
    const normalized = normalizeRoomCode(code);
    if (!validRoomCode(normalized)) throw new Error('Enter the eight-character room code.');
    const room = new PeerTable(normalized, 'guest', seatToken(normalized), null);
    await room.connect();
    return room;
  }
  /** Joins (or rejoins) the host. The first call also opens this browser's end of the room service. */
  async connect() {
    if (this.role !== 'guest' || this.closed) return;
    this.peer ??= await openPeer();
    const peer = this.peer;
    if (!peer.open) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The room service is not responding. Try again in a moment.')), 18000);
      peer.on('open', () => { clearTimeout(timer); resolve(); });
      peer.on('error', error => { clearTimeout(timer); reject(new Error(describe(error.type))); });
    });
    this.connection?.close();
    const connection = peer.connect(peerId(this.code), { reliable: true, serialization: 'binary', label: 'varhyr-draft' });
    this.connection = connection;
    const timer = setTimeout(() => { if (!this.client.getSnapshot().connected) { connection.close(); this.client.fail('Could not reach the host. Check the code and the host’s tab.'); } }, 20000);
    connection.on('open', () => { this.client.attach(message => { if (connection.open) connection.send(message); }); this.client.hello(this.profile); });
    connection.on('data', input => { clearTimeout(timer); this.client.receive(input); });
    connection.on('close', () => { clearTimeout(timer); if (connection === this.connection) this.client.lost('Disconnected from the table. Reconnect to carry on.'); });
    peer.on('error', error => { if (!this.client.getSnapshot().connected) this.client.fail(describe(error.type)); });
  }
  reconnect() { if (this.role === 'guest') void this.connect(); }
  /** Ends this browser's part. The host's room closes for everyone. */
  close(message = 'The room was closed.') {
    if (this.closed) return;
    this.closed = true;
    if (this.role === 'host') this.hub?.close(message);
    this.peer?.destroy(); this.connection = null;
  }
  get ended() { return this.closed; }
  static presetOf(room: PeerTable | null) { return room?.preset ?? presetById(room?.client.getSnapshot().preset ?? '') ?? null; }
}

/** One table at a time. It outlives the page that opened it, so the draft screens, the overview and a live match all use the same one. */
let current: PeerTable | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
export const activeTable = () => current;
export function setActiveTable(next: PeerTable | null) { if (current && current !== next) current.close(); current = next; notify(); }
export const useActiveTable = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => null);
const emptyState: TableRoomState = { role: 'guest', code: '', seat: null, phase: 'closed', connected: false, message: '', preset: null, faction: null, lobby: [], run: null, waiting: [], mine: false, deadline: null, matches: {} };
export const useTableState = (room: PeerTable | null): TableRoomState => useSyncExternalStore(room?.client.subscribe ?? (() => () => undefined), room?.client.getSnapshot ?? (() => emptyState), () => emptyState);
