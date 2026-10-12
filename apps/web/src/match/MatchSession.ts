import type { Command, CommandEnvelope, GameState, PlayerId, PlayerView, Registry } from '../../../../packages/contracts/src';
import { apply, decisionPlayer, projectForPlayer, replay } from '../../../../packages/core/src';
import { undoChannel, undoableChannels } from '../../../../packages/core/src/channelUndo';
import { presentationState, type MatchSnapshot } from '../../../../packages/multiplayer/src/protocol';
import type { RoomState } from '../multiplayer/RtcRoom';
import { localReplay, onlineReplay, parseReplay, type ReplayFile } from '../replayFile';

export type MatchFrame = { state: GameState; view: PlayerView };
export type MatchConnection = Pick<RoomState, 'role' | 'code' | 'connected' | 'busy' | 'message'>;
export type SessionSnapshot = {
  initial: GameState; state: GameState; commands: CommandEnvelope[];
  seat: PlayerId | null; matchId: string; revision: number; error?: string;
  historySteps: { who: PlayerId; label: string }[];
  connection: MatchConnection | null;
  forecast: MatchSnapshot['forecast'];
};

/** MatchApp consumes this reader for every mode. Full local engine state never comes from a remote session. */
export interface MatchSessionReader {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SessionSnapshot;
  frame: (index: number | null, viewer: PlayerId) => MatchFrame;
  undoable: (viewer: PlayerId) => string[];
  leave: () => void;
}
export type MatchSession = LocalMatchSession | OnlineMatchSession | ReplayMatchSession;
export type ExternalMatchSession = OnlineMatchSession | ReplayMatchSession;
export type OnlineRoom = Pick<import('../multiplayer/RtcRoom').RtcRoom, 'subscribe' | 'getSnapshot' | 'act' | 'undoChannel' | 'reconnect' | 'leave'>;
const clamp = (index: number, length: number) => Math.max(0, Math.min(index, length));
const eventSeq = (snapshot: MatchSnapshot) => snapshot.view.events.at(-1)?.seq ?? 0;
const recordedSteps = (history: MatchSnapshot[]) => history.slice(1).map((snapshot, index) => ({
  who: snapshot.view.active,
  label: snapshot.view.events.filter(event => event.seq > eventSeq(history[index])).at(-1)?.message ?? 'Update',
}));

