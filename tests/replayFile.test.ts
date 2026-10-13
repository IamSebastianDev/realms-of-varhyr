import { describe, expect, it } from 'vitest';
import { apply, replay } from '../packages/core/src';
import { recordedRegistry as registry } from './fixtures/recordedMatch';
import { localReplay, onlineReplay, parseReplay } from '../apps/web/src/replayFile';
import { ReplayMatchSession } from '../apps/web/src/match/MatchSession';
import { readFileSync } from 'fs';

const match = JSON.parse(readFileSync('tests/fixtures/matches/mercenaries-turn-9/match.json', 'utf8'));
const commands = match.commands ?? match.log;

describe('replay file', () => {
  const file = localReplay(match.initial, commands, 'p1', registry, 'm-1');
  it('has one step per command plus the start, and survives a save and load', () => {
    expect(file.steps).toHaveLength(commands.length + 1);
    const loaded = parseReplay(JSON.stringify(file), registry);
    expect(loaded.steps.at(-1)!.view.revision).toBe(file.steps.at(-1)!.view.revision);
    expect(new ReplayMatchSession(loaded).frame(null,'p1').view).toBe(loaded.steps.at(-1)!.view);
  });
  it('holds only what the seat could see, at every step', () => {
    let state = structuredClone(match.initial);
    const text = JSON.stringify(file);
    expect(text).not.toContain('"seed"');
    expect(text).not.toContain('"rng"');
    file.steps.forEach((step, i) => {
      if (i) state = apply(state, commands[i - 1], registry).state;
      for (const id of state.players.p2.hand) expect(Object.keys(step.view.cards), `step ${i}`).not.toContain(id);
      for (const id of state.players.p2.deck) expect(Object.keys(step.view.cards), `step ${i}`).not.toContain(id);
      expect(step.view.hand).toEqual(state.players.p1.hand);
      expect(step.view.players.p2.deckCount).toBe(state.players.p2.deck.length);
    });
  });
  it('is the same file from an online history as from a local match', () => {
    const online = onlineReplay(file.steps, 'p1');
    expect(online.steps.map(s => s.view.players.p2.board)).toEqual(file.steps.map(s => s.view.players.p2.board));
    expect(online.steps.at(-1)!.view.players.p1.life).toBe(replay(match.initial, commands, registry).players.p1.life);
  });
  it('refuses files that are not replays or are from another version', () => {
    expect(() => parseReplay('nope', registry)).toThrow('not a replay');
    expect(() => parseReplay(JSON.stringify({ ...file, rules: 'old' }), registry)).toThrow('different version');
    expect(() => parseReplay(JSON.stringify({ ...file, steps: [{ type: 'snapshot' }] }), registry)).toThrow();
  });
});
