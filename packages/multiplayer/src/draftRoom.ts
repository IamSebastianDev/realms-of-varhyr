import * as v from 'valibot';
import type { Command, PlayerId, Registry } from '../../contracts/src';
import { RULES_VERSION } from '../../core/src';
import { botNamesFor, draftRules, parseRun, type DraftPreset, type DraftResult, type DraftRun } from '../../draft/src';
import {
  autoDeckAll, autoPickAll, botSeat, createTable, deckWaitingOn, leaveSeat, recordTableResult, submitDeck, submitFaction, submitPick, tableComplete, viewFor, waitingOn,
  type DraftTable,
} from '../../draft/src/table';
import { MatchAuthority } from './authority';
import {
  NETWORK_VERSION, joinSchema, parseClientMessage, parseHostMessage,
  type AttackPreview, type ClientMessage, type Forecast, type HostMessage, type Join, type MatchAction, type MatchSnapshot,
} from './protocol';

/**
 * The faction draft with other people. One room hosts a table of three seats. The host's browser is the authority, as for a two-player
 * match: it runs the draft for every seat, builds the bots' decks and runs the live matches between people. Guests only send what they
 * choose and show what they are told. Nothing here touches a socket or the DOM: a link is anything that can send and close.
 */
export interface TableLink { send(message: unknown): void; close(): void }
export type TableClock = { now(): number; setTimeout(callback: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
const realClock: TableClock = { now: () => Date.now(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) };

export type LobbySeat = { name: string; human: boolean; ready: boolean; present: boolean; host: boolean };
export type TableClientMessage =
  | Join
  | { type: 'ready'; ready: boolean }
  | { type: 'pick'; card: string }
  | { type: 'faction'; faction: string }
  | { type: 'deck'; cards: string[] }
  | { type: 'result'; index: number; result: DraftResult }
  | { type: 'leave' }
  | { type: 'match-join'; index: number }
  | { type: 'match'; index: number; message: ClientMessage }
  | { type: 'pong' };
export type TableHostMessage =
  | { type: 'lobby'; lobby: LobbySeat[]; seat: number; code: string; preset: string; /** The faction the table drafts first. */ faction: string }
  | { type: 'table'; run: DraftRun; waiting: string[]; /** Whether you are one of the people the table waits for. */ mine: boolean; /** Milliseconds left for the current pick or deck. */ remaining: number | null; lobby: LobbySeat[] }
  | { type: 'match'; index: number; message: HostMessage }
  | { type: 'reject'; message: string }
  | { type: 'closed'; message: string }
  | { type: 'ping' };

const text = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const index = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20));
export function parseTableClientMessage(input: unknown): TableClientMessage {
  if (!input || typeof input !== 'object') throw new Error('Invalid table message.');
  const type = (input as { type?: unknown }).type;
  switch (type) {
    case 'join': return v.parse(joinSchema, input);
    case 'ready': return v.parse(v.object({ type: v.literal('ready'), ready: v.boolean() }), input);
    case 'pick': return v.parse(v.object({ type: v.literal('pick'), card: text }), input);
    case 'faction': return v.parse(v.object({ type: v.literal('faction'), faction: text }), input);
    case 'deck': return v.parse(v.object({ type: v.literal('deck'), cards: v.pipe(v.array(text), v.maxLength(200)) }), input);
    case 'result': return v.parse(v.object({ type: v.literal('result'), index, result: v.picklist(['won', 'lost', 'draw']) }), input);
    case 'leave': return { type: 'leave' };
    case 'pong': return { type: 'pong' };
    case 'match-join': return v.parse(v.object({ type: v.literal('match-join'), index }), input);
    case 'match': {
      const { index: at, message } = v.parse(v.object({ type: v.literal('match'), index, message: v.unknown() }), input);
      const parsed = parseClientMessage(message);
      if (parsed.type !== 'action' && parsed.type !== 'preview') throw new Error('Unknown match message.');
      return { type: 'match', index: at, message: parsed };
    }
    default: throw new Error('Unknown table message.');
  }
}
const lobbySchema = v.array(v.object({ name: v.string(), human: v.boolean(), ready: v.boolean(), present: v.boolean(), host: v.boolean() }));
export function parseTableHostMessage(input: unknown): TableHostMessage {
  if (!input || typeof input !== 'object') throw new Error('Invalid host message.');
  const message = input as Record<string, unknown>;
  switch (message.type) {
    case 'ping': return { type: 'ping' };
    case 'lobby': return { type: 'lobby', lobby: v.parse(lobbySchema, message.lobby), seat: v.parse(index, message.seat), code: v.parse(text, message.code), preset: v.parse(text, message.preset), faction: v.parse(text, message.faction) };
    case 'table': {
      const run = parseRun(message.run);
      if (!run?.table) throw new Error('The host sent a draft this browser cannot read.');
      return { type: 'table', run, waiting: v.parse(v.array(v.string()), message.waiting), mine: v.parse(v.boolean(), message.mine), remaining: v.parse(v.nullable(v.number()), message.remaining), lobby: v.parse(lobbySchema, message.lobby) };
    }
    case 'match': return { type: 'match', index: v.parse(index, message.index), message: parseHostMessage(message.message) };
    case 'reject': return { type: 'reject', message: v.parse(v.string(), message.message) };
    case 'closed': return { type: 'closed', message: v.parse(v.string(), message.message) };
    default: throw new Error('Unknown host message.');
  }
}

