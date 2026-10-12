import { describe, expect, it } from 'vitest';
import { apply, projectForPlayer, replay } from '../packages/core/src';
import { presentationState, type MatchSnapshot } from '../packages/multiplayer/src/protocol';
import { registry } from '../packages/content/src';
import { buildAftermath, buildArrival, buildClash } from '../apps/web/src/combatReplay';
import { readFileSync, existsSync } from 'fs';

const fixture = 'tests/fixtures/matches/mercenaries-turn-9';
describe('combat replay', () => {
  it('replays each exchange and ends on the same board the engine produced', () => {
    if (!existsSync(fixture)) return;
    // Find the first confirm-combat in the recorded match and rebuild its steps.
    const dir = readFileSync(`${fixture}/match.json`, 'utf8');
    const match = JSON.parse(dir);
    const commands = match.commands ?? match.log ?? [];
    let found = 0;
    for (let i = 0; i < commands.length; i++) {
      if (commands[i].command.type !== 'confirm-combat') continue;
      const pre = replay(match.initial, commands.slice(0, i), registry);
      const result = apply(pre, commands[i], registry);
      expect(result.error).toBeUndefined();
      const steps = buildClash(pre, result.events, registry);
      expect(steps.length).toBeGreaterThan(0);
      const last = steps.at(-1)!.state;
      // Whatever the replay shows at the end must agree with the real result on every board slot and life total.
      // The fallen stay on the board through their own death beat, so only they may differ.
      const fallen = new Set(steps.flatMap(step => step.poses.filter(pose => pose.mode === 'die').map(pose => pose.id)));
      for (const id of ['p1', 'p2'] as const) {
        expect(last.players[id].board.map(card => card && fallen.has(card) ? null : card), `board ${id}`).toEqual(result.state.players[id].board);
        expect(last.players[id].life, `life ${id}`).toBe(result.state.players[id].life);
      }
      found++;
    }
    expect(found).toBeGreaterThan(0);
  });
  it('shows damage numbers for non-combat damage, with the fallen still on the board when they are hit', () => {
    if (!existsSync(fixture)) return;
    const match = JSON.parse(readFileSync(`${fixture}/match.json`, 'utf8'));
    const commands = match.commands ?? match.log ?? [];
    let checked = 0;
    for (let i = 0; i < commands.length; i++) {
      const type = commands[i].command.type;
      if (type === 'confirm-combat') continue;
      const pre = replay(match.initial, commands.slice(0, i), registry);
      const result = apply(pre, commands[i], registry);
      if (result.error) continue;
      const steps = buildAftermath(result.state, result.events, registry);
      if (!steps.length) continue;
      expect(steps.some(step => step.pops.some(pop => pop.text.startsWith('−') || pop.text.startsWith('+')))).toBe(true);
      // Every card a step moves is a real card that is on the board in that step's state.
      for (const step of steps) for (const pose of step.poses) expect(step.state.cards[pose.id].zone).toBe('board');
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('lets a played creature settle in place', () => {
    if (!existsSync(fixture)) return;
    const match = JSON.parse(readFileSync(`${fixture}/match.json`, 'utf8'));
    const commands = match.commands ?? match.log ?? [];
    const i = commands.findIndex((c: any) => c.command.type === 'play' && registry.cards[replay(match.initial, commands.slice(0, 1), registry).cards[c.command.cardId]?.definitionId ?? '']?.type !== 'spell');
    expect(i).toBeGreaterThanOrEqual(0);
    const pre = replay(match.initial, commands.slice(0, i), registry);
    const result = apply(pre, commands[i], registry);
    const steps = buildArrival(result.state, commands[i].command.cardId);
    if (steps.length) expect(steps[0].poses[0].mode).toBe('arrive');
  });
  it('builds the same fight from online snapshots, which only hold a player view', () => {
    if (!existsSync(fixture)) return;
    const match = JSON.parse(readFileSync(`${fixture}/match.json`, 'utf8'));
    const commands = match.commands ?? match.log ?? [];
    const snap = (state: Parameters<typeof projectForPlayer>[0]): MatchSnapshot => ({ type: 'snapshot', version: 1, matchId: 't', seat: 'p1', view: projectForPlayer(state, 'p1', registry), undoable: [], forecast: null });
    let found = 0;
    for (let i = 0; i < commands.length; i++) {
      if (commands[i].command.type !== 'confirm-combat') continue;
      const pre = replay(match.initial, commands.slice(0, i), registry);
      const result = apply(pre, commands[i], registry);
      const before = snap(pre), after = snap(result.state);
      const oldSeq = before.view.events.at(-1)?.seq ?? 0;
      const events = after.view.events.filter(event => event.seq > oldSeq);
      const steps = buildClash(presentationState(before), events, registry);
      expect(steps.length).toBeGreaterThan(0);
      const last = steps.at(-1)!.state, fallen = new Set(steps.flatMap(step => step.poses.filter(pose => pose.mode === 'die').map(pose => pose.id)));
      for (const id of ['p1', 'p2'] as const) {
        expect(last.players[id].board.map(card => card && fallen.has(card) ? null : card)).toEqual(after.view.players[id].board);
        expect(last.players[id].life).toBe(after.view.players[id].life);
      }
      found++;
    }
    expect(found).toBeGreaterThan(0);
  });
});
