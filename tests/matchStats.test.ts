import { describe, expect, it } from 'vitest';
import { replay } from '../packages/core/src';
import { recordedRegistry as registry } from './fixtures/recordedMatch';
import { matchStats } from '../apps/web/src/matchStats';
import { existsSync, readFileSync } from 'fs';

const fixture = 'tests/fixtures/matches/mercenaries-turn-9';
describe('match stats', () => {
  it('counts a recorded match from its event log', () => {
    expect(existsSync(fixture)).toBe(true);
    const match = JSON.parse(readFileSync(`${fixture}/match.json`, 'utf8'));
    const state = replay(match.initial, match.commands ?? match.log, registry);
    const stats = matchStats(state, registry);
    for (const id of ['p1', 'p2'] as const) {
      const log = state.events;
      expect(stats[id].cardsPlayed).toBe(log.filter(e => (e.type === 'card.played' || e.type === 'spell.cast') && e.player === id).length);
      expect(stats[id].creaturesLost).toBe(stats[id === 'p1' ? 'p2' : 'p1'].creaturesDestroyed);
      expect(stats[id].fallen).toHaveLength(stats[id].creaturesLost);
      expect(stats[id].faceDamage).toBeLessThanOrEqual(stats[id].damageDealt);
    }
    // Life lost can only come from damage the other side dealt (before any healing).
    const lost = (id: 'p1' | 'p2') => state.events.filter(e => e.type === 'damage.dealt' && e.target === id).reduce((n, e) => n + (e.amount ?? 0), 0);
    expect(stats.p1.faceDamage).toBe(lost('p2')); expect(stats.p2.faceDamage).toBe(lost('p1'));
    expect(stats.p1.damageDealt + stats.p2.damageDealt).toBeGreaterThan(0);
  });
});