export type HostOptions = {
  registry: Registry; preset: DraftPreset; code: string;
  /** The faction the table drafts first. */
  faction: string;
  /** How long a person has for each pick, and for building their deck. */
  pickMs?: number; deckMs?: number;
  /** How long a person can be away before a bot takes their seat for good. */
  awayMs?: number;
  clock?: TableClock;
};
type Slot = { token: string; name: string; avatar?: string; cardBack?: string; ready: boolean; link: TableLink | null; away?: unknown };
type Live = { authority: MatchAuthority | null; joined: Set<number> };
const playerOf = (table: DraftTable, index: number, seat: number): PlayerId => table.matches[index]!.a === seat ? 'p1' : 'p2';

export class DraftTableHost {
  private slots: (Slot | null)[] = [null, null, null];
  private table: DraftTable | null = null;
  private live = new Map<number, Live>();
  private clock: TableClock;
  private deadline: number | null = null;
  private timerKey = '';
  private timer: unknown = null;
  private closed = false;
  private pickMs: number; private deckMs: number; private awayMs: number;
  constructor(private options: HostOptions, hostToken: string) {
    this.slots[0] = { token: hostToken, name: '', ready: true, link: null };
    this.clock = options.clock ?? realClock;
    this.pickMs = options.pickMs ?? 45_000; this.deckMs = options.deckMs ?? 300_000; this.awayMs = options.awayMs ?? 120_000;
  }

  get started() { return !!this.table; }
  /** What the host's own browser may inspect, for tests and for the host's start button. */
  get state() { return this.table; }
  private lobby(): LobbySeat[] {
    const table = this.table;
    return this.slots.map((slot, seat) => table
      ? { name: table.seats[seat]!.name, human: table.seats[seat]!.human, ready: true, present: !!slot?.link && !table.seats[seat]!.left, host: seat === 0 }
      : { name: slot?.name ?? '', human: !!slot, ready: seat === 0 || !!slot?.ready, present: !!slot?.link, host: seat === 0 });
  }
  /** Hosts may start when every guest who joined is ready. Empty seats are filled with bots. */
  get canStart() { return !this.table && this.slots[0]?.link != null && this.slots.every((slot, seat) => seat === 0 || !slot || (slot.ready && !!slot.link)); }

  /** A new connection. Messages go to the returned handler until the link closes. */
  accept(link: TableLink): { receive(input: unknown): void; closed(): void } {
    let seat: number | null = null;
    const reject = (message: string, close = true) => { this.send(link, { type: 'reject', message }); if (close) setTimeoutSafe(this.clock, () => link.close(), 200); };
    return {
      receive: input => {
        try {
          if (this.closed) throw new Error('This room is closed.');
          const message = parseTableClientMessage(wire(input));
          if (message.type === 'pong') return;
          if (message.type === 'join') { seat = this.join(link, message); return; }
          if (seat === null || this.slots[seat]?.link !== link) throw new Error('Join the room first.');
          this.handle(seat, message);
        } catch (error) { reject(error instanceof Error ? error.message : 'Invalid table message.', seat === null); }
      },
      closed: () => { if (seat !== null && this.slots[seat]?.link === link) this.disconnect(seat); },
    };
  }

