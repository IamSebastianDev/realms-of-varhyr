import { describe, expect, it } from 'vitest';
import { battleLog } from '../apps/web/src/logEntries';
import { apply, decisionPlayer, projectForPlayer } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { registry, starterDecks } from './fixtures/content';
import { createMatch } from '../packages/core/src';

function play(turns: number) {
  let s = createMatch(registry, [starterDecks.verdant, starterDecks.hollow], 731, { mulligan: true });
  for (let i = 0; i < 400 && s.turn < turns && !s.outcome; i++) s = apply(s, { actor: decisionPlayer(s), expectedRevision: s.revision, command: botCommand(s, registry) }, registry).state;
  return s;
}

describe('battle log', () => {
  const state = play(6), view = projectForPlayer(state, 'p1', registry), log = battleLog(view.events, view.cards);
  it('keeps the story and drops bookkeeping events', () => {
    expect(log.some(e => e.kind === 'turn')).toBe(true);
    expect(log.some(e => e.kind === 'play')).toBe(true);
    expect(log.filter(e => /phase|Death energy expires|automatically/i.test(e.text))).toEqual([]);
    expect(log.find(e => e.kind === 'turn')?.text).toBe('Turn 1 begins.');
  });
  it('merges consecutive energy channels from one player', () => {
    const energy = log.filter(e => e.kind === 'energy');
    expect(energy.length).toBeGreaterThan(0);
    for (let i = 1; i < log.length; i++) expect(log[i].kind === 'energy' && log[i - 1].kind === 'energy' && log[i].player === log[i - 1].player).toBe(false);
  });
  it('names the card on both sides of a block and the source of damage', () => {
    const block = log.find(e => e.kind === 'block'), hit = log.find(e => e.kind === 'damage' && / from /.test(e.text));
    expect(block?.text).toMatch(/ blocks .+\./);
    expect(hit).toBeDefined();
  });
  it("never leaks the opponent's private draws", () => {
    const other = projectForPlayer(state, 'p2', registry), mine = battleLog(view.events, view.cards).filter(e => e.kind === 'draw');
    expect(mine.every(e => e.player === 'p1')).toBe(true);
    expect(battleLog(other.events, other.cards).filter(e => e.kind === 'draw').every(e => e.player === 'p2')).toBe(true);
  });
});
