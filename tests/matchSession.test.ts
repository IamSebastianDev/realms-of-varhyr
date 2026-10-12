import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { apply, projectForPlayer, replay } from '../packages/core/src';
import { registry } from '../packages/content/src';
import type { Command, CommandEnvelope, GameState } from '../packages/contracts/src';
import { LocalMatchSession, OnlineMatchSession, ReplayMatchSession, type OnlineRoom } from '../apps/web/src/match/MatchSession';
import { localReplay } from '../apps/web/src/replayFile';
import type { RoomState } from '../apps/web/src/multiplayer/RtcRoom';

const fixture = JSON.parse(readFileSync('tests/fixtures/matches/mercenaries-turn-9/match.json', 'utf8'));
const initial: GameState = fixture.initial;
const commands: CommandEnvelope[] = fixture.commands ?? fixture.log;
const recording = () => localReplay(initial, commands, 'p1', registry, 'recorded-match');

class TestRoom implements OnlineRoom {
  listeners = new Set<() => void>();
  moves: Command[] = [];
  closed = false;
  reconnects = 0;
  undone: string[] = [];
  constructor(private state: RoomState) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  publish(patch: Partial<RoomState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  act(command: Command) { this.moves.push(command); }
  undoChannel(cardId: string) { this.undone.push(cardId); }
  reconnect() { this.reconnects++; }
  leave() { this.closed = true; }
}
function roomWithFirstFrame() {
  return new TestRoom({ role: 'guest', code: 'ABCDEFGH', phase: 'playing', connected: true, busy: false, message: 'Connected', snapshot: recording().steps[0] });
}

describe('match sessions', () => {
  it('local play uses the same actor, rules and final state as direct engine commands', () => {
    const session = new LocalMatchSession(initial, [], registry);
    let expected = initial;
    for (const envelope of commands) {
      const result = apply(expected, envelope, registry);
      expect(result.error).toBeUndefined();
      expected = result.state;
      session.act(envelope.command);
    }
    expect(session.getSnapshot().state).toEqual(expected);
    expect(session.getSnapshot().historySteps).toHaveLength(commands.length);
    expect(session.frame(0, 'p1').state).toEqual(initial);
    expect(session.frame(null, 'p2').view).toEqual(projectForPlayer(expected, 'p2', registry));
    expect(session.exportReplay('p2', 'local-match').seat).toBe('p2');
  });
  it('invalid local commands leave the snapshot and listeners unchanged', () => {
    const session = new LocalMatchSession(initial, [], registry), before = session.getSnapshot();
    let changes = 0;
    session.subscribe(() => changes++);
    expect(() => session.act({ type: 'energy', cardId: 'missing', option: 0 })).toThrow();
    expect(session.getSnapshot()).toBe(before);
    expect(changes).toBe(0);
  });
  it('local channel undo removes the command, rewinds history, and leaves a committed play alone', () => {
    const index = commands.findIndex(envelope => envelope.actor === 'p1' && envelope.command.type === 'energy');
    const throughChannel = commands.slice(0, index + 1);
    const session = new LocalMatchSession(initial, throughChannel, registry);
    const channel = commands[index].command;
    if (channel.type !== 'energy') throw new Error('Fixture needs channeling.');
    expect(session.undoable('p1')).toContain(channel.cardId);
    const revision = session.getSnapshot().revision;
    session.undoChannel(channel.cardId, 'p1');
    expect(session.getSnapshot().state).toEqual(replay(initial, commands.slice(0, index), registry));
    expect(session.getSnapshot().historySteps).toHaveLength(index);
    expect(session.getSnapshot().revision).toBeGreaterThan(revision);
    session.reset(initial, commands);
    const before = session.getSnapshot();
    expect(() => session.undoChannel(channel.cardId, 'p1')).toThrow();
    expect(session.getSnapshot()).toBe(before);
  });
  it('a content update replaces the local registry when a match is restarted', () => {
    const session = new LocalMatchSession(initial, [], registry);
    const updated = { ...registry, version: 'updated-content' };
    const next = { ...structuredClone(initial), contentVersion: updated.version };
    session.reset(next, [], updated);
    expect(session.frame(null, 'p1').view.contentVersion).toBe(updated.version);
    session.act(commands[0].command);
    expect(session.getSnapshot().commands).toHaveLength(1);
  });
  it('online commands go to the room and never advance the engine speculatively', () => {
    const room = roomWithFirstFrame(), session = new OnlineMatchSession(room), before = session.getSnapshot();
    session.act(commands[0].command);
    expect(room.moves).toEqual([commands[0].command]);
    expect(session.getSnapshot()).toBe(before);
    room.publish({ snapshot: recording().steps[1] });
    expect(session.getSnapshot().historySteps).toHaveLength(1);
    expect(session.frame(null, 'p2').view).toEqual(recording().steps[1].view); // A caller cannot change the received seat.
    expect(session.getSnapshot().state.rng).toBe(0);
    expect(session.getSnapshot().state.players.p2.hand).toEqual([]);
    expect(session.exportReplay('p2', 'ignored').seat).toBe('p1');
  });
  it('online retries do not duplicate frames; undo replaces the recorded branch', () => {
    const room = roomWithFirstFrame(), session = new OnlineMatchSession(room), steps = recording().steps;
    room.publish({ snapshot: steps[1] }); room.publish({ snapshot: steps[2] }); room.publish({ snapshot: steps[2] });
    expect(session.getSnapshot().historySteps).toHaveLength(2);
    const undone = structuredClone(steps[1]); undone.view.revision = steps[2].view.revision + 1;
    room.publish({ snapshot: undone });
    expect(session.exportReplay('p1', '').steps).toHaveLength(2);
    expect(session.frame(null, 'p1').view).toEqual(undone.view);
  });
  it('online disconnect and reconnect change connection status without losing the board', () => {
    const room = roomWithFirstFrame(), session = new OnlineMatchSession(room);
    const before = session.frame(null, 'p1').view;
    room.publish({ connected: false, message: 'Disconnected' });
    expect(session.getSnapshot().connection?.connected).toBe(false);
    expect(session.frame(null, 'p1').view).toEqual(before);
    session.reconnect(); expect(room.reconnects).toBe(1);
    session.undoChannel('channel-card', 'p2'); expect(room.undone).toEqual(['channel-card']);
    session.leave(); expect(room.closed).toBe(true); expect(room.listeners.size).toBe(0);
  });
  it('a replay is explicitly read-only, has no connection, and preserves its seat through review', () => {
    const file = recording(), session = ReplayMatchSession.fromText(JSON.stringify(file), registry);
    expect(session.kind).toBe('replay');
    expect(session.getSnapshot().connection).toBeNull();
    expect('act' in session).toBe(false); expect('reconnect' in session).toBe(false);
    expect(session.undoable('p1')).toEqual([]);
    expect(session.frame(0, 'p2').view).toEqual(file.steps[0].view);
    expect(session.frame(null, 'p2').view).toEqual(file.steps.at(-1)!.view);
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });
});