  private join(link: TableLink, message: Join): number {
    if (message.version !== NETWORK_VERSION || message.rules !== RULES_VERSION || message.content !== this.options.registry.version) throw new Error('Rules or card content differs. Everyone must use the same game build.');
    let seat = this.slots.findIndex(slot => slot?.token === message.token);
    if (seat < 0) {
      if (this.table) throw new Error('This draft has already started.');
      seat = this.slots.findIndex((slot, at) => at > 0 && !slot);
      if (seat < 0) throw new Error('This table is full.');
    }
    const previous = this.slots[seat];
    if (previous?.link && previous.link !== link) previous.link.close();
    if (previous?.away) this.clock.clearTimeout(previous.away);
    this.slots[seat] = { token: message.token, name: message.name, avatar: message.avatar, cardBack: message.cardBack, ready: previous?.ready ?? false, link, away: undefined };
    if (this.table) this.resumeLive(seat);
    this.publish();
    return seat;
  }
  /** The host's own browser takes seat 0 over a link that never leaves the page. */
  connectLocal(client: TableClient, profile: { token: string; name: string; avatar?: string; cardBack?: string }) {
    const handler = this.accept({ send: message => client.receive(message), close: () => undefined });
    client.attach(message => handler.receive(message));
    client.hello(profile);
    return handler;
  }

  private handle(seat: number, message: TableClientMessage) {
    const { registry, preset } = this.options, slot = this.slots[seat]!;
    switch (message.type) {
      case 'ready': if (this.table) return; slot.ready = message.ready; break;
      case 'pick': this.change(table => submitPick(table, preset, registry, seat, message.card)); return;
      case 'faction': this.change(table => submitFaction(table, preset, registry, seat, message.faction)); return;
      case 'deck': this.change(table => submitDeck(table, registry, seat, message.cards)); return;
      case 'result': this.report(seat, message.index, message.result); return;
      case 'leave': this.leave(seat); return;
      case 'match-join': this.joinLive(seat, message.index); return;
      case 'match': this.playLive(seat, message.index, message.message); return;
      default: return;
    }
    this.publish();
  }

  /** The host presses start: empty seats become bots, and the draft begins. */
  start(seed: number, id: string) {
    if (this.table) throw new Error('The draft has started.');
    if (!this.canStart) throw new Error('Wait until everyone is ready.');
    const [first, second] = botNamesFor(seed);
    let bots = 0;
    const seats = this.slots.map(slot => slot
      ? { name: slot.name, human: true, token: slot.token, avatar: slot.avatar, cardBack: slot.cardBack }
      : { name: bots++ === 0 ? first : second, human: false, token: '' });
    this.table = createTable(this.options.preset, this.options.registry, { id, seed, now: this.clock.now(), seats, faction: this.options.faction });
    this.publish();
  }

  private change(update: (table: DraftTable) => DraftTable) {
    if (!this.table) throw new Error('The draft has not started.');
    this.table = update(this.table);
    this.publish();
  }
  private report(seat: number, at: number, result: DraftResult) {
    const table = this.table, match = table?.matches[at];
    if (!table || !match || table.stage !== 'matches') throw new Error('There is no such match.');
    if (match.a !== seat && match.b !== seat) throw new Error('That is not your match.');
    const other = match.a === seat ? match.b : match.a;
    if (!botSeat(table, other)) throw new Error('A match against a person is reported by its own table.');
    const first = match.a === seat;
    this.table = recordTableResult(table, at, result === 'draw' ? 'draw' : (result === 'won') === first ? 'a' : 'b');
    this.publish();
  }

