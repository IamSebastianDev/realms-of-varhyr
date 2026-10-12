import type { MatchSnapshot } from '../../../../packages/multiplayer/src/protocol';
import type { Registry } from '../../../../packages/contracts/src';
import { parseReplay, type ReplayFile } from '../replayFile';
import type { RoomState } from './RtcRoom';

/** A finished match standing in for a live room: the same board and review tools, with nobody to move. */
export class ReplayRoom {
  readonly watching = true;
  readonly history: MatchSnapshot[];
  readonly code = 'REPLAY';
  private readonly state: RoomState;
  private readonly listeners = new Set<() => void>();
  constructor(file: ReplayFile) {
    this.history = file.steps;
    this.state = { role: 'guest', code: this.code, phase: 'playing', connected: true, busy: false, message: 'Watching a replay.', snapshot: file.steps.at(-1)! };
  }
  static fromText(text: string, registry: Registry) { return new ReplayRoom(parseReplay(text, registry)); }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.state;
  act(): never { throw new Error('This is a replay.'); }
  undoChannel(): never { throw new Error('This is a replay.'); }
  reconnect() {}
  leave() {}
}