export class LocalMatchSession implements MatchSessionReader {
  readonly kind = 'local';
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot;
  constructor(initial: GameState, commands: CommandEnvelope[], private registry: Registry) {
    this.snapshot = this.createSnapshot(initial, commands);
  }
  private createSnapshot(initial: GameState, commands: CommandEnvelope[], registry = this.registry): SessionSnapshot {
    return { initial, commands, state: replay(initial, commands, registry), seat: null, matchId: '',
      revision: commands.length, historySteps: commands.map(envelope => ({ who: envelope.actor, label: envelope.command.type })),
      connection: null, forecast: null };
  }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.snapshot;
  private publish(snapshot: SessionSnapshot) { this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  reset(initial: GameState, commands: CommandEnvelope[] = [], registry = this.registry) {
    const next = this.createSnapshot(initial, commands, registry);
    this.registry = registry;
    this.publish(next);
  }
  act(command: Command) {
    const { state, commands } = this.snapshot;
    const envelope: CommandEnvelope = { actor: decisionPlayer(state), expectedRevision: state.revision, command, clientActionId: `local-${crypto.randomUUID()}` };
    const result = apply(state, envelope, this.registry);
    if (result.error) throw new Error(result.error);
    this.publish({ ...this.snapshot, state: result.state, commands: [...commands, envelope], revision: this.snapshot.revision + 1,
      historySteps: [...this.snapshot.historySteps, { who: envelope.actor, label: command.type }] });
  }
  undoChannel(cardId: string, viewer: PlayerId) {
    const result = undoChannel(this.snapshot.initial, this.snapshot.commands, viewer, cardId, this.registry);
    if (!result) throw new Error('This energy is committed and cannot be undone.');
    const next = this.createSnapshot(this.snapshot.initial, result.commands);
    this.publish({ ...next, state: result.state, revision: this.snapshot.revision + 1 });
  }
  undoable(viewer: PlayerId) { return undoableChannels(this.snapshot.commands, viewer); }
  frame(index: number | null, viewer: PlayerId): MatchFrame {
    const { initial, commands, state: current } = this.snapshot;
    const state = index === null ? current : replay(initial, commands.slice(0, clamp(index, commands.length)), this.registry);
    return { state, view: projectForPlayer(state, viewer, this.registry) };
  }
  project(state: GameState, viewer: PlayerId) { return projectForPlayer(state, viewer, this.registry); }
  exportReplay(viewer: PlayerId, matchId: string) { return localReplay(this.snapshot.initial, this.snapshot.commands, viewer, this.registry, matchId); }
  leave() {}
}

export class OnlineMatchSession implements MatchSessionReader {
  readonly kind = 'online';
  private listeners = new Set<() => void>();
  private history: MatchSnapshot[] = [];
  private snapshot: SessionSnapshot;
  private unsubscribe: () => void;
  constructor(private room: OnlineRoom) {
    const first = room.getSnapshot().snapshot;
    if (!first) throw new Error('Join a match before creating an online session.');
    this.history = [first];
    const initial = presentationState(first);
    this.snapshot = { initial, state: initial, commands: [], seat: first.seat, matchId: first.matchId,
      revision: first.view.revision, historySteps: [], connection: room.getSnapshot(), forecast: first.forecast, error: first.error };
    this.unsubscribe = room.subscribe(() => this.receive());
  }
  private receive() {
    const connection = this.room.getSnapshot(), next = connection.snapshot;
    if (next) {
      const last = this.history.at(-1)!;
      // Retries refresh a frame. Channel undo drops the branch of history that was undone.
      this.history = last.view.revision === next.view.revision ? [...this.history.slice(0, -1), next]
        : [...this.history.filter(frame => eventSeq(frame) < eventSeq(next)), next];
      this.snapshot = { ...this.snapshot, state: presentationState(next), seat: next.seat, revision: next.view.revision,
        historySteps: recordedSteps(this.history), forecast: next.forecast, error: next.error, connection };
    } else this.snapshot = { ...this.snapshot, connection };
    for (const listener of this.listeners) listener();
  }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.snapshot;
  frame(index: number | null, _viewer: PlayerId): MatchFrame {
    const snapshot = this.history[index === null ? this.history.length - 1 : clamp(index, this.history.length - 1)];
    return { state: presentationState(snapshot), view: snapshot.view };
  }
  undoable(_viewer: PlayerId) { return this.history.at(-1)!.undoable; }
  act(command: Command) { this.room.act(command); }
  undoChannel(cardId: string, _viewer: PlayerId) { this.room.undoChannel(cardId); }
  reconnect() { this.room.reconnect(); }
  exportReplay(_viewer: PlayerId, _matchId: string) { return onlineReplay(this.history, this.snapshot.seat!); }
  leave() { this.unsubscribe(); this.room.leave(); this.listeners.clear(); }
}

/** A recording has no connection or command methods, and cannot earn rewards. */
export class ReplayMatchSession implements MatchSessionReader {
  readonly kind = 'replay';
  private snapshot: SessionSnapshot;
  constructor(private file: ReplayFile) {
    const first = file.steps[0], last = file.steps.at(-1)!;
    this.snapshot = { initial: presentationState(first), state: presentationState(last), commands: [], seat: file.seat,
      matchId: file.matchId, revision: last.view.revision, historySteps: recordedSteps(file.steps), connection: null, forecast: null };
  }
  static fromText(text: string, registry: Registry) { return new ReplayMatchSession(parseReplay(text, registry)); }
  readonly subscribe = (_listener: () => void) => () => {};
  readonly getSnapshot = () => this.snapshot;
  frame(index: number | null, _viewer: PlayerId): MatchFrame {
    const snapshot = this.file.steps[index === null ? this.file.steps.length - 1 : clamp(index, this.file.steps.length - 1)];
    return { state: presentationState(snapshot), view: snapshot.view };
  }
  undoable(_viewer: PlayerId) { return []; }
  leave() {}
}