  /** A person leaves for good; a bot plays on in their seat. */
  private leave(seat: number) {
    const { preset, registry } = this.options;
    if (!this.table) { this.removeFromLobby(seat); return; }
    const slot = this.slots[seat];
    if (slot?.away) this.clock.clearTimeout(slot.away);
    const table: DraftTable = leaveSeat(this.table, preset, registry, seat);
    this.table = table;
    for (const at of [...this.live.keys()]) {
      const match = table.matches[at]!;
      if (match.a !== seat && match.b !== seat) continue;
      this.live.delete(at);
      const other = match.a === seat ? match.b : match.a;
      this.send(this.slots[other]?.link, { type: 'match', index: at, message: { type: 'reject', message: 'Your opponent left the draft. The match is yours.' } });
    }
    this.slots[seat]?.link?.close();
    if (this.slots[seat]) this.slots[seat]!.link = null;
    this.publish();
  }
  private removeFromLobby(seat: number) {
    const slot = this.slots[seat];
    if (!slot) return;
    if (seat === 0) { this.close('The host closed the room.'); return; }
    slot.link?.close(); this.slots[seat] = null; this.publish();
  }
  private disconnect(seat: number) {
    const slot = this.slots[seat]!;
    slot.link = null;
    if (!this.table) { if (seat === 0) this.close('The host left.'); else this.slots[seat] = null; this.publish(); return; }
    if (seat === 0) { this.close('The host left. The draft is over.'); return; }
    // Away: the pick timer keeps the table moving; after a while a bot keeps the seat for good.
    slot.away = this.clock.setTimeout(() => { if (!this.closed && this.slots[seat]?.link === null) this.leave(seat); }, this.awayMs);
    this.publish();
  }

  /* ---- live matches between two people ---- */
  private liveBetween(at: number, seat: number) {
    const table = this.table, match = table?.matches[at];
    if (!table || !match || table.stage !== 'matches') throw new Error('There is no such match.');
    if (match.a !== seat && match.b !== seat) throw new Error('That is not your match.');
    if (botSeat(table, match.a) || botSeat(table, match.b)) throw new Error('This match is not played live.');
    if (match.result) throw new Error('This match is over.');
    return { table, match };
  }
  private joinLive(seat: number, at: number) {
    const { table, match } = this.liveBetween(at, seat);
    const live: Live = this.live.get(at) ?? { authority: null, joined: new Set<number>() };
    live.joined.add(seat);
    if (!live.authority && live.joined.size === 2) {
      const a = table.seats[match.a]!, b = table.seats[match.b]!;
      live.authority = new MatchAuthority(this.options.registry, `${table.id}:${at}`, [{ name: a.name, cards: table.decks[match.a]! }, { name: b.name, cards: table.decks[match.b]! }], [a.name, b.name], match.seed, [a.avatar, b.avatar], [a.cardBack, b.cardBack], true);
    }
    this.live.set(at, live);
    if (live.authority) for (const member of [match.a, match.b]) this.sendSnapshot(at, member);
  }
  private resumeLive(seat: number) {
    for (const [at, live] of this.live) { const match = this.table!.matches[at]!; if (live.authority && (match.a === seat || match.b === seat)) this.sendSnapshot(at, seat); }
  }
  private sendSnapshot(at: number, seat: number, ack?: string, error?: string) {
    const live = this.live.get(at), table = this.table;
    if (!live?.authority || !table) return;
    this.send(this.slots[seat]?.link, { type: 'match', index: at, message: live.authority.snapshot(playerOf(table, at, seat), ack, error) });
  }
  private playLive(seat: number, at: number, message: ClientMessage) {
    const { table } = this.liveBetween(at, seat), live = this.live.get(at);
    if (!live?.authority) throw new Error('Wait for your opponent to join the match.');
    const mine = playerOf(table, at, seat);
    if (message.type === 'preview') { this.send(this.slots[seat]?.link, { type: 'match', index: at, message: { type: 'preview', id: message.id, forecast: live.authority.forecast(mine, message.draft) } }); return; }
    if (message.type !== 'action') return;
    const result = live.authority.act(mine, message.action);
    this.send(this.slots[seat]?.link, { type: 'match', index: at, message: result });
    const match = table.matches[at]!;
    this.sendSnapshot(at, match.a === seat ? match.b : match.a);
    const outcome = live.authority.fullState.outcome;
    if (outcome) {
      this.table = recordTableResult(table, at, outcome === 'p1' ? 'a' : outcome === 'p2' ? 'b' : 'draw');
      this.live.delete(at);
      this.publish();
    }
  }

