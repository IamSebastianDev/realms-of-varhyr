import type { GameState, PlayerId, Registry } from '../../contracts/src';
import { energyProductionOptions } from './production';
import { effectiveStats, other } from './index';

/**
 * A fixed-length picture of a position from one player's side, for the learned evaluator. It uses only what that
 * player may know: both boards, both life totals and hand sizes, and their own hand.
 */
const SLOTS = 5;
const PER_SLOT = 4;
export const FEATURE_COUNT = 10 + 2 * (SLOTS * PER_SLOT + 4) + 5;
const cost = (def: { cost: { generic: number; factions: Record<string, number> } }) => def.cost.generic + Object.values(def.cost.factions).reduce((a, b) => a + b, 0);

export function features(state: GameState, actor: PlayerId, registry: Registry): number[] {
  const out: number[] = [], foe = other(actor), me = state.players[actor], them = state.players[foe];
  out.push(me.life / 10, them.life / 10, me.hand.length / 8, them.hand.length / 8, me.deck.length / 30, them.deck.length / 30, state.turn / 20, state.active === actor ? 1 : 0, me.discard.length / 10, them.discard.length / 10);
  const colors = (id: string) => new Set(registry.cards[state.cards[id].definitionId].stats!.energyOutputs.flatMap(pool => Object.keys(pool).filter(color => color !== 'neutral')));
  for (const player of [me, them]) {
    let creatures = 0, attack = 0, defense = 0; const seen = new Set<string>();
    player.board.forEach((id, slot) => {
      if (slot >= SLOTS) return;
      if (!id) { out.push(0, 0, 0, 0); return; }
      const stats = effectiveStats(state, id, registry), def = registry.cards[state.cards[id].definitionId], outputs = energyProductionOptions(def, registry);
      const output = Math.max(0, ...(outputs.length ? outputs : [{}]).map(pool => Object.values(pool).reduce((a, b) => a + b, 0)));
      out.push(1, stats.attack / 5, Math.max(0, stats.defense - state.cards[id].damage) / 6, output / 3);
      creatures++; attack += stats.attack; defense += Math.max(0, stats.defense - state.cards[id].damage);
      for (const color of colors(id)) seen.add(color);
    });
    out.push(creatures / 5, attack / 15, defense / 20);
    out.push(seen.size / 3);
  }
  const hand = me.hand.map(id => registry.cards[state.cards[id].definitionId]);
  const dead = me.hand.filter(id => registry.cards[state.cards[id].definitionId].type === 'creature' && effectiveStats(state, id, registry).defense <= 0).length;
  out.push(hand.filter(def => def.type === 'creature').length / 6, hand.filter(def => def.type === 'spell').length / 6, hand.reduce((n, def) => n + cost(def), 0) / 20, hand.filter(def => cost(def) <= 1).length / 6, dead / 4);
  return out.slice(0, FEATURE_COUNT).concat(Array(Math.max(0, FEATURE_COUNT - out.length)).fill(0));
}