  /* ---- broadcasting and timers ---- */
  private send(link: TableLink | null | undefined, message: TableHostMessage) { if (link) try { link.send(message); } catch { /* A broken link closes on its own. */ } }
  private publish() {
    this.schedule();
    const table = this.table;
    for (let seat = 0; seat < 3; seat++) {
      const link = this.slots[seat]?.link;
      if (!link) continue;
      if (!table) this.send(link, { type: 'lobby', lobby: this.lobby(), seat, code: this.options.code, preset: this.options.preset.id, faction: this.options.faction });
      else this.send(link, { type: 'table', run: viewFor(table, seat, { code: this.options.code, host: seat === 0, fee: this.options.preset.entryFee }), waiting: this.waitingNames(), mine: [...waitingOn(table), ...deckWaitingOn(table)].includes(seat), remaining: this.deadline === null ? null : Math.max(0, this.deadline - this.clock.now()), lobby: this.lobby() });
    }
  }
  private waitingNames() {
    const table = this.table;
    if (!table) return [];
    return [...waitingOn(table), ...deckWaitingOn(table)].map(seat => table.seats[seat]!.name);
  }
  /** One deadline per pick and one for deck building. It restarts whenever the table moves on. */
  private schedule() {
    const table = this.table;
    const key = !table ? '' : table.stage === 'draft' ? `d${table.draft.round}:${table.draft.step}:${table.draft.awaiting ? 'f' : 'p'}` : table.stage === 'build' ? 'b' : '';
    if (key === this.timerKey) return;
    this.timerKey = key;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null; this.deadline = null;
    if (!table || !key) return;
    const ms = table.stage === 'draft' ? this.pickMs : this.deckMs;
    this.deadline = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      const current = this.table;
      if (this.closed || !current) return;
      const { preset, registry } = this.options;
      this.table = current.stage === 'draft' ? autoPickAll(current, preset, registry) : current.stage === 'build' ? autoDeckAll(current, registry) : current;
      this.publish();
    }, ms);
  }

  get complete() { return !!this.table && tableComplete(this.table); }
  close(message = 'The room was closed.') {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) this.clock.clearTimeout(this.timer);
    for (const slot of this.slots) { if (slot?.away) this.clock.clearTimeout(slot.away); this.send(slot?.link, { type: 'closed', message }); }
  }
}
const setTimeoutSafe = (clock: TableClock, callback: () => void, ms: number) => clock.setTimeout(callback, ms);
const wire = (input: unknown) => { if (JSON.stringify(input).length > 1_000_000) throw new Error('Multiplayer message is too large.'); return input; };

/* ------------------------------------------------------------------------------------------------------------------ */

export type TableRoomState = {
  role: 'host' | 'guest'; code: string; seat: number | null;
  phase: 'connecting' | 'lobby' | 'table' | 'closed' | 'error';
  connected: boolean; message: string;
  /** The named draft this table plays, once the host has said so. */
  preset: string | null;
  /** The faction the table drafts first. */
  faction: string | null;
  lobby: LobbySeat[]; run: DraftRun | null; waiting: string[]; mine: boolean;
  /** When the current pick or deck runs out, on this machine's clock. */
  deadline: number | null;
  /** The latest snapshot of each live match this seat is in, by the match's place in the table's schedule. */
  matches: Record<number, { snapshot: MatchSnapshot | null; busy: boolean; message: string }>;
};

/** One person's side of the table. The host's own seat uses it too, over a link that stays inside the page. */
export class TableClient {
  private state: TableRoomState;
  private listeners = new Set<() => void>();
  private pending = new Map<number, MatchAction>();
  private previews = new Map<string, (forecast: Forecast) => void>();
  private send: (message: TableClientMessage) => void = () => undefined;
  /** Where this client's messages go; set by whoever owns the connection. */
  attach(send: (message: TableClientMessage) => void) { this.send = send; }
  constructor(role: 'host' | 'guest', code: string, private registry: Registry) {
    this.state = { role, code, seat: null, phase: 'connecting', connected: false, message: 'Connecting to the room…', preset: null, faction: null, lobby: [], run: null, waiting: [], mine: false, deadline: null, matches: {} };
  }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.state;
  private publish(patch: Partial<TableRoomState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }

  hello(profile: { token: string; name: string; avatar?: string; cardBack?: string }) {
    // Optional fields are left out rather than sent empty: not every serializer keeps `undefined` apart from `null`.
    this.send({ type: 'join', version: NETWORK_VERSION, rules: RULES_VERSION, content: this.registry.version, token: profile.token, name: profile.name, ...(profile.avatar ? { avatar: profile.avatar } : {}), ...(profile.cardBack ? { cardBack: profile.cardBack } : {}) });
  }
  /** Messages from the host. A broken one ends the connection rather than the page. */
  receive(input: unknown) {
    let message: TableHostMessage;
    try { message = parseTableHostMessage(wire(input)); } catch (error) { this.publish({ phase: 'error', connected: false, message: error instanceof Error ? error.message : 'Invalid host message.' }); return; }
    switch (message.type) {
      case 'ping': this.send({ type: 'pong' }); break;
      case 'lobby': this.publish({ phase: 'lobby', connected: true, seat: message.seat, preset: message.preset, faction: message.faction, lobby: message.lobby, message: 'Waiting for the host to start.' }); break;
      case 'table': this.publish({ phase: 'table', connected: true, seat: message.run.table!.seat, preset: message.run.preset, faction: message.run.draft.pod, run: message.run, waiting: message.waiting, mine: message.mine, deadline: message.remaining === null ? null : Date.now() + message.remaining, lobby: message.lobby, message: 'Connected' }); break;
      case 'closed': this.publish({ phase: 'closed', connected: false, message: message.message }); break;
      case 'reject': this.publish({ phase: this.state.run ? this.state.phase : 'error', connected: this.state.connected, message: message.message }); break;
      case 'match': this.receiveMatch(message.index, message.message); break;
    }
  }
  private receiveMatch(index: number, message: HostMessage) {
    const current = this.state.matches[index] ?? { snapshot: null, busy: false, message: '' };
    if (message.type === 'snapshot') {
      if (message.ack && message.ack === this.pending.get(index)?.id) this.pending.delete(index);
      this.publish({ matches: { ...this.state.matches, [index]: { snapshot: message, busy: this.pending.has(index), message: 'Connected' } } });
    } else if (message.type === 'reject') this.publish({ matches: { ...this.state.matches, [index]: { ...current, busy: false, message: message.message } } });
    else if (message.type === 'preview') { const resolve = this.previews.get(message.id); this.previews.delete(message.id); resolve?.(message.forecast); }
  }
  /** Nothing joined: the room does not exist, or cannot be reached. */
  fail(message: string) { if (this.state.phase !== 'closed') this.publish({ phase: this.state.run ? this.state.phase : 'error', connected: false, message }); }
  /** The link is gone. The table keeps the seat for a while; reconnecting is joining again with the same token. */
  lost(message: string) { if (this.state.phase !== 'closed' && this.state.phase !== 'error') this.publish({ connected: false, message }); }

  ready(ready: boolean) { this.send({ type: 'ready', ready }); }
  pick(card: string) { this.send({ type: 'pick', card }); }
  faction(faction: string) { this.send({ type: 'faction', faction }); }
  deck(cards: string[]) { this.send({ type: 'deck', cards }); }
  report(index: number, result: DraftResult) { this.send({ type: 'result', index, result }); }
  leave() { this.send({ type: 'leave' }); }
  joinMatch(index: number) { this.send({ type: 'match-join', index }); }
  forgetMatch(index: number) { const { [index]: _gone, ...rest } = this.state.matches; this.pending.delete(index); this.publish({ matches: rest }); }

  act(index: number, intent: MatchAction['intent']) {
    const snapshot = this.state.matches[index]?.snapshot;
    if (!snapshot || this.pending.has(index)) throw new Error('Wait for the previous move.');
    const action: MatchAction = { id: crypto.randomUUID(), revision: snapshot.view.revision, intent };
    this.pending.set(index, action);
    this.publish({ matches: { ...this.state.matches, [index]: { ...this.state.matches[index]!, busy: true } } });
    this.send({ type: 'match', index, message: { type: 'action', action } });
  }
  forecast(index: number, draft: AttackPreview | null): Promise<Forecast> {
    if (!draft?.attackers.length || !this.state.matches[index]?.snapshot) return Promise.resolve(null);
    return new Promise(resolve => {
      const id = crypto.randomUUID(), timer = setTimeout(() => { this.previews.delete(id); resolve(null); }, 4000);
      this.previews.set(id, forecast => { clearTimeout(timer); resolve(forecast); });
      this.send({ type: 'match', index, message: { type: 'preview', id, draft } });
    });
  }
}
export type { Command };
export { draftRules };
